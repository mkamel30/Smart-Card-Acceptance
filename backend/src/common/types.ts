import { Settlement as PrismaSettlement, Receipt as PrismaReceipt } from '@prisma/client';

/**
 * Explicitly define the Settlement structure to match our schema.
 * This helps the IDE when the generated Prisma client is stale.
 */
export interface Settlement extends PrismaSettlement {
    serviceCategory: string;
    subService: string | null;
    merchantCode: string;
    batchNumber: string | null;
    approvalNumber: string | null;
    last4Digits: string | null;
    customerName: string | null;
    customerPhone: string | null;
}

export interface Receipt extends PrismaReceipt {
    merchantName: string | null;
    merchantId: string | null;
    transactionId: string | null;
    transactionDate: Date | null;
}

export type SettlementWithReceipt = Settlement & {
    receipt: Receipt | null;
};
