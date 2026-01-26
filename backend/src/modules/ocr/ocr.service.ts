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
        let ocrBuffer: Buffer = file.buffer;

        try {
            console.log('OCR Step 1: Memory Pre-processing...');
            const image = sharp(file.buffer);

            // Extreme pre-processing for tiny Base64 size + high accuracy
            ocrBuffer = await image
                .rotate()
                .resize({ width: 1000 }) // Sufficient for OCR, keeps Base64 small
                .grayscale()
                .normalize()
                .threshold(160) // High contrast BW
                .toFormat('png', { compressionLevel: 9 })
                .toBuffer();
        } catch (e: any) {
            console.warn('Processing failed, using raw:', e.message);
        }

        // 2. Perform OCR
        let text = '';
        let usedEngine = 'unknown';

        // --- Step A: Try OCR.space (Base64) ---
        const OCR_SPACE_KEY = process.env.OCR_SPACE_API_KEY || "K82676068988957";

        if (OCR_SPACE_KEY) {
            try {
                console.log('OCR Step 2: Calling OCR.space (Base64)...');
                const base64Data = `data:image/png;base64,${ocrBuffer.toString('base64')}`;

                const osFormData = new FormData();
                osFormData.append('base64Image', base64Data);
                osFormData.append('language', 'ara');
                osFormData.append('OCREngine', '2');
                osFormData.append('scale', 'true');

                const osResponse = await axios.post('https://api.ocr.space/parse/image', osFormData, {
                    headers: { ...osFormData.getHeaders(), 'apikey': OCR_SPACE_KEY },
                    timeout: 20000
                });

                if (osResponse.data?.ParsedResults?.[0]?.ParsedText) {
                    text = osResponse.data.ParsedResults[0].ParsedText;
                    usedEngine = 'OCR.space (Live)';
                }
            } catch (err: any) {
                console.warn('OCR.space failed:', err.message);
            }
        }

        // --- Step B: Fallback to Tesseract.js ---
        if (!text || text.length < 20) {
            try {
                console.log('OCR Step 3: Tesseract Local Recovery...');
                const worker = await Tesseract.createWorker(['ara', 'eng']);
                await worker.setParameters({
                    tessedit_char_whitelist: '0123456789.:-/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzابتثجحخدذرزسشصضطظعغفقكلمنهويي* ',
                    tessedit_pagesegmode: '3' as any
                });
                const { data: { text: tText } } = await worker.recognize(ocrBuffer);
                text = tText;
                usedEngine = 'Tesseract (Local)';
                await worker.terminate();
            } catch (err: any) {
                console.error('Tesseract crash');
            }
        }

        return {
            data: this.parseReceiptText(text),
            rawText: text,
            engine: usedEngine
        };
    }
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

    // 3. AMOUNT - Strategy: Largest valid decimal in document
    const matches = digitFocusText.match(/(\d+[.,]\d{2})/g);
    if (matches) {
        const values = matches.map(m => {
            let clean = m.replace(/,/g, '');
            // Handle triple-dots or typos
            if ((clean.match(/\./g) || []).length > 1) {
                const lastDot = clean.lastIndexOf('.');
                clean = clean.replace(/\./g, '');
                clean = clean.slice(0, lastDot) + '.' + clean.slice(lastDot);
            }
            return parseFloat(clean);
        }).filter(v => v > 5); // Ignore tiny noise

        if (values.length > 0) {
            data.totalAmount = Math.max(...values);
        }
    }

    // Secondary regex-based fallback
    if (!data.totalAmount) {
        const m = digitFocusText.match(/(?:TOTAL|SALE|المبلغ|الشامل)[:\.\s]*([\d,]+\.\d{2})/i);
        if (m) data.totalAmount = parseFloat(m[1].replace(/,/g, ''));
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
        /(?:BATCH NO|BATCH|الباتش)[:\.\s#]*(\d+)/i
    ];
    const batchMatch = digitFocusText.match(batchPatterns[0]);
    if (batchMatch) {
        // Keep exactly as found in receipt
        data.batchNumber = batchMatch[1];
    }

    // 8. CARD BIN (6) & LAST 4
    const fullCardMatch = digitFocusText.match(/(\d{0,6})[\*xX\s\-\.]{4,}(\d{4})\b/);
    if (fullCardMatch) {
        const prefix = fullCardMatch[1];
        const last4 = fullCardMatch[2];

        if (prefix && prefix.length >= 4) {
            data.cardBin = prefix.padEnd(6, '*');
        } else {
            data.cardBin = '******';
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