import { Request, Response, NextFunction } from 'express';
import settlementService from '../settlements/settlement.service';
import pdfService from './pdf.service';

export class PDFController {
    async downloadBatchReport(req: Request, res: Response, next: NextFunction) {
        try {
            const { batchNumber } = req.params;

            // Get batch data
            const batches = await settlementService.getSettlementsByBatch();
            const batch = batches.find((b: any) => b.batchNumber === batchNumber);

            if (!batch) {
                return res.status(404).json({ error: 'Batch not found' });
            }

            await pdfService.generateBatchReport(batch, res);
        } catch (error) {
            next(error);
        }
    }
}

export default new PDFController();
