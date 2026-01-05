import fs from 'fs';
import path from 'path';
import prisma from '../../config/database';
import ocrService from '../ocr/ocr.service';

export class ReceiptService {
    async processOCR(file: Express.Multer.File, settlementId: string) {
        try {
            // Check for existing receipt
            // const existingReceipt = await prisma.receipt.findUnique({
            //     where: { settlementId },
            //     select: { imageUrl: true }
            // });

            // Use our new robust OCR service
            const ocrResult = await ocrService.extractAndParse(file);
            const text = ocrResult.rawText;
            const extractedData = ocrResult.data;

            // Use the public URL returned by OCR service (from Supabase)
            const imageUrl = extractedData.imageUrl || '';

            const receipt = await prisma.receipt.upsert({
                where: { settlementId },
                update: {
                    imageUrl: imageUrl, // Use cloud URL
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
                    imageUrl: imageUrl, // Use cloud URL
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
            // NOTE: With Cloud/Memory storage, we don't need to delete local files.
            // If we wanted to delete old Supabase files, we'd need logic here using supabase client.
            /*
            if (existingReceipt?.imageUrl && existingReceipt.imageUrl !== imageUrl) {
               // Logic to delete from Supabase would go here
            }
            */

            // Return both the receipt and the parsed data for the frontend to use in auto-fill
            return {
                ...receipt,
                extractedFields: extractedData
            };
        } catch (error) {
            console.error('OCR Processing Error:', error);
            // If upload/OCR fails, we might not have a URL.
            // But if we want to track failure:
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
