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
    last4Digits?: string;
    date?: string;
    time?: string;
    imageUrl?: string;
}

export class OCRService {
    // ...

    async extractAndParse(file: Express.Multer.File): Promise<{ data: ExtractedReceiptData; rawText: string }> {

        let uploadBuffer = file.buffer;
        let contentType = file.mimetype;

        try {
            // Optimize Image: Resize to max 1200px width, Convert to JPEG, Quality 65%
            uploadBuffer = await sharp(file.buffer)
                .resize({ width: 1200, withoutEnlargement: true })
                .jpeg({ quality: 65, mozjpeg: true })
                .toBuffer();
            contentType = 'image/jpeg';
        } catch (e) {
            console.warn('Image optimization failed, using original file', e);
        }

        // 1. Upload to Supabase Storage
        let publicUrl = '';
        try {
            const fileName = `receipts/${Date.now()}_compressed.jpg`;
            const { data, error } = await supabase.storage
                .from('receipts')
                .upload(fileName, uploadBuffer, {
                    contentType,
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

        // 2. Perform OCR (using ara+eng)
        // Note: First run might be slow as it downloads language data
        const { data: { text } } = await Tesseract.recognize(file.buffer, 'ara+eng');

        // 3. Parse Text
        const parsedData = this.parseReceiptText(text);
        if (publicUrl) parsedData.imageUrl = publicUrl;

        return {
            data: parsedData,
            rawText: text
        };
    }

    private parseReceiptText(text: string): ExtractedReceiptData {
        const data: ExtractedReceiptData = {};
        const lines = text.split('\n');

        // Regex Patterns (Adapted for Egyptian Receipts)
        const patterns = {
            batch: /(?:Batch|الباتش|رقم الباتش)[:\.\s]*(\d+)/i,
            approval: /(?:Approval|Appr|Auth|الموافقة|رقم الموافقة)[:\.\s]*(\d+)/i,
            merchant: /(?:Merchant|Merch|Tajer|التاجر)[:\.\s]*(\d+)/i,
            terminal: /(?:Terminal|Term|TID|الطرفية)[:\.\s]*(\d+)/i,
            amount: /(?:Amount|Total|Sale|المبلغ|الاجمالي)[:\.\s]*(\d[\d\.,]*)/i,
            date: /(\d{2}[\/\-]\d{2}[\/\-]\d{4})/,
            time: /(\d{2}:\d{2}(?::\d{2})?)/,
            last4: /(?:\*{4}\s*(\d{4}))/,
            rrn: /(?:RRN|Ref|Reference)[:\.\s]*(\d+)/i
        };

        // Scan full text first (better for labeled fields)
        const batchMatch = text.match(patterns.batch);
        if (batchMatch) data.batchNumber = batchMatch[1];

        const apprMatch = text.match(patterns.approval);
        if (apprMatch) data.approvalNumber = apprMatch[1];

        const merchMatch = text.match(patterns.merchant);
        if (merchMatch) data.merchantCode = merchMatch[1];

        const termMatch = text.match(patterns.terminal);
        if (termMatch) data.terminalId = termMatch[1];

        const last4Match = text.match(patterns.last4);
        if (last4Match) data.last4Digits = last4Match[1];

        const rrnMatch = text.match(patterns.rrn);
        if (rrnMatch) data.rrn = rrnMatch[1];

        // Date & Time
        const dateMatch = text.match(patterns.date);
        if (dateMatch) {
            // Normalize Date to YYYY-MM-DD
            // Assuming DD/MM/YYYY common in EG
            const parts = dateMatch[1].split(/[\/\-]/);
            if (parts[0].length === 2 && parts[2].length === 4) {
                // DD/MM/YYYY
                data.date = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else {
                data.date = dateMatch[1];
            }
        }

        const timeMatch = text.match(patterns.time);
        if (timeMatch) data.time = timeMatch[1];

        // Amount needs cleanup (remove commas)
        const amountMatch = text.match(patterns.amount);
        if (amountMatch) {
            const rawAmount = amountMatch[1].replace(/,/g, '');
            data.totalAmount = parseFloat(rawAmount);
        }

        return data;
    }
}

export default new OCRService();
