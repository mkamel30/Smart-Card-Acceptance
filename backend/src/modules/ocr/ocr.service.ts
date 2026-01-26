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
                .resize({ width: 1000, withoutEnlargement: true })
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
            console.log('OCR: Processing image in memory...');
            const image = sharp(file.buffer);

            // Enhance for OCR: Resize more aggressively, Grayscale + High Contrast
            // Using 2x scale and thresholding to make text pop for Tesseract
            ocrBuffer = await image
                .rotate()
                .resize({ width: 1600, fit: 'inside' })
                .grayscale()
                .normalize()
                .threshold(160) // High contrast BW
                .sharpen()
                .toFormat('png')
                .toBuffer();
        } catch (e: any) {
            console.warn('Preprocessing failed:', e.message);
        }

        let text = '';
        let usedEngine = 'unknown';

        // --- Step A: Try OCR.space (Base64) ---
        const OCR_SPACE_KEY = process.env.OCR_SPACE_API_KEY || "K82676068988957";

        if (OCR_SPACE_KEY) {
            try {
                console.log('OCR: Calling OCR.space...');
                const base64Data = `data:image/png;base64,${ocrBuffer.toString('base64')}`;

                const osFormData = new FormData();
                osFormData.append('base64Image', base64Data);
                osFormData.append('language', 'ara');
                osFormData.append('OCREngine', '2');
                osFormData.append('scale', 'true');

                const osResponse = await axios.post('https://api.ocr.space/parse/image', osFormData, {
                    headers: { ...osFormData.getHeaders(), 'apikey': OCR_SPACE_KEY },
                    timeout: 45000 // Increased timeout for stability
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
                console.log('OCR: Tesseract Fallback...');
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

    private parseReceiptText(text: string): ExtractedReceiptData {
        const data: ExtractedReceiptData = {};
        const cleanText = text.replace(/[\r\n]+/g, '\n').replace(/[I|l]/g, '1');
        const digitFocusText = cleanText.replace(/(\d)\s+(?=\d|[.,]\d)/g, '$1');

        console.log('--- Parsing Logic Start ---');

        // 1. DATE
        const dateMatch = digitFocusText.match(/\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\b/);
        if (dateMatch) {
            const parts = dateMatch[1].split(/[/\-\.]/);
            let year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            if (year === '2076') year = '2026'; // Common OCR misread
            data.date = `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }

        // 2. TIME
        const timeMatch = cleanText.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
        if (timeMatch) data.time = timeMatch[1];

        // 3. AMOUNT - Strict Label Matching
        const amountPatterns = [
            /(?:T\.AMOUNT|TOTAL|SALE|المبلغ|الإجمالي)\s*(?:EGP|LE| ج\.م)?[:\.\s]*([\d,\s]+\.?\d{2})/i,
            /([\d,\s]+\.\d{2})\s*(?:EGP|LE|جنيه)/i
        ];

        for (const pat of amountPatterns) {
            const m = digitFocusText.match(pat);
            if (m) {
                const raw = m[1].replace(/\s/g, '').replace(/,/g, '');
                const val = parseFloat(raw);
                if (!isNaN(val) && val > 0) {
                    data.totalAmount = val;
                    break;
                }
            }
        }

        // 4. MERCHANT ID
        const midMatch = digitFocusText.match(/(?:MID|MERCHANT|التاجر)[:\.\s]*(\d{8,15})/i);
        if (midMatch) data.merchantCode = midMatch[1];

        // 5. TERMINAL ID
        const tidMatch = digitFocusText.match(/(?:TID|TERMINAL)[:\.\s]*(\d{8})/i);
        if (tidMatch) data.terminalId = tidMatch[1];

        // 6. APPROVAL CODE
        const authMatch = digitFocusText.match(/(?:AUTH|APPR|APPROVAL|الموافقة)[:\.\s]*(\d{6})/i);
        if (authMatch) data.approvalNumber = authMatch[1];

        // 7. BATCH
        // Allow 1-6 digits to catch short batch numbers or partial reads
        const batchMatch = digitFocusText.match(/(?:BATCH)[:\.\s#]*(\d{1,6})\b/i);
        if (batchMatch) data.batchNumber = batchMatch[1].padStart(6, '0'); // Pad for consistency

        // 8. CARD BIN & LAST 4
        const cardMatch = digitFocusText.match(/(\d{0,6})[\*xX\s\-\.]{4,}(\d{4})\b/);
        if (cardMatch) {
            data.cardBin = cardMatch[1].length >= 4 ? cardMatch[1].padEnd(6, '*') : '******';
            data.last4Digits = cardMatch[2];
        }

        return data;
    }
}

export default new OCRService();