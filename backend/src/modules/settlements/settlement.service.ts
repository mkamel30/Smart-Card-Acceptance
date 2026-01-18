import prisma from '../../config/database';
import { CreateSettlementInput, UpdateSettlementInput } from './settlement.dto';
import { Settlement, SettlementWithReceipt } from '../../common/types';

const FEE_RATE = 0.0115; // 1.15%

// Service to handle settlement business logic
export class SettlementService {
    async checkDuplicate(approvalNumber: string, last4Digits: string, batchNumber: string) {
        if (!approvalNumber || !last4Digits || !batchNumber) return false;

        const existing = await prisma.settlement.findFirst({
            where: {
                approvalNumber,
                last4Digits,
                batchNumber,
                status: { not: 'REJECTED' } // Allow retry if previous attempt was rejected
            }
        });

        return !!existing;
    }

    async createSettlement(data: CreateSettlementInput, userId: string = 'system') {
        // Validation: Prevent duplicate transactions in the same batch
        const isDuplicate = await this.checkDuplicate(
            data.approvalNumber || '',
            data.last4Digits || '',
            data.batchNumber || ''
        );

        if (isDuplicate) {
            throw new Error(`Duplicate transaction: Transaction with Approval Number ${data.approvalNumber} already exists in Batch ${data.batchNumber}`);
        }

        // Auto-calculate fees and net amount if not provided or to ensure accuracy
        const settledAmount = Number(data.settledAmount);
        const fees = data.fees !== undefined && data.fees > 0 ? Number(data.fees) : Math.round(settledAmount * FEE_RATE * 100) / 100;
        const netAmount = settledAmount + fees;

        return (await prisma.settlement.create({
            data: {
                settlementDate: new Date(data.settlementDate),
                bankName: data.bankName || 'BANQUE MISR',
                cardType: data.cardType || 'Visa',

                // New Business Fields
                subService: data.subService, // Now a string for SQLite
                serviceCategory: data.serviceCategory, // Now a string for SQLite
                merchantCode: data.merchantCode,
                merchantName: data.merchantName,
                batchNumber: data.batchNumber,
                approvalNumber: data.approvalNumber,
                cardBin: data.cardBin,
                last4Digits: data.last4Digits,
                customerName: data.customerName,
                customerPhone: data.customerPhone,

                totalAmount: data.totalAmount,
                settledAmount: data.settledAmount,
                fees: data.fees || 0,
                netAmount: netAmount,
                referenceNumber: data.referenceNumber,
                invoiceNumber: data.invoiceNumber,
                notes: data.notes,
                createdBy: userId,
                status: 'PENDING',
                branchId: data.branchId,
                receipt: data.receiptImageUrl ? {
                    create: {
                        imageUrl: data.receiptImageUrl,
                        processingStatus: 'COMPLETED',
                        processedAt: new Date(),
                    }
                } : undefined,
            } as any, // Cast to any to bypass Prisma client validation in IDE
            include: {
                receipt: true,
            },
        })) as unknown as SettlementWithReceipt;
    }

    async getSettlement(id: string) {
        const settlement = (await prisma.settlement.findUnique({
            where: { id },
            include: { receipt: true },
        })) as SettlementWithReceipt;

        if (!settlement) throw new Error('Settlement not found');
        return settlement;
    }

    async listSettlements(filters: any = {}, page: number = 1, limit: number = 10) {
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            prisma.settlement.findMany({
                where: filters,
                include: { receipt: true },
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            }),
            prisma.settlement.count({ where: filters }),
        ]);

        return {
            data: data as SettlementWithReceipt[],
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async updateSettlement(id: string, data: UpdateSettlementInput) {
        const existing = await this.getSettlement(id);

        let settledAmount = data.settledAmount ?? Number(existing.settledAmount);
        let fees = data.fees ?? Number(existing.fees);

        // If settledAmount changed but fees didn't, re-calculate fees
        if (data.settledAmount !== undefined && data.fees === undefined) {
            fees = Math.round(settledAmount * FEE_RATE * 100) / 100;
        }

        const netAmount = settledAmount + fees;

        return (await prisma.settlement.update({
            where: { id },
            data: {
                ...data,
                settlementDate: data.settlementDate ? new Date(data.settlementDate) : undefined,
                fees,
                netAmount,
                branchId: data.branchId,
            },
        })) as Settlement;
    }

    async updateStatus(id: string, status: string) {
        return await prisma.settlement.update({
            where: { id },
            data: { status } as any,
        });
    }

    async deleteSettlement(id: string) {
        return await prisma.settlement.delete({
            where: { id },
        });
    }

    // Get settlements grouped by batch number
    async getSettlementsByBatch(branchFilter?: any) {
        const where: any = {};
        if (branchFilter && branchFilter !== 'undefined' && branchFilter !== 'null') {
            if (typeof branchFilter === 'object' && branchFilter.OR) {
                where.OR = branchFilter.OR;
            } else {
                where.branchId = branchFilter;
            }
        }

        const settlements = await prisma.settlement.findMany({
            where,
            include: { receipt: true },
            orderBy: [{ batchNumber: 'desc' }, { createdAt: 'desc' }],
        });

        // Group by batch number
        const batches: { [key: string]: any } = {};
        for (const s of settlements) {
            const batchKey = s.batchNumber || 'NO_BATCH';
            if (!batches[batchKey]) {
                batches[batchKey] = {
                    batchNumber: batchKey,
                    settlementDate: s.settlementDate,
                    transactions: [],
                    totalAmount: 0,
                    totalFees: 0,
                    totalNet: 0,
                    status: 'PENDING',
                    isSettled: false,
                };
            }
            batches[batchKey].transactions.push(s);
            batches[batchKey].totalAmount += Number(s.settledAmount) || 0;
            batches[batchKey].totalFees += Number(s.fees) || 0;
            batches[batchKey].totalNet += Number(s.netAmount) || 0;
            // If any transaction is settled, mark batch as settled
            if (s.status === 'SETTLED') {
                batches[batchKey].isSettled = true;
                batches[batchKey].status = 'SETTLED';
            }
        }

        return Object.values(batches);
    }

    // Settle all transactions in a batch
    async settleBatch(batchNumber: string) {
        const result = await prisma.settlement.updateMany({
            where: { batchNumber },
            data: { status: 'SETTLED' } as any,
        });

        // Get updated settlements for the batch
        const settlements = await prisma.settlement.findMany({
            where: { batchNumber },
        });

        return {
            batchNumber,
            settledCount: result.count,
            settlements,
            totalAmount: settlements.reduce((sum, s) => sum + (Number(s.settledAmount) || 0), 0),
        };
    }

    // Sync historical data: recalculate fees for entries where fees are 0
    async syncHistoricalFees() {
        console.log('[SettlementService] Syncing and correcting all fees...');
        const settlements = await prisma.settlement.findMany();

        console.log(`[SettlementService] Found ${settlements.length} settlements to update.`);

        let updatedCount = 0;
        for (const s of settlements) {
            const settledAmt = Number(s.settledAmount);
            if (settledAmt === 0) continue;

            const fees = Math.round(settledAmt * FEE_RATE * 100) / 100;
            const netAmount = settledAmt + fees;

            await prisma.settlement.update({
                where: { id: s.id },
                data: { fees, netAmount }
            });
            updatedCount++;
        }

        console.log(`[SettlementService] Successfully updated ${updatedCount} settlements.`);
        return updatedCount;
    }
}

export default new SettlementService();
