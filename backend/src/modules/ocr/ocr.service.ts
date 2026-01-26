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

        let ocrBuffer = file.buffer;
        let storageBuffer = file.buffer;

        try {
            console.log('OCR Step 1: Starting image processing with Sharp...');
            const image = sharp(file.buffer);
            const metadata = await image.metadata();
            console.log(`OCR Metadata: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

            // 1. Prepare Buffer for OCR (Grayscale, Normalized)
            console.log('OCR Step 2: Preparing OCR buffer...');
            ocrBuffer = await image
                .rotate()
                .resize({ width: 1200, withoutEnlargement: true })
                .grayscale()
                .normalize()
                .toFormat('png')
                .toBuffer();
            console.log('OCR Step 2: OCR buffer ready.');

            // 2. Prepare Buffer for Storage (WebP)
            console.log('OCR Step 3: Preparing storage buffer...');
            storageBuffer = await sharp(file.buffer)
                .rotate()
                .resize({ width: 800, withoutEnlargement: true })
                .webp({ quality: 70 })
                .toBuffer();
            console.log('OCR Step 3: Storage buffer ready.');
        } catch (e: any) {
            console.warn('OCR Warning: Image optimization failed, using original:', e.message);
        }

        // 1. Upload to Supabase Storage
        let publicUrl = '';
        try {
            console.log('OCR Step 4: Uploading to Supabase...');
            const fileName = `receipts/${Date.now()}_s.webp`;
            const { error } = await supabase.storage
                .from('receipts')
                .upload(fileName, storageBuffer, {
                    contentType: 'image/webp',
                    upsert: false
                });

            if (!error) {
                const urlData = supabase.storage.from('receipts').getPublicUrl(fileName);
                publicUrl = urlData.data.publicUrl;
                console.log('OCR Step 4 Success:', publicUrl);
            } else {
                console.error('OCR Step 4 Error (Supabase):', error);
            }
        } catch (err: any) {
            console.error('OCR Step 4 FATAL:', err.message);
        }

        // 2. Perform OCR
        let text = '';
        let usedEngine = 'unknown';

        // --- Step A: Try OCR.space ---
        const OCR_SPACE_KEY = process.env.OCR_SPACE_API_KEY || "K82676068988957";

        if (OCR_SPACE_KEY && publicUrl) {
            try {
                console.log('OCR Step 5: Calling OCR.space...');
                const osFormData = new FormData();
                osFormData.append('url', publicUrl);
                osFormData.append('language', 'eng+ara');
                osFormData.append('OCREngine', '2');
                osFormData.append('scale', 'true');

                const osResponse = await axios.post('https://api.ocr.space/parse/image', osFormData, {
                    headers: { ...osFormData.getHeaders(), 'apikey': OCR_SPACE_KEY },
                    timeout: 20000
                });

                if (osResponse.data?.ParsedResults?.[0]?.ParsedText) {
                    text = osResponse.data.ParsedResults[0].ParsedText;
                    usedEngine = 'OCR.space';
                    console.log('OCR Step 5: OCR.space Success. Text length:', text.length);
                } else if (osResponse.data?.ErrorMessage) {
                    console.warn('OCR Step 5: OCR.space returned error:', osResponse.data.ErrorMessage);
                }
            } catch (err: any) {
                console.warn('OCR Step 5: OCR.space request failed:', err.message);
            }
        }

        // --- Step B: Fallback to Tesseract.js ---
        if (!text || text.length < 10) {
            try {
                console.log('OCR Step 6: Falling back to Tesseract.js...');
                // Note: v5+ syntax for better multi-lang support
                const worker = await Tesseract.createWorker(['ara', 'eng']);

                await worker.setParameters({
                    tessedit_char_whitelist: '0123456789.:-/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzابتثجحخدذرزسشصضطظعغفقكلمنهويي',
                    tessedit_pagesegmode: '6' as any
                });

                const { data: { text: tText } } = await worker.recognize(ocrBuffer);
                text = tText;
                usedEngine = 'Tesseract.js';
                console.log('OCR Step 6: Tesseract Success. Text length:', text?.length || 0);
                await worker.terminate();
            } catch (err: any) {
                console.error('OCR Step 6: Tesseract FATAL:', err.message);
            }
        }

        // 3. Final Parse
        console.log('OCR Step 7: Parsing final text results...');
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