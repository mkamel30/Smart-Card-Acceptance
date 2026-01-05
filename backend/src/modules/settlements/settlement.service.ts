import prisma from '../../config/database';
import { CreateSettlementInput, UpdateSettlementInput } from './settlement.dto';
import { Settlement, SettlementWithReceipt } from '../../common/types';

// Service to handle settlement business logic
export class SettlementService {
    async createSettlement(data: CreateSettlementInput, userId: string = 'system') {
        // Validation: Prevent duplicate transactions in the same batch
        if (data.batchNumber && data.approvalNumber && data.merchantCode) {
            const existing = await prisma.settlement.findFirst({
                where: {
                    batchNumber: data.batchNumber,
                    merchantCode: data.merchantCode,
                    approvalNumber: data.approvalNumber
                }
            });

            if (existing) {
                throw new Error(`Duplicate transaction: Transaction with Approval Number ${data.approvalNumber} already exists in Batch ${data.batchNumber} for Merchant ${data.merchantCode}`);
            }
        }

        const netAmount = Number(data.settledAmount) - Number(data.fees || 0);

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

        let netAmount = Number(existing.netAmount);
        if (data.settledAmount !== undefined || data.fees !== undefined) {
            const sAmt = data.settledAmount ?? Number(existing.settledAmount);
            const fees = data.fees ?? Number(existing.fees);
            netAmount = sAmt - fees;
        }

        return (await prisma.settlement.update({
            where: { id },
            data: {
                ...data,
                settlementDate: data.settlementDate ? new Date(data.settlementDate) : undefined,
                netAmount,
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
    async getSettlementsByBatch(branchId?: string) {
        const where: any = {};
        if (branchId && branchId !== 'undefined' && branchId !== 'null') where.branchId = branchId;

        const settlements = await prisma.settlement.findMany({
            where,
            include: { receipt: true },
            orderBy: [{ batchNumber: 'asc' }, { createdAt: 'desc' }],
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
                    status: 'PENDING',
                    isSettled: false,
                };
            }
            batches[batchKey].transactions.push(s);
            batches[batchKey].totalAmount += Number(s.settledAmount) || 0;
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
}

export default new SettlementService();
