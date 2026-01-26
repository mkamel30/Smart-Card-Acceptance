import Tesseract from 'tesseract.js';
import sharp from 'sharp';
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
        let text = '';
        const engine = 'Tesseract (Segmented)';

        try {
            console.log('OCR: Starting Smart Segmentation Mode...');
            const image = sharp(file.buffer);
            const metadata = await image.metadata();
            const width = metadata.width || 1000;
            const height = metadata.height || 2000;

            // ZONE 1: Header (Top 40%) -> Date, Time, Merchant
            const headerBuffer = await image.clone()
                .extract({ left: 0, top: 0, width: width, height: Math.floor(height * 0.4) })
                .grayscale()
                .resize({ width: 1500 })
                .toBuffer();

            // ZONE 2: Footer (Bottom 60%) -> Amount, Batch, Card, Auth
            // Adjusted threshold to 140 to be less aggressive (fixes 4 read as 3)
            const footerBuffer = await image.clone()
                .extract({ left: 0, top: Math.floor(height * 0.4), width: width, height: Math.floor(height * 0.6) })
                .grayscale()
                .normalize()
                .threshold(140)
                .resize({ width: 1500 })
                .toBuffer();

            const worker = await Tesseract.createWorker(['eng', 'ara']);
            await worker.setParameters({
                tessedit_char_whitelist: '0123456789.:-/,ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzابتثجحخدذرزسشصضطظعغفقكلمنهويي*# ',
                tessedit_pagesegmode: '6' as any
            });

            const { data: { text: headerText } } = await worker.recognize(headerBuffer);
            const { data: { text: footerText } } = await worker.recognize(footerBuffer);

            await worker.terminate();
            text = headerText + '\n' + footerText;

        } catch (e: any) {
            console.error('OCR Fatal Error:', e.message);
            return { data: {}, rawText: '', engine: 'Failed' };
        }

        return {
            data: this.parseReceiptText(text),
            rawText: text,
            engine
        };
    }

    private parseReceiptText(text: string): ExtractedReceiptData {
        const data: ExtractedReceiptData = {};
        const cleanText = text.replace(/[\r\n]+/g, '\n').replace(/[I|l]/g, '1');
        const digitFocusText = cleanText.replace(/(\d)\s+(?=\d|[.,]\d)/g, '$1');

        console.log('--- OCR Final Parsing ---');

        // 1. DATE: 22/01/2026
        const dateMatch = digitFocusText.match(/\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\b/);
        if (dateMatch) {
            const parts = dateMatch[1].split(/[/\-\.]/);
            let year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            if (year === '2076') year = '2026';
            data.date = `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }

        // 2. TIME: 14:00:13
        const timeMatch = cleanText.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
        if (timeMatch) data.time = timeMatch[1];

        // 3. AMOUNT: Strict capture for 1,334.21
        const cleanAmount = (str: string) => parseFloat(str.replace(/,/g, ''));
        const amountMatch = digitFocusText.match(/(?:T\.AMOUNT|TOTAL|SALE|AMOUNT|المبلغ|الإجمالي)[\s\S]{0,15}?(\d{1,3}(?:,\d{3})*\.\d{2})/i);
        if (amountMatch) {
            data.totalAmount = cleanAmount(amountMatch[1]);
        }

        // 4. BATCH: Exactly 6 digits
        const batchMatch = digitFocusText.match(/(?:BATCH)[\s\S]{0,15}?(\d{6})\b/i);
        if (batchMatch) data.batchNumber = batchMatch[1];

        // 5. APPROVAL CODE
        const authMatch = digitFocusText.match(/(?:AUTH|APPR|APPROVAL|الموافقة)[\s\S]{0,15}?(\d{6})/i);
        if (authMatch) data.approvalNumber = authMatch[1];

        // 6. RECEIPT # / INVOICE
        const receiptMatch = digitFocusText.match(/(?:RECEIPT\s*#|الايصال)[\s\.:]*(\d+)/i);
        if (receiptMatch) data.invoiceNumber = receiptMatch[1];

        // 7. CARD LAST 4: ************9009
        const cardMatch = digitFocusText.match(/(\*{4,})\s*(\d{4})\b/);
        if (cardMatch) {
            data.cardBin = '******';
            data.last4Digits = cardMatch[2];
        }

        // 8. MERCHANT (MID) 
        const midMatch = digitFocusText.match(/(?:MID|MERCHANT|التاجر)[\s\.:#]*(\d{10,15})/i);
        if (midMatch) data.merchantCode = midMatch[1];

        return data;
    }
}

export default new OCRService();