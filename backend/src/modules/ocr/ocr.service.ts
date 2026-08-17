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
                tessedit_char_whitelist: '0123456789.:-/,ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzابتثجحخدذرزسشصضطظعغفقكلمنهويي*# ',
                tessedit_pagesegmode: '3' as any
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

        // Image pre-processing: Resize, Grayscale, Sharpen, Normalize contrast
        const processedBuffer = await image
            .resize({ width: 2000, withoutEnlargement: true })
            .grayscale()
            .normalize()
            .sharpen()
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
        // Replace visual noise
        const cleanText = text.replace(/[\r\n]+/g, '\n').replace(/[I|l|i](?=\d)/g, '1');
        // Compact numbers with spaces e.g. "09 / 08 / 2026" or "4897 052 009"
        const digitFocusText = cleanText.replace(/(\d)\s+(?=\d|[.,/:\-]\d)/g, '$1');
        const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);

        const cleanAmount = (str: string) => parseFloat(str.replace(/,/g, ''));

        // 1. BANK DETECTION
        if (/BANQUE\s*MISR|بنك\s*مصر/i.test(text)) {
            data.bankName = 'BANQUE MISR';
        } else if (/NATIONAL\s*BANK|NBE|الأهلي/i.test(text)) {
            data.bankName = 'NBE';
        } else if (/CIB|التجاري\s*الدولي/i.test(text)) {
            data.bankName = 'CIB';
        } else if (/QNB|قطر\s*الوطني/i.test(text)) {
            data.bankName = 'QNB';
        }

        // 2. CARD TYPE / BRAND
        if (/MEEZA|ميزة/i.test(text)) {
            data.cardType = 'Meeza';
        } else if (/MASTERCARD|MASTER\s*CARD/i.test(text)) {
            data.cardType = 'MasterCard';
        } else if (/VISA/i.test(text)) {
            data.cardType = 'Visa';
        }

        // 3. SERVICE CATEGORY
        if (/SMART|سمارت/i.test(text)) {
            data.serviceCategory = 'SMART';
        } else if (/TAMWEEN|تموين/i.test(text)) {
            data.serviceCategory = 'TAMWEEN';
        }

        // 4. AMOUNT LOGIC
        // Check for specific "AMOUNT EGP 350.00" (avoid T.AMOUNT which is total)
        const specificAmountMatch = digitFocusText.match(/(?:^|\n|[\s])AMOUNT[\s\.:#]*(?:EGP|ج\.م|LE)?\s*(\d{1,6}(?:\.\d{2})?)/i);
        if (specificAmountMatch) {
            data.totalAmount = parseFloat(specificAmountMatch[1]);
        } else {
            // Fallback: pick the net amount (middle if 3 numbers found)
            const allAmounts = digitFocusText.match(/(\d{1,3}(?:,\d{3})*\.\d{2})/g);
            if (allAmounts) {
                const vals = Array.from(new Set(allAmounts.map(v => cleanAmount(v))))
                    .filter(v => v > 0.5)
                    .sort((a, b) => b - a);

                if (vals.length >= 3) {
                    data.totalAmount = vals[1]; // Net amount
                } else if (vals.length > 0) {
                    data.totalAmount = Math.min(...vals);
                }
            }
        }

        // 5. CARD PAN (BIN & Last 4 digits) - e.g. 422322******8150 or 422322****8150
        const panMatch = digitFocusText.match(/\b([459]\d{5})[\*xX\s\-\.]{4,8}(\d{4})\b/);
        if (panMatch) {
            data.cardBin = panMatch[1];
            data.last4Digits = panMatch[2];
        } else {
            const anyPan = digitFocusText.match(/\b(\d{6})[\*xX\s\-\.]{4,8}(\d{4})\b/);
            if (anyPan) {
                data.cardBin = anyPan[1];
                data.last4Digits = anyPan[2];
            }
        }

        // Fallbacks for BIN and last 4 if not matched together
        if (!data.last4Digits) {
            const last4Match = digitFocusText.match(/[\*xX]{4,}[\s\-]*(\d{4})/);
            if (last4Match) data.last4Digits = last4Match[1];
        }
        if (!data.cardBin) {
            const binMatch = digitFocusText.match(/\b([459]\d{5})[\*xX]/);
            if (binMatch) data.cardBin = binMatch[1];
        }

        // 6. BATCH & AUTH (Strict patterns)
        // e.g. BATCH NO.000085 or BATCH: 000085 or BATCH 000085
        const batchMatch = digitFocusText.match(/(?:BATCH\s*NO|BATCH\s*#|BATCH|BATC|ATCH|باتش)[\s\.:#]*(\d{4,6})/i);
        if (batchMatch) {
            data.batchNumber = batchMatch[1].padStart(6, '0');
        }

        // e.g. AUTH CODE:215757 or AUTH: 215757 or APPROVAL: 215757
        const authMatch = digitFocusText.match(/(?:AUTH\s*CODE|AUTH\s*#|AUTH|APPROVAL|APPR|موافقة|الموافقة|كود\s*الموافقة)[\s\.:#]*([0-9]{4,8})/i);
        if (authMatch) {
            data.approvalNumber = authMatch[1];
        }

        // 7. TERMINAL ID (TID) & MERCHANT CODE (MID)
        // e.g. TID:85174124
        const tidMatch = digitFocusText.match(/(?:TID|TERM|TERMINAL)[\s\.:#]*(\d{8})/i);
        if (tidMatch) data.terminalId = tidMatch[1];

        // e.g. MID:4897052009 (Must start with non-zero digit to avoid AID/TVR zeroes!)
        const midMatch = digitFocusText.match(/(?:MID|MIC|MERCHANT\s*ID|MERCHANT|تاجر)[\s\.:#]*([1-9]\d{7,14})/i);
        if (midMatch) {
            data.merchantCode = midMatch[1];
        }

        // 8. RRN, INVOICE, STAN
        // e.g. RECEIPT #:000222 or RRN: 123456789012 or STAN: 000248
        const rrnMatch = digitFocusText.match(/(?:RRN|REF|REFERENCE|مرجع)[\s\.:#]*(\d{8,12})/i);
        if (rrnMatch) data.rrn = rrnMatch[1];

        const invMatch = digitFocusText.match(/(?:RECEIPT\s*#|RECEIPT|INV|INVOICE|فاتورة|STAN)[\s\.:#]*(\d{4,8})/i);
        if (invMatch) data.invoiceNumber = invMatch[1];

        // 9. MERCHANT NAME
        for (const line of lines) {
            // Find store name below bank header, skip purely technical/banking words and zero numbers
            if (!/BANQUE|MISR|BANK|NBE|CIB|QNB|بنك|POS|PURCHASE|SALE|VERIFONE|INGENICO|COPY|MERCHANT|TID|MID|DATE|TIME|AUTH|BATCH|^0+$/i.test(line)) {
                if (line.length > 3 && !/^\d+$/.test(line)) {
                    data.merchantName = line;
                    break;
                }
            }
        }

        // 10. DATE & TIME
        // e.g. DATE:09/08/2026 or 09/08/2026
        const dateMatch = digitFocusText.match(/(?:DATE|التاريخ)?[\s\.:#]*\b([0-3]?\d)[/\-\.]([0-1]?\d)[/\-\.]((?:20)?\d{2})\b/i);
        if (dateMatch) {
            const day = dateMatch[1].padStart(2, '0');
            const month = dateMatch[2].padStart(2, '0');
            let year = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3];
            if (year === '2076') year = '2026';
            data.date = `${year}-${month}-${day}`;
        }

        // e.g. TIME:09:58:59 or 09:58:59
        const timeMatch = digitFocusText.match(/(?:TIME|الوقت)?[\s\.:#]*\b([0-2]?\d:[0-5]\d(?::[0-5]\d)?)\b/i);
        if (timeMatch) {
            data.time = timeMatch[1].length === 5 ? `${timeMatch[1]}:00` : timeMatch[1];
        }

        return data;
    }
}

export default new OCRService();