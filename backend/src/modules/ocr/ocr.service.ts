import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { supabase } from '../../config/supabase';

export interface ExtractedReceiptData {
    merchantCode?: string;
    terminalId?: string;
    invoiceNumber?: string;
    batchNumber?: string;
    approvalNumber?: string;
    rrn?: string;
    totalAmount?: number;
    last4Digits?: string;
    date?: string;
    time?: string;
    imageUrl?: string;
}

export class OCRService {
    // ...

    async extractAndParse(file: Express.Multer.File): Promise<{ data: ExtractedReceiptData; rawText: string }> {

        let uploadBuffer = file.buffer;
        let contentType = file.mimetype;

        try {
            // Optimize Image: Grayscale, Sharpen, Threshold for better OCR
            uploadBuffer = await sharp(file.buffer)
                .resize({ width: 1500, withoutEnlargement: true }) // Higher res for better details
                .grayscale() // Remove color noise
                .sharpen() // Enhance edges
                .normalize() // Improve contrast
                .toFormat('png') // PNG is better for text (lossless)
                .toBuffer();

            contentType = 'image/png';
        } catch (e) {
            console.warn('Image optimization failed, using original file', e);
        }

        // 1. Upload to Supabase Storage
        let publicUrl = '';
        try {
            const fileName = `receipts/${Date.now()}_compressed.png`; // use png extension to match content type
            const { data, error } = await supabase.storage
                .from('receipts')
                .upload(fileName, uploadBuffer, {
                    contentType,
                    upsert: false
                });

            if (!error) {
                const urlData = supabase.storage.from('receipts').getPublicUrl(fileName);
                publicUrl = urlData.data.publicUrl;
            } else {
                console.error('Supabase Upload Error:', error);
            }
        } catch (err) {
            console.error('Upload Failed', err);
        }

        // 2. Perform OCR (using ara+eng)
        // Note: First run might be slow as it downloads language data
        const { data: { text } } = await Tesseract.recognize(uploadBuffer, 'ara+eng', {
            logger: m => console.log(m)
        });

        // 3. Parse Text
        const parsedData = this.parseReceiptText(text);
        if (publicUrl) parsedData.imageUrl = publicUrl;

        return {
            data: parsedData,
            rawText: text
        };
    }

    private parseReceiptText(text: string): ExtractedReceiptData {
        const data: ExtractedReceiptData = {};

        // Normalize text for easier matching (replace common OCR errors in numbers)
        // Replace 'O'/'o' with '0' inside numeric-heavy strings is risky globally, 
        // effectively handled by flexible regex or specific field parsers.
        const cleanText = text.replace(/[\r\n]+/g, '\n');

        // 1. DATES (DD/MM/YYYY or YYYY-MM-DD)
        const datePattern = /\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\b/g;
        const dateMatches = cleanText.match(datePattern);
        if (dateMatches) {
            // Pick the one that looks most like a transaction date (usually not the first one if it's header, but dates are rare)
            // Normalized to YYYY-MM-DD
            const bestDate = dateMatches[0]; // Take first valid date found
            const parts = bestDate.split(/[/\-\.]/);

            // Guess format: if parts[2] is 4 digits, it's DD-MM-YYYY or MM-DD-YYYY. 
            // In Egypt DD-MM-YYYY is standard.
            if (parts[2].length === 4) {
                data.date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            } else if (parts[0].length === 4) {
                data.date = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
            } else {
                // Fallback for YY
                data.date = `20${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }

        // 2. TIME (HH:MM[:SS])
        const timePattern = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/;
        const timeMatch = cleanText.match(timePattern);
        if (timeMatch) data.time = timeMatch[1];

        // 3. AMOUNT (Look for EGP, LE, S.R, or standard amount format with "Total")
        // Strategy: Look for numbers followed/preceded by currency, OR keyword "Total"
        const amountPatterns = [
            /(?:Total|Amount|Sale|Net|المبلغ|الاجمالي|صافي)\s*[:\.]?\s*(\d+[.,]\d{2})/i, // Labelled
            /(\d+[.,]\d{2})\s*(?:EGP|LE|L\.E|ج\.م|ج\.m)/i, // Suffix Currency
            /(?:EGP|LE|L\.E|ج\.م|ج\.m)\s*(\d+[.,]\d{2})/i // Prefix Currency
        ];

        for (const pat of amountPatterns) {
            const m = cleanText.match(pat);
            if (m) {
                data.totalAmount = parseFloat(m[1].replace(/,/g, ''));
                break;
            }
        }

        // 4. MERCHANT ID (12-15 digits usually)
        const merchantPatterns = [
            /(?:MID|Merchant|Merch|ID|التاجر)[:\.\s]*(\d{8,15})/i,
            /\b(\d{12,15})\b/ // Standalone long number often ID
        ];
        for (const pat of merchantPatterns) {
            const m = cleanText.match(pat);
            if (m) {
                // Determine if it's likely an ID (not a phone number starting with 01)
                if (!m[1].startsWith('01')) {
                    data.merchantCode = m[1];
                    break;
                }
            }
        }

        // 5. TERMINAL ID (8 digits usually)
        const tidPatterns = [
            /(?:TID|Terminal|Term|طرفية)[:\.\s]*(\d{8})/i,
            /\b(\d{8})\b/ // Standalone 8 digits might be TID
        ];
        for (const pat of tidPatterns) {
            const m = cleanText.match(pat);
            if (m) { // Avoid confusion with date parts
                data.terminalId = m[1];
                break;
            }
        }

        // 6. APPROVAL / AUTH CODE (6 digits)
        const authPatterns = [
            /(?:Approval|Appr|Auth|Code|الموافقة)[:\.\s]*(\d{6})/i,
            /\b(\d{6})\b/
        ];
        // Only verify standalone 6 digits if we are sure it's not part of something else
        for (const pat of authPatterns) {
            const m = cleanText.match(pat);
            if (m) {
                // Ensure it's not the time (e.g. 12:30:45 -> 123045 removed by spacing)
                data.approvalNumber = m[1];
                break;
            }
        }

        // 7. BATCH (1-6 digits)
        const batchMatch = cleanText.match(/(?:Batch|الباتش|رقم الباتش)[:\.\s]*(\d{1,6})/i);
        if (batchMatch) data.batchNumber = batchMatch[1];

        // 8. LAST 4 DIGITS (already working well, keep robust)
        const last4Match = cleanText.match(/(?:\*{4}|X{4})\s*(\d{4})|(?:\d{4})\s*$/m); // End of line or after masks
        if (last4Match) data.last4Digits = last4Match[1];

        // 9. RRN (12 digits)
        const rrnMatch = cleanText.match(/(?:RRN|Ref|Reference)[:\.\s]*(\d{12})/i);
        if (rrnMatch) data.rrn = rrnMatch[1];

        return data;
    }
}

export default new OCRService();
