import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { supabase } from '../../config/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

// ─── Gemini Vision Prompt ─────────────────────────────────────────────
const GEMINI_RECEIPT_PROMPT = `You are a POS receipt OCR parser. Extract ONLY these fields from the receipt image.
Return a JSON object with these exact keys (use null if a field is not found):

{
  "date": "DD/MM/YYYY format",
  "time": "HH:MM:SS format (24-hour)",
  "amount": numeric value of the settled amount WITHOUT fees (look for "AMOUNT" not "T.AMOUNT"),
  "batchNumber": "the batch number as string, preserve leading zeros",
  "approvalNumber": "the auth/approval code as string",
  "cardBin": "first 6 digits of the card number",
  "last4Digits": "last 4 digits of the card number"
}

IMPORTANT RULES:
- For "amount": Extract the line labeled "AMOUNT" (without the "T." prefix). This is the net amount before fees.
- For "date": Look for "DATE:" line. Return in DD/MM/YYYY format.
- For "time": Look for "TIME:" line. Return in HH:MM:SS 24-hour format.
- For "batchNumber": Look for "BATCH NO." or "BATCH:" line. Preserve leading zeros (e.g., "000085").
- For "approvalNumber": Look for "AUTH CODE:" or "APPROVAL:" line.
- For "cardBin": The first 6 digits from the card PAN line (e.g., from "422322******8150" extract "422322").
- For "last4Digits": The last 4 digits from the card PAN line (e.g., from "422322******8150" extract "8150").
- Return ONLY the JSON object, no markdown, no explanation.`;

export class OCRService {
    private worker: Tesseract.Worker | null = null;
    private workerPromise: Promise<Tesseract.Worker> | null = null;
    private geminiModel: any = null;

