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

    async extractAndParse(file: Express.Multer.File): Promise<{ data: ExtractedReceiptData; rawText: string }> {

        let ocrBuffer = file.buffer;
        let storageBuffer = file.buffer;

        try {
            const image = sharp(file.buffer);
            const metadata = await image.metadata();

            console.log(`Processing image for OCR: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

            // 1. Prepare Buffer for OCR (High Quality PNG, Grayscale, Normalized)
            ocrBuffer = await image
                .rotate() // Auto-rotate based on EXIF
                .resize({ width: 1500, withoutEnlargement: true })
                .grayscale()
                .normalize()
                .toFormat('png')
                .toBuffer();

            // 2. Prepare Buffer for Storage (Compressed WebP)
            storageBuffer = await sharp(file.buffer)
                .rotate()
                .resize({ width: 1000, withoutEnlargement: true })
                .webp({ quality: 75 })
                .toBuffer();
        } catch (e) {
            console.warn('Image optimization failed, using original file', e);
        }

        // 1. Upload to Supabase Storage
        let publicUrl = '';
        try {
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
            } else {
                console.error('Supabase Upload Error:', error);
            }
        } catch (err) {
            console.error('Upload Failed', err);
        }

        // 2. Perform OCR
        let text = '';
        let paddleData: any = null;

        // --- Step A: Try PaddleOCR Service (Free & Local/Self-hosted) ---
        try {
            const PADDLE_URL = process.env.PADDLE_OCR_URL || 'http://localhost:5000/scan';
            console.log(`Attempting PaddleOCR at ${PADDLE_URL}...`);
            const pFormData = new FormData();
            pFormData.append('file', ocrBuffer, { filename: 'receipt.png' });

            const pResponse = await axios.post(PADDLE_URL, pFormData, {
                headers: { ...pFormData.getHeaders() },
                timeout: 3000 // 3s timeout (Fast local or fail)
            });

            if (pResponse.data && pResponse.data.success) {
                text = pResponse.data.rawText || '';
                paddleData = pResponse.data.data;
                console.log('PaddleOCR Success');
            }
        } catch (err) {
            console.warn('PaddleOCR failed or not running:', (err as any).message);
        }

        // --- Step B: Fallback to Tesseract.js (Free & Built-in) ---
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
        const cleanText = text.replace(/[\r\n]+/g, '\n');

        // Create a version of text without spaces between digits for more robust matching
        // "1 2 3 . 4 5" -> "123.45"
        const digitFocusText = cleanText.replace(/(\d)\s+(?=\d|[.,]\d)/g, '$1');

        // 1. DATES (DD/MM/YYYY or YYYY-MM-DD)
        const datePattern = /\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\b/g;
        const dateMatches = digitFocusText.match(datePattern);
        if (dateMatches) {
            const bestDate = dateMatches[0];
            const parts = bestDate.split(/[/\-\.]/);
            if (parts[2].length === 4) {
                data.date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            } else if (parts[0].length === 4) {
                data.date = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
            } else {
                data.date = `20${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }

        // 2. TIME (HH:MM[:SS])
        const timePattern = /\b(\d{1,2}:\d{2}(?::\d{2})?)\b/;
        const timeMatch = cleanText.match(timePattern);
        if (timeMatch) data.time = timeMatch[1];

        // 3. AMOUNT
        const amountPatterns = [
            /(?:Total|Amount|Sale|Net|المبلغ|الاجمالي|صافي)\s*[:\.]?\s*(\d+[.,]\d{2})/i,
            /(\d+[.,]\d{2})\s*(?:EGP|LE|L\.E|ج\.م|ج\.m)/i,
            /(?:EGP|LE|L\.E|ج\.م|ج\.m)\s*(\d+[.,]\d{2})/i
        ];

        for (const pat of amountPatterns) {
            const m = digitFocusText.match(pat);
            if (m) {
                data.totalAmount = parseFloat(m[1].replace(/,/g, ''));
                break;
            }
        }

        // 4. MERCHANT ID (MID)
        const merchantMatch = digitFocusText.match(/(?:MID|Merchant|Merch|ID|التاجر)[:\.\s]*(\d{8,15})/i);
        if (merchantMatch) {
            data.merchantCode = merchantMatch[1];
        } else {
            const standaloneMID = digitFocusText.match(/\b(\d{10,15})\b/);
            if (standaloneMID) data.merchantCode = standaloneMID[1];
        }

        // 5. TERMINAL ID (TID)
        const tidMatch = digitFocusText.match(/(?:TID|Terminal|Term|طرفية)[:\.\s]*(\d{8})/i);
        if (tidMatch) data.terminalId = tidMatch[1];

        // 6. APPROVAL / AUTH CODE (6 digits)
        const authMatch = digitFocusText.match(/(?:Approval|Appr|Auth|Code|الموافقة)\s*(?:CODE|NO)?[:\.\s]*(\d{6})/i);
        if (authMatch) {
            data.approvalNumber = authMatch[1];
        } else {
            const standalone6 = digitFocusText.match(/\b\d{6}\b/g);
            if (standalone6) data.approvalNumber = standalone6[0];
        }

        // 7. BATCH
        const batchMatch = digitFocusText.match(/(?:Batch|الباتش|رقم الباتش)\s*(?:NO|#)?[:\.\s]*(\d{1,6})/i);
        if (batchMatch) data.batchNumber = batchMatch[1];

        // 8. LAST 4 DIGITS
        const last4Match = digitFocusText.match(/(?:[\*xX\.\-\s]{4,}|Card|Card No|PAN)[:\.\s]*\d*(\d{4})\b/i);
        if (last4Match) {
            data.last4Digits = last4Match[1];
        } else {
            const standalone4 = digitFocusText.match(/\b\d{4}$/m);
            if (standalone4) data.last4Digits = standalone4[0];
        }

        // 9. RRN
        const rrnMatch = digitFocusText.match(/(?:RRN|Ref|Reference)[:\.\s]*(\d{12})/i);
        if (rrnMatch) data.rrn = rrnMatch[1];

        return data;
    }
}

export default new OCRService();
