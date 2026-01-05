import { Request, Response, NextFunction } from 'express';
import settlementService from './settlement.service';
import { CreateSettlementSchema, UpdateSettlementSchema, SettlementStatusSchema } from './settlement.dto';

export class SettlementController {
    async create(req: Request, res: Response, next: NextFunction) {
        try {

            const validatedData = CreateSettlementSchema.parse(req.body);
            const settlement = await settlementService.createSettlement(validatedData);
            res.status(201).json(settlement);
        } catch (error: any) {
            console.error('Create Settlement Error:', error.message || error);
            next(error);
        }
    }

    async getAll(req: Request, res: Response, next: NextFunction) {
        try {
            const { status, bankName, page, limit } = req.query;
            const filters: any = {};
            if (status) filters.status = status;
            if (bankName) filters.bankName = { contains: String(bankName), mode: 'insensitive' };
            if (req.query.branchId && req.query.branchId !== 'undefined' && req.query.branchId !== 'null') filters.branchId = String(req.query.branchId);

            const result = await settlementService.listSettlements(
                filters,
                Number(page) || 1,
                Number(limit) || 10
            );
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    async getOne(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const settlement = await settlementService.getSettlement(id);
            res.json(settlement);
        } catch (error) {
            next(error);
        }
    }

    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const validatedData = UpdateSettlementSchema.parse(req.body);
            const settlement = await settlementService.updateSettlement(id, validatedData);
            res.json(settlement);
        } catch (error) {
            next(error);
        }
    }

    async updateStatus(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const validatedStatus = SettlementStatusSchema.parse(status);
            const settlement = await settlementService.updateStatus(id, validatedStatus);
            res.json(settlement);
        } catch (error) {
            next(error);
        }
    }

    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            await settlementService.deleteSettlement(id);
            res.status(204).send();
        } catch (error) {
            next(error);
        }
    }

    async getBatches(req: Request, res: Response, next: NextFunction) {
        try {
            const branchId = req.query.branchId ? String(req.query.branchId) : undefined;
            const batches = await settlementService.getSettlementsByBatch(branchId);
            res.json(batches);
        } catch (error) {
            next(error);
        }
    }

    async settleBatch(req: Request, res: Response, next: NextFunction) {
        try {
            const { batchNumber } = req.params;
            const result = await settlementService.settleBatch(batchNumber);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }
}

export default new SettlementController();
