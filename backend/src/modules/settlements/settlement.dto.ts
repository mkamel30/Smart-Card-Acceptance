import { z } from 'zod';

export const ServiceCategorySchema = z.enum(['SMART', 'TAMWEEN']);

export const CreateSettlementSchema = z.object({
    branchId: z.string().optional(),
    settlementDate: z.string().or(z.date()),
    bankName: z.string().optional(),
    cardType: z.string().optional(),

    // Business Fields
    serviceCategory: ServiceCategorySchema.default('SMART'),
    subService: z.string().optional(),
    merchantCode: z.string().min(1, 'كود المخبز / التاجر مطلوب'),
    merchantName: z.string().optional(),
    batchNumber: z.string().optional(),
    approvalNumber: z.string().optional(),
    cardBin: z.string().optional(),
    last4Digits: z.string().length(4, 'يجب إدخال 4 أرقام').optional(),
    customerName: z.string().optional(),
    customerPhone: z.string().optional(),

    // Amount Info
    totalAmount: z.number().positive(),
    settledAmount: z.number().positive(),
    fees: z.number().nonnegative().optional().default(0),

    // Reference
    referenceNumber: z.string().optional(),
    invoiceNumber: z.string().optional(),
    notes: z.string().optional(),
    receiptImageUrl: z.string().optional(),
});

export const UpdateSettlementSchema = CreateSettlementSchema.partial();
export const SettlementStatusSchema = z.enum(['PENDING', 'APPROVED', 'SETTLED', 'REJECTED', 'CANCELLED']);

export type CreateSettlementInput = z.infer<typeof CreateSettlementSchema>;
export type UpdateSettlementInput = z.infer<typeof UpdateSettlementSchema>;
