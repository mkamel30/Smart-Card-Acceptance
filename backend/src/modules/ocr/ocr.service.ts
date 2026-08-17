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
        const cleanText = text.replace(/[\r\n]+/g, '\n').replace(/[I|l|i]/g, '1');
        const digitFocusText = cleanText.replace(/(\d)\s+(?=\d|[.,]\d)/g, '$1');
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

        // 3. AMOUNT LOGIC
        // Pick the correct net amount among detected numbers
        const allAmounts = digitFocusText.match(/(\d{1,3}(?:,\d{3})*\.\d{2})/g);
        if (allAmounts) {
            const vals = Array.from(new Set(allAmounts.map(v => cleanAmount(v))))
                .filter(v => v > 0.5)
                .sort((a, b) => b - a); // Descending

            if (vals.length >= 3) {
                // If 3+ numbers: usually [Total, Net, Fee] -> Pick the middle one as Net/Settled
                data.totalAmount = vals[1];
            } else if (vals.length > 0) {
                // If 1 or 2 found, pick the smaller one as Net if multiple, else the one found
                data.totalAmount = Math.min(...vals);
            }
        }

        // 4. CARD PAN (BIN & Last 4 digits)
        const globalBinMatch = digitFocusText.match(/\b(\d{6})[\*xX\s\-\.]{4,}/);
        if (globalBinMatch) data.cardBin = globalBinMatch[1];

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toUpperCase().includes('SALE') || lines[i].includes('شراء') || lines[i].includes('بطاقة')) {
                for (let j = i; j < Math.min(i + 4, lines.length); j++) {
                    const l = lines[j];
                    if (l.length < 4) continue;
                    let endPart = l.slice(-10).replace(/\s/g, '');
                    let numericEnd = endPart.replace(/G/g, '9').replace(/S/g, '5').replace(/O/g, '0').match(/\d{4}$/);
                    if (numericEnd) {
                        data.last4Digits = numericEnd[0];
                        if (!data.cardBin) data.cardBin = '000000';
                        break;
                    }
                }
                if (data.last4Digits) break;
            }
        }

        // Fallback for last 4 digits anywhere in masked card line
        if (!data.last4Digits) {
            const cardLineMatch = digitFocusText.match(/[\*xX]{4,}[\s\-]*(\d{4})/);
            if (cardLineMatch) {
                data.last4Digits = cardLineMatch[1];
            }
        }

        // 5. BATCH & AUTH (Strict digits)
        const batchMatch = digitFocusText.match(/(?:BATCH|BATC|ATCH|باتش)[\s\S]{0,20}?(\d{4,6})/i);
        if (batchMatch) {
            data.batchNumber = batchMatch[1].padStart(6, '0');
        }

        const authMatch = digitFocusText.match(/(?:AUTH|APPR|APPROVAL|الموافقة|موافقة)[\s\S]{0,20}?(\d{4,8})/i);
        if (authMatch) {
            data.approvalNumber = authMatch[1];
        }

        // 6. RRN & INVOICE
        const rrnMatch = digitFocusText.match(/(?:RRN|REF|REFERENCE|مرجع)[\s\.:#]*(\d{8,12})/i);
        if (rrnMatch) data.rrn = rrnMatch[1];

        const invMatch = digitFocusText.match(/(?:INV|INVOICE|فاتورة)[\s\.:#]*(\d{4,8})/i);
        if (invMatch) data.invoiceNumber = invMatch[1];

        // 7. TERMINAL ID (TID) & MERCHANT CODE (MID)
        const tidMatch = digitFocusText.match(/(?:TID|TERM|TERMINAL)[\s\.:#]*(\d{8})/i);
        if (tidMatch) data.terminalId = tidMatch[1];

        const midMatch = digitFocusText.match(/(?:MID|MIC|MERCHANT|تاجر)[\s\.:#]*(\d{8,15})/i);
        if (midMatch) data.merchantCode = midMatch[1];

        if (!data.merchantCode) {
            const anyLongNum = digitFocusText.match(/\b\d{10,15}\b/);
            if (anyLongNum) data.merchantCode = anyLongNum[0];
        }

        // 8. MERCHANT NAME (Look at the top 4 lines for store/merchant name)
        for (let i = 0; i < Math.min(4, lines.length); i++) {
            const candidate = lines[i];
            // Skip bank names or common POS header labels
            if (!/BANQUE|BANK|NBE|CIB|QNB|بنك|POS|PURCHASE|SALE|VERIFONE|INGENICO/i.test(candidate) && candidate.length > 3) {
                data.merchantName = candidate;
                break;
            }
        }

        // 9. DATE & TIME
        const dateMatch = digitFocusText.match(/\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\b/);
        if (dateMatch) {
            const parts = dateMatch[1].split(/[/\-\.]/);
            let year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            if (year === '2076') year = '2026';
            data.date = `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }

        const timeMatch = digitFocusText.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
        if (timeMatch) {
            data.time = timeMatch[1].length === 5 ? `${timeMatch[1]}:00` : timeMatch[1];
        }

        return data;
    }
}

export default new OCRService();