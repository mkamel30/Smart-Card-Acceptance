import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { supabase } from '../../config/supabase';

export interface ExtractedReceiptData {
    merchantCode?: string;
    merchantName?: string;
    terminalId?: string;
    invoiceNumber?: string;
    batchNumber?: string;
    approvalNumber?: string;
    rrn?: string;
    totalAmount?: number;
    cardBin?: string;
    last4Digits?: string;
    cardType?: string;
    serviceCategory?: string;
    bankName?: string;
    date?: string;
    time?: string;
    imageUrl?: string;
}

export class OCRService {
    private worker: Tesseract.Worker | null = null;
    private workerPromise: Promise<Tesseract.Worker> | null = null;

    /**
     * Singleton Worker - Kept warm in memory for sub-second recognition
     */
    private async getWorker(): Promise<Tesseract.Worker> {
        if (this.worker) return this.worker;
        if (this.workerPromise) return this.workerPromise;

        this.workerPromise = (async () => {
            console.log('OCR: Initializing persistent Tesseract Worker...');
            const worker = await Tesseract.createWorker(['eng', 'ara']);
            await worker.setParameters({
                tessedit_pagesegmode: '4' as any // Single column of variable text sizes - optimal for thermal POS
            });
            this.worker = worker;
            return worker;
        })();

        return this.workerPromise;
    }

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

    private async recognizeImage(buffer: Buffer): Promise<string> {
        const image = sharp(buffer);
        const metadata = await image.metadata();

        if (!metadata.width || metadata.width < 50) {
            throw new Error('Invalid or too small image');
        }

        // Image pre-processing: High clarity and contrast for thermal dot-matrix numbers
        const processedBuffer = await image
            .resize({ width: 2400, withoutEnlargement: true })
            .grayscale()
            .normalize()
            .linear(1.3, -12) // Enhance ink contrast
            .sharpen({ sigma: 1.2 })
            .toFormat('png')
            .toBuffer();

        const worker = await this.getWorker();
        const { data: { text } } = await worker.recognize(processedBuffer);
        return text;
    }

    async extractAndParse(file: Express.Multer.File): Promise<{ data: ExtractedReceiptData; rawText: string; engine: string; imageUrl?: string }> {
        const engine = 'Tesseract (Turbo Caching v4)';
        let text = '';
        let imageUrl = '';

        try {
            console.log('OCR: Processing image concurrently with parallel upload...');
            const [uploadedUrl, extractedText] = await Promise.all([
                this.uploadImage(file).catch(err => {
                    console.warn('Image upload error (non-fatal):', err.message);
                    return '';
                }),
                this.recognizeImage(file.buffer)
            ]);

            imageUrl = uploadedUrl;
            text = extractedText;

            console.log('--- RAW OCR LOG START ---');
            console.log(text);
            console.log('--- RAW OCR LOG END ---');
        } catch (e: any) {
            console.error('OCR Process Failure:', e.message);
            return { data: {}, rawText: '', engine: 'Failed', imageUrl };
        }

        const parsedData = this.parseReceiptText(text);

        return {
            data: parsedData,
            rawText: text,
            engine,
            imageUrl
        };
    }

