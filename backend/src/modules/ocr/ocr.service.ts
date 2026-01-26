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
            console.log('OCR: Processing image (Standard Mode)...');
            const image = sharp(file.buffer);

            // Simplified Processing: Just Resize & Grayscale. 
            // Avoid Thresholding/Binarization as it destroys decimal points in faint receipts.
            ocrBuffer = await image
                .resize({ width: 1800, fit: 'inside' })
                .grayscale()
                .toFormat('png')
                .toBuffer();
        } catch (e: any) {
            console.warn('Preprocessing failed:', e.message);
        }

        let text = '';
        let usedEngine = 'unknown';

        // --- Step A: Try OCR.space (Base64) ---
        // Kept as primary, but with fail-safe logic
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
                    timeout: 20000 // Reduced timeout to fail faster if stuck
                });

                if (osResponse.data?.ParsedResults?.[0]?.ParsedText) {
                    text = osResponse.data.ParsedResults[0].ParsedText;
                    usedEngine = 'OCR.space (Live)';
                }
            } catch (err: any) {
                console.warn('OCR.space failed (Skipping):', err.message);
            }
        }

        // --- Step B: Fallback to Tesseract.js (Standard Config) ---
        if (!text || text.length < 20) {
            try {
                console.log('OCR: Tesseract Fallback (Standard)...');
                const worker = await Tesseract.createWorker(['ara', 'eng']);

                // Optimized Parameters for Receipts
                await worker.setParameters({
                    tessedit_char_whitelist: '0123456789.:-/,ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzابتثجحخدذرزسشصضطظعغفقكلمنهويي* ',
                    tessedit_pagesegmode: '6' as any // Assume uniform text block
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

        // 1. Basic Cleaning
        const cleanText = text.replace(/[\r\n]+/g, '\n').replace(/[I|l]/g, '1');
        // Remove spaces between digits to fix "1 3 3 4" -> "1334"
        const digitFocusText = cleanText.replace(/(\d)\s+(?=\d|[.,]\d)/g, '$1');

        console.log('--- Parsing Logic (Balanced) ---');

        // 1. DATE (Flexible)
        const dateMatch = digitFocusText.match(/\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\b/);
        if (dateMatch) {
            const parts = dateMatch[1].split(/[/\-\.]/);
            // Year fix logic
            let year = parts[2];
            if (year.length === 2) year = '20' + year;
            if (year === '2076') year = '2026';
            data.date = `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }

        // 2. TIME
        const timeMatch = cleanText.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
        if (timeMatch) data.time = timeMatch[1];

        // 3. AMOUNT (The most critical part)
        // We look for patterns but allow flexibility with commas/dots
        const amountPatterns = [
            /(?:T\.AMOUNT|TOTAL|SALE|المبلغ|الإجمالي)\s*(?:EGP|LE| ج\.م)?[:\.\s]*([\d,]+\.?\d{2})/i,
            /([\d,]+\.\d{2})\s*(?:EGP|LE|جنيه)/i
        ];

        for (const pat of amountPatterns) {
            const m = digitFocusText.match(pat);
            if (m) {
                // Replace comma with empty, ensure dot is preserved
                const raw = m[1].replace(/,/g, '');
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

        // 7. BATCH - Strict digits including zeros (improved regex)
        const batchMatch = digitFocusText.match(/(?:BATCH)[:\.\s#NO]*(\d{1,10})/i);
        if (batchMatch) data.batchNumber = batchMatch[1].padStart(6, '0'); // Force padding? Or keep as is? User said keep zeros.
        // If user wants EXACTLY as in receipt, we use batchMatch[1]. 
        // But Tesseract often misses leading zeros. Safest is padStart OR raw if detected.
        if (batchMatch) {
            // If detected string starts with 0, keep it. If just '1', maybe pad it?
            // User Request: "الاصفار بتاعة رقم الباتش زي ما هي"
            data.batchNumber = batchMatch[1];
        }

        // 8. CARD BIN & LAST 4
        // Logic: 412345******9009 or ************9009
        const cardMatch = digitFocusText.match(/(\d{0,6})[\*xX\s\-\.]{4,}(\d{4})\b/);
        if (cardMatch) {
            const prefix = cardMatch[1];
            const last4 = cardMatch[2];

            data.last4Digits = last4;
            // If prefix detected (6 digits), use it. Else stars.
            data.cardBin = (prefix && prefix.length === 6) ? prefix : '******';
        }

        return data;
    }
}

export default new OCRService();