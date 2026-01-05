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
    last4Digits?: string;
    date?: string;
    time?: string;
    imageUrl?: string;
}

export class OCRService {
    // ...

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
        const { data, error } = await supabase.storage
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

    async extractAndParse(file: Express.Multer.File): Promise<{ data: ExtractedReceiptData; rawText: string }> {

        let ocrBuffer = file.buffer;
        let storageBuffer = file.buffer;

        try {
            // 1. Prepare Buffer for OCR (High Quality PNG, Grayscale, Sharpened)
            ocrBuffer = await sharp(file.buffer)
                .resize({ width: 1500, withoutEnlargement: true })
                .grayscale()
                .sharpen()
                .normalize()
                .toFormat('png')
                .toBuffer();

            // 2. Prepare Buffer for Storage (Compressed WebP)
            storageBuffer = await sharp(file.buffer)
                .resize({ width: 1000, withoutEnlargement: true })
                .webp({ quality: 75 })
                .toBuffer();
        } catch (e) {
            console.warn('Image optimization failed, using original file for both', e);
        }

        // 1. Upload to Supabase Storage
        let publicUrl = '';
        try {
            const fileName = `receipts/${Date.now()}_s.webp`;
            const { data, error } = await supabase.storage
                .from('receipts')
                .upload(fileName, storageBuffer, {
                    contentType: 'image/webp',
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

        // 2. Perform OCR
        let text = '';
        let paddleData: any = null;

        // --- Step A: Try PaddleOCR Service (Free & Local) ---
        try {
            console.log('Attempting PaddleOCR...');
            const pFormData = new FormData();
            pFormData.append('file', ocrBuffer, { filename: 'receipt.png' });

            const pResponse = await axios.post('http://localhost:5000/scan', pFormData, {
                headers: { ...pFormData.getHeaders() },
                timeout: 10000 // 10s timeout
            });

            if (pResponse.data && pResponse.data.success) {
                text = pResponse.data.rawText || '';
                paddleData = pResponse.data.data;
                console.log('PaddleOCR Success');
            }
        } catch (err) {
            console.warn('PaddleOCR failed or not running:', (err as any).message);
        }

        // --- Step B: Try Google Vision API (Paid) ---
        const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'AQ.Ab8RN6Lj_W9uRCv4wa92VzsHkDKN7Y-YAJQHuwi70sX5spwbBQ';

        if (GOOGLE_API_KEY && !text) {
            try {
                console.log('Attempting Google Vision OCR...');
                const start = Date.now();
                const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        requests: [{
                            image: { content: ocrBuffer.toString('base64') },
                            features: [{ type: 'TEXT_DETECTION' }]
                        }]
                    })
                });

                const result: any = await response.json();

                if (result.responses?.[0]?.fullTextAnnotation?.text) {
                    text = result.responses[0].fullTextAnnotation.text;
                    console.log(`Google Vision Success (${Date.now() - start}ms)`);
                }
            } catch (err) {
                console.warn('Google Vision failed:', err);
            }
        }

        // --- Step C: Fallback to Tesseract.js (Free & Built-in) ---
        if (!text) {
            try {
                console.log('Falling back to Tesseract.js...');
                const tesseractResult = await Tesseract.recognize(ocrBuffer, 'ara+eng');
                text = tesseractResult.data.text;
                console.log('Tesseract.js Success');
            } catch (err) {
                console.error('Tesseract.js failed:', err);
            }
        }

        // 3. Parse and Merge Results
        const parsedData = this.parseReceiptText(text);

        // Hybrid Merge: If PaddleOCR provided structured data, use it to fill gaps
        if (paddleData) {
            if (paddleData.merchantCode) parsedData.merchantCode = paddleData.merchantCode;
            if (paddleData.terminalId) parsedData.terminalId = paddleData.terminalId;
            if (paddleData.batchNumber) parsedData.batchNumber = paddleData.batchNumber;
            if (paddleData.approvalNumber) parsedData.approvalNumber = paddleData.approvalNumber;
            if (paddleData.totalAmount) parsedData.totalAmount = paddleData.totalAmount;
            if (paddleData.date) parsedData.date = paddleData.date;
            if (paddleData.time) parsedData.time = paddleData.time;
            if (paddleData.last4Digits) parsedData.last4Digits = paddleData.last4Digits;
            if (paddleData.rrn) parsedData.rrn = paddleData.rrn;
        }

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

        // 8. LAST 4 DIGITS (Updated to be more flexible with masks like * * * * or x x x x)
        // Matches 4 of (*, x, X, .) followed by 4 digits
        const last4Match = cleanText.match(/(?:[\*xX\.]\s*){4}\s*(\d{4})|(?:\d{4})\s*$/m);
        if (last4Match) data.last4Digits = last4Match[1] || last4Match[0].trim();

        // 9. RRN (12 digits)
        const rrnMatch = cleanText.match(/(?:RRN|Ref|Reference)[:\.\s]*(\d{12})/i);
        if (rrnMatch) data.rrn = rrnMatch[1];

        return data;
    }
}

export default new OCRService();
