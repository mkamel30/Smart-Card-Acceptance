import fs from 'fs';
import path from 'path';
import prisma from '../../config/database';
import ocrService from '../ocr/ocr.service';

export class ReceiptService {
    async processOCR(file: Express.Multer.File, settlementId: string, manualData?: any) {
        try {
            let extractedData: any = {};
            let text = '';
            let imageUrl = '';

            if (manualData) {
                // Client-side OCR case
                console.log('Using Client-side OCR Data');
                imageUrl = await ocrService.uploadImage(file);
                extractedData = manualData;
                text = manualData.extractedText || '';
            } else {
                // Server-side OCR case (Fallback)
                console.log('Using Server-side OCR');
                const ocrResult = await ocrService.extractAndParse(file);
                text = ocrResult.rawText;
                extractedData = ocrResult.data;
                imageUrl = extractedData.imageUrl || '';
            }

            const receipt = await prisma.receipt.upsert({
                where: { settlementId },
                update: {
                    imageUrl: imageUrl,
                    extractedText: text,
                    merchantId: extractedData.merchantCode,
                    merchantName: extractedData.merchantCode,
                    transactionId: extractedData.approvalNumber || extractedData.rrn,
                    transactionDate: extractedData.date ? new Date(extractedData.date) : null,
                    processingStatus: 'COMPLETED',
                    processedAt: new Date(),
                },
                create: {
                    settlementId,
                    imageUrl: imageUrl,
                    extractedText: text,
                    merchantId: extractedData.merchantCode,
                    merchantName: extractedData.merchantCode,
                    transactionId: extractedData.approvalNumber || extractedData.rrn,
                    transactionDate: extractedData.date ? new Date(extractedData.date) : null,
                    processingStatus: 'COMPLETED',
                    processedAt: new Date(),
                },
            });

            return {
                ...receipt,
                extractedFields: extractedData
            };
        } catch (error) {
            console.error('OCR Processing Error:', error);
            await prisma.receipt.upsert({
                where: { settlementId },
                update: { processingStatus: 'FAILED' },
                create: { settlementId, imageUrl: '', processingStatus: 'FAILED' },
            });
            throw error;
        }
    }
}

export default new ReceiptService();