    private parseReceiptText(text: string): ExtractedReceiptData {
        const data: ExtractedReceiptData = {};
        // Replace visual noise and normalize line breaks
        const cleanText = text.replace(/[\r\n]+/g, '\n');
        const digitFocusText = cleanText.replace(/(\d)\s+(?=\d|[.,/:\-]\d)/g, '$1');

        // 1. AMOUNT (Settled Amount - without fees)
        // e.g. "AMOUNT EGP 350.00" or "AMOUNT: 350.00" (avoid T.AMOUNT which is total)
        const amountRegex = /(?:^|\s|[^T\.])AMOUNT[\s\.:#]*(?:EGP|LE|ج\.م)?\s*(\d{1,6}(?:\.\d{2})?)/i;
        const amountMatch = digitFocusText.match(amountRegex);
        if (amountMatch) {
            data.totalAmount = parseFloat(amountMatch[1]);
        } else {
            // Fallback: pick smallest positive amount (usually Net is smaller than Total)
            const allAmounts = digitFocusText.match(/(\d{1,6}\.\d{2})/g);
            if (allAmounts) {
                const nums = Array.from(new Set(allAmounts.map(v => parseFloat(v)))).filter(v => v > 0.5);
                if (nums.length >= 3) {
                    nums.sort((a, b) => b - a);
                    data.totalAmount = nums[1]; // Pick middle value
                } else if (nums.length > 0) {
                    data.totalAmount = Math.min(...nums);
                }
            }
        }

        // 2. BATCH NUMBER (Resilient matching for O/0 and I/1)
        // e.g. "BATCH NO.000085", "BATCH NO: 000085", "BATCH: 000085", "BATCH OOOO85"
        const batchLine = cleanText.match(/BATCH[^\n\r]{0,30}/i);
        if (batchLine) {
            const normalized = batchLine[0]
                .replace(/[OoD]/g, '0')
                .replace(/[Il|!\]\[]/g, '1');
            const num = normalized.match(/(\d{4,6})/);
            if (num) {
                data.batchNumber = num[1].padStart(6, '0');
            }
        }

        // 3. APPROVAL NUMBER (AUTH CODE / APPROVAL)
        // e.g. "AUTH CODE:215757", "AUTH CODE: 215757", "AUTH: 215757", "APPROVAL: 215757"
        const authLine = cleanText.match(/(?:AUTH\s*CODE|AUTH|APPROVAL|APPROV|APPR|موافقة|الموافقة)[^\n\r]{0,30}/i);
        if (authLine) {
            const normalized = authLine[0]
                .replace(/[OoD]/g, '0')
                .replace(/[Il|!\]\[]/g, '1')
                .replace(/[Ss]/g, '5');
            const num = normalized.match(/(\d{4,8})/);
            if (num) {
                data.approvalNumber = num[1];
            }
        }

        // 4. CARD PAN (First 6 BIN & Last 4 Digits)
        // e.g. "422322******8150", "422322......8150", "422322XXXXXX8150"
        const panMatch = digitFocusText.match(/\b([459]\d{5})[^\d\n\r]{2,14}(\d{4})\b/);
        if (panMatch) {
            data.cardBin = panMatch[1];
            data.last4Digits = panMatch[2];
        } else {
            // Match any 6 digits starting with 4 (Visa), 5 (MasterCard), or 9 (Meeza)
            const binMatch = digitFocusText.match(/\b([459]\d{5})\b/);
            if (binMatch) data.cardBin = binMatch[1];

            // Match last 4 digits preceded by mask characters
            const last4Match = digitFocusText.match(/[\*xX\.]{2,}[^\d\n\r]{0,5}(\d{4})\b/);
            if (last4Match) data.last4Digits = last4Match[1];
        }

        // 5. DATE & TIME
        // e.g. "DATE:09/08/2026", "09/08/2026", "DATE: O9/O8/2026"
        const dateMatch = cleanText.match(/(?:DATE|التاريخ)?[^\n\r]{0,10}\b([0-3]?[0-9Oo][/\-\.][0-1]?[0-9Oo][/\-\.](?:20)?[0-9Oo]{2})\b/i);
        if (dateMatch) {
            const cleanedDateStr = dateMatch[1].replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
            const parts = cleanedDateStr.split(/[/\-\.]/);
            if (parts.length === 3) {
                const day = parts[0].padStart(2, '0');
                const month = parts[1].padStart(2, '0');
                let year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                if (year === '2076') year = '2026';
                data.date = `${year}-${month}-${day}`;
            }
        }

        // e.g. "TIME:09:58:59", "09:58:59", "TIME: O9:58:59"
        const timeMatch = cleanText.match(/(?:TIME|الوقت)?[^\n\r]{0,10}\b([0-2]?[0-9Oo]:[0-5][0-9Oo](?::[0-5][0-9Oo])?)\b/i);
        if (timeMatch) {
            const cleanedTimeStr = timeMatch[1].replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
            data.time = cleanedTimeStr.length === 5 ? `${cleanedTimeStr}:00` : cleanedTimeStr;
        }

        return data;
    }
}

export default new OCRService();