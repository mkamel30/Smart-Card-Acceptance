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
            const existing = await settlementService.findExistingDuplicate(
                validatedData.approvalNumber || '',
                validatedData.last4Digits || '',
                validatedData.batchNumber || ''
            );

            if (existing) {
                if (existing.status === 'SETTLED') {
                    return res.status(400).json({
                        error: 'Duplicate Settled Transaction',
                        message: `تمت تسوية هذه المعاملة مسبقاً في الباتش ${validatedData.batchNumber} ولا يمكن تعديلها بعد إغلاق الباتش.`,
                        isSettled: true
                    });
                }

                // If overwrite requested, update the existing settlement
                if (req.body.overwrite || req.body.allowUpdate) {
                    const updated = await settlementService.updateSettlement(existing.id, validatedData);
                    return res.status(200).json({
                        ...updated,
                        isUpdated: true,
                        message: 'تم تحديث بيانات المعاملة السابقة بنجاح'
                    });
                }

                return res.status(409).json({
                    error: 'Duplicate Transaction',
                    canUpdate: true,
                    existingId: existing.id,
                    existingAmount: existing.settledAmount,
                    existingDate: existing.settlementDate,
                    existingMerchantName: existing.merchantName,
                    message: `المعاملة مسجلة مسبقاً في الباتش الحالي (${existing.batchNumber}) بمبلغ (${Number(existing.settledAmount).toLocaleString()} ج.م).`
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
            console.log(`[SettlementController] Updating settlement ${id} with body:`, JSON.stringify(req.body, null, 2));
            
            const validationResult = UpdateSettlementSchema.safeParse(req.body);
            if (!validationResult.success) {
                console.error('[SettlementController] Validation Error:', JSON.stringify(validationResult.error.errors, null, 2));
                return res.status(400).json({
                    message: 'Validation error',
                    errors: validationResult.error.errors
                });
            }

            const settlement = await settlementService.updateSettlement(id, validationResult.data);
            res.json(settlement);
        } catch (error: any) {
            console.error('[SettlementController] Update Error:', error.message || error);
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

    async deleteBatch(req: Request, res: Response, next: NextFunction) {
        try {
            const { batchNumber } = req.params;
            const result = await settlementService.deleteBatch(batchNumber);
            res.json({ message: 'تم حذف الباتش بنجاح', count: result.count });
        } catch (error) {
            next(error);
        }
    }

    async updateBatch(req: Request, res: Response, next: NextFunction) {
        try {
            const { batchNumber } = req.params;
            const { newBatchNumber, newSettlementDate } = req.body;
            
            const updates: any = {};
            if (newBatchNumber) updates.batchNumber = newBatchNumber;
            if (newSettlementDate) updates.settlementDate = new Date(newSettlementDate);

            const result = await settlementService.updateBatch(batchNumber, { newBatchNumber, newSettlementDate });
            res.json({ message: 'تم التحديث بنجاح', count: result.updatedCount });
        } catch (error) {
            next(error);
        }
    }

    async bulkDelete(req: Request, res: Response, next: NextFunction) {
        try {
            const { ids } = req.body;
            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                return res.status(400).json({ error: 'يجب تقديم مصفوفة من المعرفات للحذف' });
            }
            const result = await settlementService.bulkDelete(ids);
            res.json({ message: 'تم الحذف بنجاح', count: result.count });
        } catch (error) {
            next(error);
        }
    }

    async syncFees(_req: Request, res: Response, next: NextFunction) {
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
