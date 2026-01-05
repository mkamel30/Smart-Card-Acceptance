import { useState, useCallback } from 'react';
import Tesseract from 'tesseract.js';

interface ExtractedData {
    merchantName?: string;
    merchantCode?: string;
    batchNumber?: string;
    approvalNumber?: string;
    totalAmount?: number;
    date?: string;
    last4Digits?: string;
    extractedText: string;
    imageUrl?: string;
}

interface OCRResult {
    data: ExtractedData | null;
    loading: boolean;
    error: string | null;
    progress: number;
    processReceipt: (imageFile: File) => Promise<ExtractedData | null>;
}

export const useReceipt = (): OCRResult => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [data, setData] = useState<ExtractedData | null>(null);

    const parseReceiptText = (text: string): ExtractedData => {
        const data: ExtractedData = { extractedText: text };
        const cleanText = text.replace(/[\r\n]+/g, '\n');

        // 1. DATES (DD/MM/YYYY or YYYY-MM-DD)
        const dateMatches = cleanText.match(/\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\b/g);
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

        // 2. AMOUNT
        const amountPatterns = [
            /(?:Total|Amount|Sale|Net|المبلغ|الاجمالي|صافي)\s*[:\.]?\s*(\d+[.,]\d{2})/i,
            /(\d+[.,]\d{2})\s*(?:EGP|LE|L\.E|ج\.م|ج\.m)/i,
            /(?:EGP|LE|L\.E|ج\.م|ج\.m)\s*(\d+[.,]\d{2})/i,
            /\b(\d+[.,]\d{2})\b/
        ];
        for (const pat of amountPatterns) {
            const m = cleanText.match(pat);
            if (m) {
                // Determine if it is likely a total (heuristic: larger numbers in receipt might be total, but for now grab first clear match)
                data.totalAmount = parseFloat(m[1].replace(/,/g, ''));
                break;
            }
        }

        // 3. MERCHANT ID
        const merchantPatterns = [
            /(?:MID|Merchant|Merch|ID|التاجر)[:\.\s]*(\d{8,15})/i,
            /\b(\d{12,15})\b/
        ];
        for (const pat of merchantPatterns) {
            const m = cleanText.match(pat);
            if (m) {
                if (!m[1].startsWith('01')) {
                    data.merchantCode = m[1];
                    break;
                }
            }
        }

        // 4. APPROVAL
        const authPatterns = [
            /(?:Approval|Appr|Auth|Code|الموافقة)[:\.\s]*(\d{6})/i,
            /\b(\d{6})\b/
        ];
        for (const pat of authPatterns) {
            const m = cleanText.match(pat);
            if (m) {
                data.approvalNumber = m[1];
                break;
            }
        }

        // 5. BATCH
        const batchMatch = cleanText.match(/(?:Batch|الباتش|رقم الباتش)[:\.\s]*(\d{1,6})/i);
        if (batchMatch) data.batchNumber = batchMatch[1];

        // 6. LAST 4 DIGITS
        const last4Match = cleanText.match(/(?:[\*xX\.]\s*){4}\s*(\d{4})|(?:\d{4})\s*$/m);
        if (last4Match) data.last4Digits = last4Match[1] || last4Match[0].trim();

        return data;
    };

    const processReceipt = useCallback(async (imageFile: File): Promise<ExtractedData | null> => {
        setLoading(true);
        setError(null);
        setProgress(0);
        setData(null);

        try {
            const { data: { text } } = await Tesseract.recognize(
                imageFile,
                'ara+eng',
                {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            setProgress(Math.round(m.progress * 100));
                        }
                    }
                }
            );

            const parsedData = parseReceiptText(text);

            // Create a preview URL for the form
            parsedData.imageUrl = URL.createObjectURL(imageFile);

            setData(parsedData);
            setLoading(false);
            return parsedData;

        } catch (err: any) {
            setError(err.message || 'Failed to process receipt');
            setLoading(false);
            return null;
        }
    }, []);

    return { data, loading, error, progress, processReceipt };
};
