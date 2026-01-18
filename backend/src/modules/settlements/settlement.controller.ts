import { Request, Response, NextFunction } from 'express';
import settlementService from './settlement.service';
import { CreateSettlementSchema, UpdateSettlementSchema, SettlementStatusSchema } from './settlement.dto';
import prisma from '../../config/database';
import { createBackup } from '../../utils/backup';

export class SettlementController {
    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = CreateSettlementSchema.parse(req.body);

            // Duplicate Check
            const isDuplicate = await settlementService.checkDuplicate(
                validatedData.approvalNumber || '',
                validatedData.last4Digits || '',
                validatedData.batchNumber || ''
            );

            if (isDuplicate) {
                return res.status(400).json({
                    error: 'Duplicate Transaction',
                    message: `تم رفض المعاملة لأنها مسجلة مسبقاً (رقم الموافقة: ${validatedData.approvalNumber}، آخر 4 أرقام: ${validatedData.last4Digits}، رقم الباتش: ${validatedData.batchNumber})`
                });
            }

            const settlement = await settlementService.createSettlement(validatedData);
            res.status(201).json(settlement);
        } catch (error: any) {
            console.error('Create Settlement Error:', error.message || error);
            next(error);
        }
    }

    async getAll(req: Request, res: Response, next: NextFunction) {
        let filters: any = {};
        try {
            const { status, bankName, serviceCategory, page, limit } = req.query;
            if (status) filters.status = status;
            if (serviceCategory) filters.serviceCategory = serviceCategory;
            if (bankName) filters.bankName = { contains: String(bankName), mode: 'insensitive' };

            const adminPass = req.headers['x-admin-password'];
            const isAdmin = adminPass && adminPass === process.env.ADMIN_PASSWORD;

            if (req.query.branchId && req.query.branchId !== 'undefined' && req.query.branchId !== 'null' && req.query.branchId !== 'all') {
                const branchIdStr = String(req.query.branchId);
                const branch = await prisma.branch.findUnique({
                    where: { id: branchIdStr },
                    select: { name: true }
                });

                filters.OR = [
                    { branchId: branchIdStr },
                    { branchId: branch?.name || 'NOT_FOUND_LEGACY' },
                    { branchId: null },
                    { branchId: '' }
                ];
            } else if (!isAdmin) {
                filters.id = 'force-empty-if-no-branch';
            }

            const result = await settlementService.listSettlements(
                filters,
                Number(page) || 1,
                Number(limit) || 10
            );
            res.json(result);
        } catch (error: any) {
            console.error('List Settlements Error DETAILS:', {
                error: error.message,
                stack: error.stack,
                filters,
                query: req.query
            });
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
            const branchIdStr = req.query.branchId ? String(req.query.branchId) : undefined;
            let finalBranchId: any = branchIdStr;

            if (branchIdStr && branchIdStr !== 'undefined' && branchIdStr !== 'null' && branchIdStr !== 'all') {
                const branch = await prisma.branch.findUnique({
                    where: { id: branchIdStr },
                    select: { name: true }
                });

                finalBranchId = {
                    OR: [
                        { branchId: branchIdStr },
                        { branchId: branch?.name },
                        { branchId: null },
                        { branchId: '' }
                    ].filter(cond => cond.branchId !== undefined)
                };
            }

            const batches = await settlementService.getSettlementsByBatch(finalBranchId);
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

    async syncFees(req: Request, res: Response, next: NextFunction) {
        try {
            console.log('[SettlementController] Starting syncFees process...');

            // 1. Create Backup First
            const backupPath = await createBackup();

            // 2. Run Sync
            const updatedCount = await settlementService.syncHistoricalFees();

            res.json({
                success: true,
                message: `تم تحديث ${updatedCount} معاملة بنجاح بعد عمل نسخة احتياطية.`,
                backupPath,
                updatedCount
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new SettlementController();
