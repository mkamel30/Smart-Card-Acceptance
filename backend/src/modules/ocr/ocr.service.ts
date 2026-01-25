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

    async extractAndParse(file: Express.Multer.File): Promise<{ data: ExtractedReceiptData; rawText: string; engine: string }> {

        let ocrBuffer = file.buffer;
        let storageBuffer = file.buffer;

        try {
            console.log('OCR Step 1: Starting image processing with Sharp...');
            const image = sharp(file.buffer);
            const metadata = await image.metadata();
            console.log(`OCR Metadata: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

            // 1. Prepare Buffer for OCR (Grayscale, Normalized)
            console.log('OCR Step 2: Preparing OCR buffer...');
            ocrBuffer = await image
                .rotate()
                .resize({ width: 1200, withoutEnlargement: true })
                .grayscale()
                .normalize()
                .toFormat('png')
                .toBuffer();
            console.log('OCR Step 2: OCR buffer ready.');

            // 2. Prepare Buffer for Storage (WebP)
            console.log('OCR Step 3: Preparing storage buffer...');
            storageBuffer = await sharp(file.buffer)
                .rotate()
                .resize({ width: 800, withoutEnlargement: true })
                .webp({ quality: 70 })
                .toBuffer();
            console.log('OCR Step 3: Storage buffer ready.');
        } catch (e: any) {
            console.warn('OCR Warning: Image optimization failed, using original:', e.message);
        }

        // 1. Upload to Supabase Storage
        let publicUrl = '';
        try {
            console.log('OCR Step 4: Uploading to Supabase...');
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
                console.log('OCR Step 4 Success:', publicUrl);
            } else {
                console.error('OCR Step 4 Error (Supabase):', error);
            }
        } catch (err: any) {
            console.error('OCR Step 4 FATAL:', err.message);
        }

        // 2. Perform OCR
        let text = '';
        let usedEngine = 'unknown';

        // --- Step A: Try OCR.space ---
        const OCR_SPACE_KEY = process.env.OCR_SPACE_API_KEY || "K82676068988957";

        if (OCR_SPACE_KEY && publicUrl) {
            try {
                console.log('OCR Step 5: Calling OCR.space...');
                const osFormData = new FormData();
                osFormData.append('url', publicUrl);
                osFormData.append('language', 'eng+ara');
                osFormData.append('OCREngine', '2');
                osFormData.append('scale', 'true');

                const osResponse = await axios.post('https://api.ocr.space/parse/image', osFormData, {
                    headers: { ...osFormData.getHeaders(), 'apikey': OCR_SPACE_KEY },
                    timeout: 20000
                });

                if (osResponse.data?.ParsedResults?.[0]?.ParsedText) {
                    text = osResponse.data.ParsedResults[0].ParsedText;
                    usedEngine = 'OCR.space';
                    console.log('OCR Step 5: OCR.space Success. Text length:', text.length);
                } else if (osResponse.data?.ErrorMessage) {
                    console.warn('OCR Step 5: OCR.space returned error:', osResponse.data.ErrorMessage);
                }
            } catch (err: any) {
                console.warn('OCR Step 5: OCR.space request failed:', err.message);
            }
        }

        // --- Step B: Fallback to Tesseract.js ---
        if (!text || text.length < 10) {
            try {
                console.log('OCR Step 6: Falling back to Tesseract.js...');
                // Note: v5+ syntax for better multi-lang support
                const worker = await Tesseract.createWorker(['ara', 'eng']);

                await worker.setParameters({
                    tessedit_char_whitelist: '0123456789.:-/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzابتثجحخدذرزسشصضطظعغفقكلمنهويي',
                    tessedit_pagesegmode: '6' as any
                });

                const { data: { text: tText } } = await worker.recognize(ocrBuffer);
                text = tText;
                usedEngine = 'Tesseract.js';
                console.log('OCR Step 6: Tesseract Success. Text length:', text?.length || 0);
                await worker.terminate();
            } catch (err: any) {
                console.error('OCR Step 6: Tesseract FATAL:', err.message);
            }
        }

        // 3. Final Parse
        console.log('OCR Step 7: Parsing final text results...');
        const parsedData = this.parseReceiptText(text);
        if (publicUrl) parsedData.imageUrl = publicUrl;

        return {
            data: parsedData,
            rawText: text,
            engine: usedEngine
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

        // 3. AMOUNT with Enhanced Egyptian Currency Recognition
        const amountPatterns = [
            // English patterns
            /(?:Total|Amount|Sale|Net)\s*[:\.]?\s*(\d+[.,]\d{2})/i,
            /(\d+[.,]\d{2})\s*(?:EGP|LE|L\.E|ج\.م|ج\.m)/i,
            /(?:EGP|LE|L\.E|ج\.م|ج\.m)\s*(\d+[.,]\d{2})/i,
            // Arabic patterns with enhanced recognition
            /(?:المبلغ|الإجمالي|الصافي|السعر)\s*[:\.]?\s*(\d+[.,]\d{2})/i,
            /(\d+[.,]\d{2})\s*(?:جنيه|مصري|مصر)/i,
            /(?:جنيه|مصري|مصر)\s*(\d+[.,]\d{2})/i
        ];

        for (const pat of amountPatterns) {
            const m = digitFocusText.match(pat);
            if (m) {
                data.totalAmount = parseFloat(m[1].replace(/,/g, ''));
                break;
            }
        }

        // 4. MERCHANT ID (MID) - Enhanced for Egyptian Banking (8-20 digits)
        const midPatterns = [
            // English patterns
            /(?:MID|Merchant|Merch|ID)\s*[:\.]?\s*(\d{8,20})/i,
            /Merchant\s*ID\s*[:\.]?\s*(\d{8,20})/i,
            /MID\s*[:\.]?\s*(\d{8,20})/i,
            // Arabic patterns
            /(?:التاجر|كود التاجر|المerchant)\s*[:\.]?\s*(\d{8,20})/i,
            /(?:كود|ID)\s*[:\.]?\s*(\d{8,20})\s*(?:التاجر|Merchant)/i
        ];

        let midFound = false;
        for (const pat of midPatterns) {
            const m = digitFocusText.match(pat);
            if (m) {
                data.merchantCode = m[1];
                midFound = true;
                break;
            }
        }

        if (!midFound) {
            // Standalone fallback: look for long numbers (8-20 digits)
            const standaloneMID = digitFocusText.match(/\b(\d{8,20})\b/);
            if (standaloneMID) {
                // Filter out obvious dates, phone numbers, etc.
                const candidate = standaloneMID[1];
                if (!this.looksLikeDateOrPhone(candidate)) {
                    data.merchantCode = candidate;
                }
            }
        }

        // 5. TERMINAL ID (TID) - Enhanced Egyptian patterns
        const tidPatterns = [
            /(?:TID|Terminal|Term|طرفية)\s*[:\.]?\s*(\d{6,10})/i,
            /Terminal\s*ID\s*[:\.]?\s*(\d{6,10})/i,
            /(?:طرفية|Terminal)\s*(?:ID)?\s*[:\.]?\s*(\d{6,10})/i
        ];

        for (const pat of tidPatterns) {
            const m = digitFocusText.match(pat);
            if (m) {
                data.terminalId = m[1];
                break;
            }
        }

        // 6. APPROVAL / AUTH CODE - Enhanced to support 4-8 digits (realistic range)
        const authPatterns = [
            /(?:Approval|Appr|Auth|Code|الموافقة|تأكيد)\s*(?:CODE|NO|رقم)?\s*[:\.]?\s*(\d{4,8})/i,
            /\b(\d{4,8})\s*(?:AUTH|APPR|CODE|الموافقة)/i,
            /(?:AUTH|APPR|CODE)\s*[:\.]?\s*(\d{4,8})/i,
            /(?:تأكيد|الموافقة)\s*[:\.]?\s*(\d{4,8})/i
        ];

        for (const pat of authPatterns) {
            const m = digitFocusText.match(pat);
            if (m) {
                data.approvalNumber = m[1];
                break;
            }
        }

        if (!data.approvalNumber) {
            // Fallback: find standalone 4-8 digit numbers
            const standaloneAuth = digitFocusText.match(/\b(\d{4,8})\b/g);
            if (standaloneAuth) {
                // Prefer 6-digit codes, then 4-8 digit codes
                const sixDigitCodes = standaloneAuth.filter(code => code.length === 6);
                if (sixDigitCodes.length > 0) {
                    data.approvalNumber = sixDigitCodes[0];
                } else {
                    data.approvalNumber = standaloneAuth[0];
                }
            }
        }

        // 7. BATCH - Enhanced for flexible numbering
        const batchPatterns = [
            /(?:Batch|الباتش|رقم الباتش|الدفعة)\s*(?:NO|#)?\s*[:\.]?\s*(\d{1,10})/i,
            /(?:BATCH|BAT)\s*[:\.]?\s*(\d{1,10})/i
        ];

        for (const pat of batchPatterns) {
            const m = digitFocusText.match(pat);
            if (m) {
                data.batchNumber = m[1];
                break;
            }
        }

        // 8. CARD NUMBERS (BIN & LAST 4) - Enhanced for Egyptian cards
        const cardPatterns = [
            /(?:Card|Card No|PAN|المسلسل|البطاقة)\s*[:\.]?\s*(\d{4})[\*xX\.\-\s]{1,12}(\d{4})\b/i,
            /(?:[\*xX\.\-\s]{4,}|Card|Card No|PAN|البطاقة)\s*[:\.]?\s*\d*(\d{4})\b/i
        ];

        for (const pat of cardPatterns) {
            const m = digitFocusText.match(pat);
            if (m) {
                if (m[2]) data.last4Digits = m[2];
                break;
            }
        }

        // BIN (First 6 digits) - Enhanced for Egyptian banks
        const binPatterns = [
            /\b(4\d{5}|5\d{5})\b/, // Starts with 4 or 5
            /\b(4897\d{2})\b/, // Common Egyptian bank prefix
            /\b(\d{6})[\*xX\s]{6,10}(\d{4})\b/ // Full masked card
        ];

        for (const pat of binPatterns) {
            const m = digitFocusText.match(pat);
            if (m) {
                data.cardBin = m[1];
                if (m[2]) data.last4Digits = m[2];
                break;
            }
        }

        if (!data.last4Digits) {
            // Fallback for last 4 digits
            const last4Patterns = [
                /\b(\d{4})\s*$/, // End of line
                /\b(\d{4})\s*(?:END|FINISH|نهاية)/i
            ];
            for (const pat of last4Patterns) {
                const m = digitFocusText.match(pat);
                if (m) {
                    data.last4Digits = m[1];
                    break;
                }
            }
        }

        // 9. RRN (Retrieval Reference Number) - Enhanced
        const rrnPatterns = [
            /(?:RRN|Ref|Reference|رقم المرجع)\s*[:\.]?\s*(\d{12})/i,
            /\b(\d{12})\s*(?:RRN|REF|REFERENCE)/i,
            /(?:المرجع|Reference)\s*[:\.]?\s*(\d{12})/i
        ];

        for (const pat of rrnPatterns) {
            const m = digitFocusText.match(pat);
            if (m) {
                data.rrn = m[1];
                break;
            }
        }

        return data;
    }

    // Helper function to filter out obvious dates and phone numbers
    private looksLikeDateOrPhone(number: string): boolean {
        // Check if it looks like a date (DDMMYYYY, MMDDYYYY, etc.)
        if (/^(0[1-9]|[12][0-9]|3[01])(0[1-9]|[12][0-9])\d{4}$/.test(number)) return true;
        if (/^(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])\d{4}$/.test(number)) return true;

        // Check if it looks like an Egyptian phone number
        if (/^01[0125]\d{8}$/.test(number)) return true; // Mobile
        if (/^0[2-9]\d{8,9}$/.test(number)) return true; // Landline

        return false;
    }
}

export default new OCRService();