    /**
     * Initialize Gemini Vision model (lazy singleton)
     */
    private getGeminiModel() {
        if (this.geminiModel) return this.geminiModel;

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('OCR: GEMINI_API_KEY not set, Gemini Vision unavailable');
            return null;
        }

        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            this.geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
            console.log('OCR: Gemini Flash Vision model initialized');
            return this.geminiModel;
        } catch (e: any) {
            console.error('OCR: Failed to initialize Gemini:', e.message);
            return null;
        }
    }

    /**
     * Tesseract Singleton Worker - fallback engine
     */
    private async getWorker(): Promise<Tesseract.Worker> {
        if (this.worker) return this.worker;
        if (this.workerPromise) return this.workerPromise;

        this.workerPromise = (async () => {
            console.log('OCR: Initializing Tesseract Worker (eng+ara) as fallback...');
            const worker = await Tesseract.createWorker(['eng', 'ara']);
            await worker.setParameters({
                tessedit_pagesegmode: '4' as any
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
                .rotate()
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

    // ─── PRIMARY: Gemini Vision ───────────────────────────────────────
    private async extractWithGemini(buffer: Buffer): Promise<ExtractedReceiptData | null> {
        const model = this.getGeminiModel();
        if (!model) return null;

        try {

            // Preprocess image for better quality
            const processedBuffer = await sharp(buffer)
                .rotate()
                .resize({ width: 2000, withoutEnlargement: true })
                .toFormat('png')
                .toBuffer();
            const processedBase64 = processedBuffer.toString('base64');

            const result = await model.generateContent([
                GEMINI_RECEIPT_PROMPT,
                {
                    inlineData: {
                        data: processedBase64,
                        mimeType: 'image/png'
                    }
                }
            ]);

            const responseText = result.response.text().trim();
            console.log('--- GEMINI RAW RESPONSE ---');
            console.log(responseText);
            console.log('--- GEMINI RAW RESPONSE END ---');

            // Parse JSON from response (handle markdown code blocks)
            let jsonStr = responseText;
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
            }

            const parsed = JSON.parse(jsonStr);

            // Map Gemini response to our ExtractedReceiptData format
            const data: ExtractedReceiptData = {};

            if (parsed.date) {
                // Convert DD/MM/YYYY to YYYY-MM-DD
                const dateParts = parsed.date.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
                if (dateParts) {
                    const day = dateParts[1].padStart(2, '0');
                    const month = dateParts[2].padStart(2, '0');
                    const year = dateParts[3].length === 2 ? `20${dateParts[3]}` : dateParts[3];
                    data.date = `${year}-${month}-${day}`;
                }
            }

            if (parsed.time) {
                const timeParts = parsed.time.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
                if (timeParts) {
                    const hh = timeParts[1].padStart(2, '0');
                    const mm = timeParts[2];
                    const ss = timeParts[3] || '00';
                    data.time = `${hh}:${mm}:${ss}`;
                }
            }

            if (parsed.amount != null && !isNaN(Number(parsed.amount))) {
                data.totalAmount = Number(parsed.amount);
            }

            if (parsed.batchNumber) {
                data.batchNumber = String(parsed.batchNumber).replace(/\D/g, '').padStart(6, '0');
            }

            if (parsed.approvalNumber) {
                data.approvalNumber = String(parsed.approvalNumber).replace(/\D/g, '');
            }

            if (parsed.cardBin) {
                data.cardBin = String(parsed.cardBin).replace(/\D/g, '').slice(0, 6);
            }

            if (parsed.last4Digits) {
                data.last4Digits = String(parsed.last4Digits).replace(/\D/g, '').slice(-4);
            }

            return data;
        } catch (e: any) {
            console.error('OCR: Gemini Vision failed:', e.message);
            return null;
        }
    }

    // ─── FALLBACK: Tesseract ──────────────────────────────────────────
    private async recognizeWithTesseract(buffer: Buffer): Promise<string> {
        const image = sharp(buffer);
        const metadata = await image.metadata();

        if (!metadata.width || metadata.width < 50) {
            throw new Error('Invalid or too small image');
        }

        const processedBuffer = await image
            .rotate()
            .resize({ width: 2500, withoutEnlargement: true })
            .grayscale()
            .normalize()
            .sharpen()
            .toFormat('png')
            .toBuffer();

        const worker = await this.getWorker();
        const { data: { text } } = await worker.recognize(processedBuffer);
        return text;
    }

    // ─── MAIN ENTRY POINT ─────────────────────────────────────────────
    async extractAndParse(file: Express.Multer.File): Promise<{ data: ExtractedReceiptData; rawText: string; engine: string; imageUrl?: string }> {
        let imageUrl = '';

        // Start upload in background
        const uploadPromise = this.uploadImage(file).catch(err => {
            console.warn('Image upload error (non-fatal):', err.message);
            return '';
        });

        // ── Try Gemini Vision first ──
        console.log('OCR: Attempting Gemini Flash Vision (primary)...');
        const geminiData = await this.extractWithGemini(file.buffer);

        if (geminiData && this.hasMinimumFields(geminiData)) {
            imageUrl = await uploadPromise;
            const engine = '✨ Gemini Flash Vision';
            console.log(`OCR ENGINE: ${engine} — SUCCESS`);
            console.log('OCR Extracted:', JSON.stringify(geminiData, null, 2));

            return {
                data: geminiData,
                rawText: '[Gemini Vision - structured extraction]',
                engine,
                imageUrl
            };
        }

        // ── Fallback to Tesseract ──
        console.log('OCR: Gemini unavailable or insufficient results, falling back to Tesseract...');
        let text = '';
        const engine = '🔧 Tesseract (Fallback)';

        try {
            text = await this.recognizeWithTesseract(file.buffer);
            console.log('--- RAW OCR LOG START ---');
            console.log(text);
            console.log('--- RAW OCR LOG END ---');
        } catch (e: any) {
            console.error('OCR: Tesseract also failed:', e.message);
            imageUrl = await uploadPromise;
            return { data: {}, rawText: '', engine: 'Failed (both engines)', imageUrl };
        }

        imageUrl = await uploadPromise;
        const parsedData = this.parseReceiptText(text);
        console.log(`OCR ENGINE: ${engine}`);
        console.log('OCR Extracted:', JSON.stringify(parsedData, null, 2));

        return {
            data: parsedData,
            rawText: text,
            engine,
            imageUrl
        };
    }

    /**
     * Check if extracted data has at least 2 meaningful fields
     */
    private hasMinimumFields(data: ExtractedReceiptData): boolean {
        let count = 0;
        if (data.totalAmount) count++;
        if (data.batchNumber) count++;
        if (data.approvalNumber) count++;
        if (data.cardBin) count++;
        if (data.last4Digits) count++;
        if (data.date) count++;
        if (data.time) count++;
        return count >= 2;
    }

    // ─── Tesseract Text Parser (unchanged) ────────────────────────────
    private parseReceiptText(text: string): ExtractedReceiptData {
        const data: ExtractedReceiptData = {};
        // Replace visual noise and normalize line breaks
        const cleanText = text.replace(/[\r\n]+/g, '\n');
        const digitFocusText = cleanText.replace(/(\d)\s+(?=\d|[.,/:\-]\d)/g, '$1');

        // 1. AMOUNT (Settled Amount - without fees)
        const amountRegex = /(?:^|\s|[^T\.])AMOUNT[\s\.:#]*(?:EGP|LE|ج\.م)?\s*(\d{1,6}(?:\.\d{2})?)/i;
        const amountMatch = digitFocusText.match(amountRegex);
        if (amountMatch) {
            data.totalAmount = parseFloat(amountMatch[1]);
        } else {
            const allAmounts = digitFocusText.match(/(\d{1,6}\.\d{2})/g);
            if (allAmounts) {
                const nums = Array.from(new Set(allAmounts.map(v => parseFloat(v)))).filter(v => v > 0.5);
                if (nums.length >= 3) {
                    nums.sort((a, b) => b - a);
                    data.totalAmount = nums[1];
                } else if (nums.length > 0) {
                    data.totalAmount = Math.min(...nums);
                }
            }
        }

        // 2. BATCH NUMBER
        const batchLine = cleanText.match(/BATCH[^\n\r]{0,35}/i);
        if (batchLine) {
            const normalized = batchLine[0]
                .replace(/[OoD]/g, '0')
                .replace(/[Il|!\]\[]/g, '1')
                .replace(/[Ss]/g, '5')
                .replace(/[Bb]/g, '8')
                .replace(/[Gg]/g, '9');
            const num = normalized.match(/(\d{4,6})/);
            if (num) {
                data.batchNumber = num[1].padStart(6, '0');
            }
        }

        // 3. APPROVAL NUMBER
        const authLine = cleanText.match(/(?:AUTH\s*CODE|AUTH|APPROVAL|APPROV|APPR|موافقة|الموافقة)[^\n\r]{0,35}/i);
        if (authLine) {
            const normalized = authLine[0]
                .replace(/[OoD]/g, '0')
                .replace(/[Il|!\]\[]/g, '1')
                .replace(/[Ss]/g, '5')
                .replace(/[Bb]/g, '8')
                .replace(/[Gg]/g, '9');
            const num = normalized.match(/(\d{4,8})/);
            if (num) {
                data.approvalNumber = num[1];
            }
        }

        // 4. CARD PAN
        const panMatch = digitFocusText.match(/\b([459]\d{5})[^\d\n\r]{2,14}(\d{4})\b/);
        if (panMatch) {
            data.cardBin = panMatch[1];
            data.last4Digits = panMatch[2];
        } else {
            const binMatch = digitFocusText.match(/\b([459]\d{5})\b/);
            if (binMatch) data.cardBin = binMatch[1];

            const last4Match = digitFocusText.match(/[\*xX\.]{2,}[^\d\n\r]{0,5}(\d{4})\b/);
            if (last4Match) data.last4Digits = last4Match[1];
        }

        // 5. DATE
        const dateLine = cleanText.match(/DATE[^\n\r]{0,35}/i);
        if (dateLine) {
            const normalized = dateLine[0]
                .replace(/[OoD]/g, '0')
                .replace(/[Il|!\\]/g, '/');
            const match = normalized.match(/([0-3]?\d)[\/\-\.]([0-1]?\d)[\/\-\.]((?:20)?\d{2,4})/);
            if (match) {
                const day = match[1].padStart(2, '0');
                const month = match[2].padStart(2, '0');
                let year = match[3].length === 2 ? `20${match[3]}` : match[3];
                if (year === '2076') year = '2026';
                data.date = `${year}-${month}-${day}`;
            }
        }

        if (!data.date) {
            const dateMatch = cleanText.match(/\b([0-3]?[0-9Oo][/\-\.][0-1]?[0-9Oo][/\-\.](?:20)?[0-9Oo]{2,4})\b/);
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
        }

        // 6. TIME
        const timeLine = cleanText.match(/TIME[^\n\r]{0,35}/i);
        if (timeLine) {
            const normalized = timeLine[0]
                .replace(/[OoD]/g, '0')
                .replace(/[Ss]/g, '5')
                .replace(/[Bb]/g, '8');
            const match = normalized.match(/([0-2]?\d):([0-5]\d)(?::([0-5]\d))?/);
            if (match) {
                const hh = match[1].padStart(2, '0');
                const mm = match[2].padStart(2, '0');
                const ss = (match[3] || '00').padStart(2, '0');
                data.time = `${hh}:${mm}:${ss}`;
            }
        }

        if (!data.time) {
            const timeMatch = cleanText.match(/\b([0-2]?[0-9Oo]:[0-5][0-9Oo](?::[0-5][0-9Oo])?)\b/);
            if (timeMatch) {
                const cleanedTimeStr = timeMatch[1].replace(/[Oo]/g, '0').replace(/[Il]/g, '1');
                data.time = cleanedTimeStr.length === 5 ? `${cleanedTimeStr}:00` : cleanedTimeStr;
            }
        }

        return data;
    }
}

export default new OCRService();