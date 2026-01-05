import { Request, Response, NextFunction } from 'express';
import exportService from './export.service';

export class ExportController {
    async downloadExcel(req: Request, res: Response, next: NextFunction) {
        try {
            const { status, bankName } = req.query;
            const filters: any = {};
            if (status) filters.status = status;
            if (bankName) filters.bankName = { contains: String(bankName), mode: 'insensitive' };
            if (req.query.branchId && req.query.branchId !== 'undefined' && req.query.branchId !== 'null') filters.branchId = String(req.query.branchId);

            const buffer = await exportService.exportToExcel(filters);

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=settlements.xlsx');
            res.send(buffer);
        } catch (error) {
            next(error);
        }
    }

    async downloadPDF(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const buffer = await exportService.generateSettlementPDF(id);

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=settlement-${id}.pdf`);
            res.send(buffer);
        } catch (error) {
            next(error);
        }
    }

    async downloadBatchExcel(req: Request, res: Response, next: NextFunction) {
        try {
            const { batchNumber } = req.params;
            // Lazy import to avoid circular dependencies if any, though likely not needed here but safe
            const { default: settlementService } = await import('../settlements/settlement.service');
            const branchId = req.query.branchId ? String(req.query.branchId) : undefined;
            const batches = await settlementService.getSettlementsByBatch(branchId);
            const batch = batches.find((b: any) => b.batchNumber === batchNumber);

            if (!batch) {
                return res.status(404).json({ error: 'Batch not found' });
            }

            const buffer = await exportService.generateBatchExcel(batch);

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=batch_${batch.batchNumber}.xlsx`);
            res.send(buffer);
        } catch (error) {
            next(error);
        }
    }
}

export default new ExportController();
