import fs from 'fs';
import path from 'path';
import prisma from '../../config/database';
import ocrService from '../ocr/ocr.service';

export class ReceiptService {
    async processOCR(imagePath: string, settlementId: string) {
        try {
            // Check for existing receipt to clean up old image
            const existingReceipt = await prisma.receipt.findUnique({
                where: { settlementId },
                select: { imageUrl: true }
            });

            // Use our new robust OCR service
            const ocrResult = await ocrService.extractAndParse(imagePath);
            const text = ocrResult.rawText;
            const extractedData = ocrResult.data;

            const receipt = await prisma.receipt.upsert({
                where: { settlementId },
                update: {
                    imageUrl: imagePath,
                    extractedText: text,
                    merchantId: extractedData.merchantCode,
                    merchantName: extractedData.merchantCode, // Fallback or logic if needed
                    transactionId: extractedData.approvalNumber || extractedData.rrn,
                    transactionDate: extractedData.date ? new Date(extractedData.date) : null,
                    processingStatus: 'COMPLETED',
                    processedAt: new Date(),
                },
                create: {
                    settlementId,
                    imageUrl: imagePath,
                    extractedText: text,
                    merchantId: extractedData.merchantCode,
                    merchantName: extractedData.merchantCode,
                    transactionId: extractedData.approvalNumber || extractedData.rrn,
                    transactionDate: extractedData.date ? new Date(extractedData.date) : null,
                    processingStatus: 'COMPLETED',
                    processedAt: new Date(),
                },
            });

            // Clean up old image if it exists and is different
            if (existingReceipt?.imageUrl && existingReceipt.imageUrl !== imagePath) {
                const oldPath = path.resolve(existingReceipt.imageUrl);
                if (fs.existsSync(oldPath)) {
                    fs.unlink(oldPath, (err) => {
                        if (err) console.error('Failed to delete old receipt image:', err);
                    });
                }
            }

            // Return both the receipt and the parsed data for the frontend to use in auto-fill
            return {
                ...receipt,
                extractedFields: extractedData
            };
        } catch (error) {
            console.error('OCR Processing Error:', error);
            await prisma.receipt.upsert({
                where: { settlementId },
                update: { imageUrl: imagePath, processingStatus: 'FAILED' },
                create: { settlementId, imageUrl: imagePath, processingStatus: 'FAILED' },
            });
            throw error;
        }
    }
}

export default new ReceiptService();
