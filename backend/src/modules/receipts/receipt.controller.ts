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

            const receipt = await receiptService.processOCR(file.path, settlementId);
            res.status(200).json(receipt);
        } catch (error) {
            next(error);
        }
    }
}

export default new ReceiptController();
