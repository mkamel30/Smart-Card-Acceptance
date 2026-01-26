import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import axios from 'axios';
import FormData from 'form-data';
import { supabase } from '../../config/supabase';

export interface ExtractedReceiptData {
    merchantCode?: string;
    terminalId?: string;
    invoiceNumber?: string;
    batchNumber?: string;
    approvalNumber?: string;
    rrn?: string;
    totalAmount?: number;
    cardBin?: string;
    last4Digits?: string;
    date?: string;
    time?: string;
    imageUrl?: string;
}

export class OCRService {
    async uploadImage(file: Express.Multer.File): Promise<string> {
        let storageBuffer = file.buffer;
        let contentType = file.mimetype;

        try {
            // Compress for storage: WebP is much smaller than PNG/JPEG
            storageBuffer = await sharp(file.buffer)
                .resize({ width: 1000, withoutEnlargement: true }) // 1000px is plenty for viewing
                .webp({ quality: 75 })
                .toBuffer();
            contentType = 'image/webp';
        } catch (e) {
            console.warn('Image optimization failed', e);
        }

        const fileName = `receipts/${Date.now()}_v.webp`;
        const { error } = await supabase.storage
            .from('receipts')
            .upload(fileName, storageBuffer, {
                contentType,
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('Supabase Upload Error:', error);
            throw new Error('Upload failed');
        }

        const urlData = supabase.storage.from('receipts').getPublicUrl(fileName);
        return urlData.data.publicUrl;
    }

    async extractAndParse(file: Express.Multer.File): Promise<{ data: ExtractedReceiptData; rawText: string; engine: string }> {

        try {
            console.log('OCR Step 1: Starting image processing with Sharp...');
            const image = sharp(file.buffer);
            // Pre-process for OCR engines
            ocrBuffer = await image
                .rotate()
                .resize({ width: 1800, withoutEnlargement: true })
                .grayscale()
                .sharpen()
                .toFormat('png')
                .toBuffer();

            // WebP Storage optimized for cloud view
            storageBuffer = await sharp(file.buffer)
                .rotate()
                .resize({ width: 1000 })
                .webp({ quality: 75 })
                .toBuffer();
        } catch (e: any) {
            console.warn('OCR Warning: Image optimization failed, using original:', e.message);
        }

        // 1. Upload to Supabase Storage
        let publicUrl = '';
        try {
            const fileName = `receipts/${Date.now()}.webp`;
            const { error } = await supabase.storage
                .from('receipts')
                .upload(fileName, storageBuffer, { contentType: 'image/webp' });

            if (!error) {
                publicUrl = supabase.storage.from('receipts').getPublicUrl(fileName).data.publicUrl;
                console.log('OCR History Saved:', publicUrl);
            }
        } catch (err: any) {
            console.error('Supabase History Error:', err.message);
        }

        // 2. Perform OCR
        let text = '';
        let usedEngine = 'unknown';

        // --- Step A: Try OCR.space (Direct Buffer Upload) ---
        const OCR_SPACE_KEY = process.env.OCR_SPACE_API_KEY || "K82676068988957";

        if (OCR_SPACE_KEY) {
            try {
                console.log('OCR Step 5: Calling OCR.space (Binary Buffer)...');
                const osFormData = new FormData();
                // Pass the processed buffer directly
                osFormData.append('file', ocrBuffer, { filename: 'receipt.png', contentType: 'image/png' });
                osFormData.append('language', 'eng+ara');
                osFormData.append('OCREngine', '2');
                osFormData.append('scale', 'true');

                const osResponse = await axios.post('https://api.ocr.space/parse/image', osFormData, {
                    headers: { ...osFormData.getHeaders(), 'apikey': OCR_SPACE_KEY },
                    timeout: 25000
                });

                if (osResponse.data?.ParsedResults?.[0]?.ParsedText) {
                    text = osResponse.data.ParsedResults[0].ParsedText;
                    usedEngine = 'OCR.space (Primary)';
                } else {
                    console.warn('OCR.space responded but no text. Code:', osResponse.data?.OCRExitCode);
                }
            } catch (err: any) {
                console.warn('OCR.space Error:', err.message);
            }
        }

        // --- Step B: Fallback to Tesseract.js (Local Emergency) ---
        if (!text || text.length < 15) {
            try {
                console.log('OCR Step 6: Falling back to Tesseract.js local...');
                const worker = await Tesseract.createWorker(['ara', 'eng']);

                await worker.setParameters({
                    tessedit_char_whitelist: '0123456789.:-/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzابتثجحخدذرزسشصضطظعغفقكلمنهويي* ',
                    tessedit_pagesegmode: '6' as any
                });

                const { data: { text: tText } } = await worker.recognize(ocrBuffer);
                text = tText;
                usedEngine = 'Tesseract.js (Backup)';
                await worker.terminate();
            } catch (err: any) {
                console.error('Tesseract failed:', err.message);
            }
        }

        // 3. Final Unified Parsing
        const parsedData = this.parseReceiptText(text);
        if (publicUrl) parsedData.imageUrl = publicUrl;

        return {
            data: parsedData,
            rawText: text,
            engine: usedEngine
        };
    }

    private parseReceiptText(text: string): ExtractedReceiptData {
        const data: ExtractedReceiptData = {};
        // Normalize text: fix common OCR mistakes
        const cleanText = text.replace(/[\r\n]+/g, '\n').replace(/[I|l]/g, '1');

        // Create digit-only optimized text for amounts/IDs
        const digitFocusText = cleanText.replace(/(\d)\s+(?=\d|[.,]\d)/g, '$1');

        console.log('--- OCR Parsing (Refined) ---');

        // 1. DATES
        const datePattern = /\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\b/g;
        const dateMatches = digitFocusText.match(datePattern);
        if (dateMatches) {
            const bestDate = dateMatches[0];
            const parts = bestDate.split(/[/\-\.]/);
            if (parts[2].length === 4) {
                data.date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            } else {
                data.date = `20${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }

        // 2. TIME
        const timePattern = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/;
        const timeMatch = cleanText.match(timePattern);
        if (timeMatch) data.time = timeMatch[1];

        // 3. AMOUNT - Robust Extraction
        const amountPatterns = [
            /(?:T\.AMOUNT|TOTAL AMOUNT|TOTAL|SALE|المبلغ الشامل|الإجمالي)\s*(?:EGP|LE|L\.E|ج\.م)?[:\.\s]*([\d,]+\.\d{2})/i,
            /(?:AMOUNT|SALE|المبلغ)\s*(?:EGP|LE|L\.E|ج\.م)?[:\.\s]*([\d,]+\.\d{2})/i,
            /([\d,]+\.\d{2})\s*(?:EGP|LE|L\.E|ج\.م|جنيه)/i
        ];

        for (const pat of amountPatterns) {
            const m = digitFocusText.match(pat);
            if (m) {
                const rawAmount = m[1].replace(/,/g, '');
                const val = parseFloat(rawAmount);
                if (!isNaN(val) && val > 0) {
                    data.totalAmount = val;
                    break;
                }
            }
        }

        // 4. MERCHANT ID (Machine MID) - Save to merchantCode for now or terminalId
        const midPatterns = [
            /(?:MID|MERCHANT|التاجر|كود التاجر)[:\.\s]*(\d{8,15})/i,
            /\b(\d{10,15})\b/
        ];

        for (const pat of midPatterns) {
            const m = digitFocusText.match(pat);
            if (m) {
                // This is the machine-specific MID from the receipt
                data.merchantCode = m[1];
                break;
            }
        }

        // 5. TERMINAL ID (TID)
        const tidPatterns = [
            /(?:TID|TERMINAL|الطرفية)[:\.\s]*(\d{8})/i
        ];
        const tidMatch = digitFocusText.match(tidPatterns[0]);
        if (tidMatch) data.terminalId = tidMatch[1];

        // 6. APPROVAL / AUTH CODE
        const authPatterns = [
            /(?:AUTH CODE|APPR CODE|APPROVAL|الموافقة)[:\.\s]*(\d{6})/i,
            /CODE[:\s]*(\d{6})/i
        ];
        for (const pat of authPatterns) {
            const m = digitFocusText.match(pat);
            if (m) {
                data.approvalNumber = m[1];
                break;
            }
        }

        // 7. BATCH - Preserve leading zeros (000010)
        const batchPatterns = [
            /(?:BATCH NO|BATCH|الباتش)[:\.\s]*(\d+)/i
        ];
        const batchMatch = digitFocusText.match(batchPatterns[0]);
        if (batchMatch) {
            // Keep exactly as found in receipt
            data.batchNumber = batchMatch[1];
        }

        // 8. CARD BIN (6) & LAST 4
        // Logic for patterns like: 412345******9009 or ************9009
        const fullCardMatch = digitFocusText.match(/(\d{0,6})[\*xX\s]{4,}(\d{4})\b/);
        if (fullCardMatch) {
            const prefix = fullCardMatch[1];
            const last4 = fullCardMatch[2];

            // If prefix is less than 6 digits, fill with stars/remain empty as per user request
            if (prefix.length === 6) {
                data.cardBin = prefix;
            } else {
                // Return the mask if digits not found (e.g. "******")
                data.cardBin = prefix.padEnd(6, '*');
            }
            data.last4Digits = last4;
        }

        // 9. SERVICE CATEGORY Detection (DISABLED - User fills manually)
        /* 
        const lowerText = text.toUpperCase();
        if (lowerText.includes('SMART') || lowerText.includes('سمارت')) {
             (data as any).serviceCategory = 'SMART';
        } 
        */

        return data;
    }

    // Helper function to filter out obvious dates and phone numbers

}

export default new OCRService();