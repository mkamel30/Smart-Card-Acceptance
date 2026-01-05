import { Request, Response, NextFunction } from 'express';
import receiptService from './receipt.service';

export class ReceiptController {
    async upload(req: Request, res: Response, next: NextFunction) {
        try {
            const { settlementId } = req.params;
            const file = req.file;

            if (!file) {
                return res.status(400).json({ message: 'No file uploaded' });
            }

            let manualData = null;
            if (req.body.ocrData) {
                try {
                    manualData = typeof req.body.ocrData === 'string'
                        ? JSON.parse(req.body.ocrData)
                        : req.body.ocrData;
                } catch (e) {
                    console.warn('Failed to parse manual OCR data', e);
                }
            }

            const receipt = await receiptService.processOCR(file, settlementId, manualData);
            res.status(200).json(receipt);
        } catch (error) {
            next(error);
        }
    }
}

export default new ReceiptController();
