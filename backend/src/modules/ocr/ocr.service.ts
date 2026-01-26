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
        const engine = 'Tesseract (Fast-Pro)';

        try {
            console.log('OCR: Processing image (Fast Mode)...');
            const image = sharp(file.buffer);

            // Balanced processing for speed and accuracy
            const processedBuffer = await image
                .resize({ width: 1800 }) // 2x approx for typical receipts
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

        console.log('--- Optimized Parsing ---');

        // 1. DATE: Matches 22/01/2026 or similar
        const dateMatch = digitFocusText.match(/\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\b/);
        if (dateMatch) {
            const parts = dateMatch[1].split(/[/\-\.]/);
            let year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            if (year === '2076') year = '2026';
            data.date = `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }

        // 2. TIME
        const timeMatch = cleanText.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\b/);
        if (timeMatch) data.time = timeMatch[1];

        // 3. AMOUNT (The Smallest Decimal Logic - Reliable for Net Amount)
        const cleanAmount = (str: string) => {
            const cleaned = str.replace(/,/g, '');
            return parseFloat(cleaned);
        };

        const allAmounts = digitFocusText.match(/(\d{1,3}(?:,\d{3})*\.\d{2})/g);
        if (allAmounts) {
            const vals = allAmounts.map(v => cleanAmount(v)).filter(v => v > 10);
            if (vals.length > 0) {
                // Return the smallest decimal found (Net Amount vs Fees/Total)
                data.totalAmount = Math.min(...vals);
            }
        }

        // 4. BATCH: Exactly 6 digits
        // Look for BATCH label then find the first 6-digit sequence near it
        const batchMatch = digitFocusText.match(/BATCH[\s\S]{0,20}?(\d{6})/i);
        if (batchMatch) data.batchNumber = batchMatch[1];

        // 5. APPROVAL CODE
        const authMatch = digitFocusText.match(/(?:AUTH|APPR|APPROVAL)[\s\S]{1,15}?(\d{6})/i);
        if (authMatch) data.approvalNumber = authMatch[1];

        // 6. RECEIPT # / INVOICE
        const receiptMatch = digitFocusText.match(/(?:RECEIPT|ECEIP)[\s\S]{0,10}?(\d+)/i);
        if (receiptMatch) data.invoiceNumber = receiptMatch[1];

        // 7. CARD LAST 4 (Robust: look for digits after Sale or in lines with letters/signs)
        // Matches: ************9009 or G09 (as G sometimes = 9)
        const lines = cleanText.split('\n');
        let saleFound = false;
        for (const line of lines) {
            if (line.toUpperCase().includes('SALE')) {
                saleFound = true;
                continue;
            }
            if (saleFound) {
                // The line after Sale usually has the card number
                const last4Match = line.replace(/\s/g, '').match(/(\d{4})\b/);
                if (last4Match) {
                    data.last4Digits = last4Match[1];
                    data.cardBin = '******';
                    break;
                }
                // Fallback: If OCR distorted digits into letters (like G=9)
                const distortedMatch = line.match(/([A-Z0-9]{4})\b$/);
                if (distortedMatch) {
                    let raw = distortedMatch[1].replace(/G/g, '9').replace(/S/g, '5').replace(/O/g, '0');
                    if (/^\d{4}$/.test(raw)) {
                        data.last4Digits = raw;
                        data.cardBin = '******';
                        break;
                    }
                }
            }
        }

        // 8. MERCHANT (MID) 
        const midMatch = digitFocusText.match(/(?:MID|MIC|MERCHANT)[\s\.:#]*(\d{10,15})/i);
        if (midMatch) data.merchantCode = midMatch[1];

        return data;
    }
}

export default new OCRService();