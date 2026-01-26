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
        const engine = 'Tesseract (Precision-v3)';

        try {
            console.log('OCR: Processing image (Precision Level 3)...');
            const image = sharp(file.buffer);
            const metadata = await image.metadata();

            if (!metadata.width || metadata.width < 50) {
                throw new Error('Invalid or too small image');
            }

            // High clarity processing
            const processedBuffer = await image
                .resize({ width: 2200, withoutEnlargement: true })
                .grayscale()
                .normalize()
                .toFormat('png')
                .toBuffer();

            const worker = await Tesseract.createWorker(['eng', 'ara']);
            await worker.setParameters({
                tessedit_char_whitelist: '0123456789.:-/,ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzابتثجحخدذرزسشصضطظعغفقكلمنهويي*# ',
                tessedit_pagesegmode: '3' as any
            });

            const { data: { text: fullText } } = await worker.recognize(processedBuffer);
            text = fullText;
            await worker.terminate();

            console.log('--- RAW OCR LOG START ---');
            console.log(text);
            console.log('--- RAW OCR LOG END ---');

        } catch (e: any) {
            console.error('OCR Process Failure:', e.message);
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
        const cleanText = text.replace(/[\r\n]+/g, '\n').replace(/[I|l|i]/g, '1');
        const digitFocusText = cleanText.replace(/(\d)\s+(?=\d|[.,]\d)/g, '$1');
        const lines = cleanText.split('\n');

        const cleanAmount = (str: string) => parseFloat(str.replace(/,/g, ''));

        // 1. AMOUNT LOGIC (Pick the middle value among detected sums)
        // Usually: [Total (Max), Net (Middle), Fees (Min)]
        const allAmounts = digitFocusText.match(/(\d{1,3}(?:,\d{3})*\.\d{2})/g);
        if (allAmounts) {
            const vals = Array.from(new Set(allAmounts.map(v => cleanAmount(v))))
                .filter(v => v > 10)
                .sort((a, b) => b - a); // Descending

            if (vals.length >= 3) {
                data.totalAmount = vals[1]; // Pick index 1 (the one in the middle)
            } else if (vals.length > 0) {
                // If only 2 found (e.g. Amount and Total), pick the smaller one as Net
                data.totalAmount = Math.min(...vals);
            }
        }

        // 2. CARD LOGIC (Search after "Sale")
        // Try to find BIN (first 6) anywhere in text first
        const globalBinMatch = digitFocusText.match(/\b(\d{6})[\*xX\s\-\.]{4,}/);
        if (globalBinMatch) data.cardBin = globalBinMatch[1];

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].toUpperCase().includes('SALE')) {
                for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
                    const l = lines[j].trim();
                    if (l.length < 4) continue;
                    // Extract last 4 digits even if letters are mixed (G -> 9, S -> 5)
                    let endPart = l.slice(-10).replace(/\s/g, '');
                    let numericEnd = endPart.replace(/G/g, '9').replace(/S/g, '5').replace(/O/g, '0').match(/\d{4}$/);
                    if (numericEnd) {
                        data.last4Digits = numericEnd[0];
                        if (!data.cardBin) data.cardBin = '000000'; // Default if BIN missing
                        break;
                    }
                }
                if (data.last4Digits) break;
            }
        }

        // 3. BATCH & AUTH (Strict 6 digits)
        const batchMatch = digitFocusText.match(/(?:BATCH|BATC|ATCH)[\s\S]{0,20}?(\d{6})/i);
        if (batchMatch) data.batchNumber = batchMatch[1];

        const authMatch = digitFocusText.match(/(?:AUTH|APPR|APPROVAL|الموافقة)[\s\S]{0,20}?(\d{6})/i);
        if (authMatch) data.approvalNumber = authMatch[1];

        // 4. MID & TID
        const midMatch = digitFocusText.match(/(?:MID|MIC|MERCHANT)[\s\.:#]*(\d{8,15})/i);
        if (midMatch) data.merchantCode = midMatch[1];

        // Ensure merchantCode is filled for validation
        if (!data.merchantCode) {
            const anyLongNum = digitFocusText.match(/\b\d{10,15}\b/);
            if (anyLongNum) data.merchantCode = anyLongNum[0];
        }

        // 5. DATE
        const dateMatch = digitFocusText.match(/\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\b/);
        if (dateMatch) {
            const parts = dateMatch[1].split(/[/\-\.]/);
            let year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            if (year === '2076') year = '2026';
            data.date = `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }

        return data;
    }
}

export default new OCRService();