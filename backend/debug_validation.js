const { z } = require('zod');

const ServiceCategorySchema = z.enum(['SMART', 'TAMWEEN', 'TAM']);

const CreateSettlementSchema = z.object({
    branchId: z.string().optional(),
    settlementDate: z.string().or(z.date()).refine((val) => {
        const date = typeof val === 'string' ? new Date(val) : val;
        return !isNaN(date.getTime());
    }, {
        message: 'Invalid settlement date'
    }),
    bankName: z.string().max(100).optional(),
    cardType: z.string().max(50).optional(),

    serviceCategory: ServiceCategorySchema.default('SMART'),
    subService: z.string().max(100).optional(),
    merchantCode: z.string()
        .min(1, 'Merchant code is required')
        .max(20, 'Merchant code cannot exceed 20 digits'),
    merchantName: z.string().max(200).optional(),
    batchNumber: z.string()
        .min(1, 'Batch number is required')
        .max(20, 'Batch number cannot exceed 20 characters')
        .regex(/^[#a-zA-Z0-9/-]+$/, 'Batch number can only contain letters, numbers, hyphens, slashes, and #'),
    approvalNumber: z.string()
        .min(1, 'Approval number must be at least 1 digit')
        .max(8, 'Approval number cannot exceed 8 digits')
        .regex(/^\d+$/, 'Approval number must contain only digits')
        .optional(),
    cardBin: z.string()
        .min(6, 'Card BIN must be at least 6 characters')
        .max(6, 'Card BIN cannot exceed 6 characters')
        .optional(),
    last4Digits: z.string()
        .length(4, 'Last 4 digits must be exactly 4 digits')
        .regex(/^\d+$/, 'Last 4 digits must contain only digits')
        .optional(),
    customerName: z.string().max(100).optional(),
    customerPhone: z.string()
        .regex(/^01[0125]\d{8}$/, 'Invalid Egyptian phone number format')
        .optional(),

    totalAmount: z.number()
        .positive('Total amount must be positive')
        .min(0.01, 'Total amount must be at least 0.01')
        .max(999999.99, 'Total amount cannot exceed 999,999.99'),
    settledAmount: z.number()
        .positive('Settled amount must be positive')
        .min(0.01, 'Settled amount must be at least 0.01')
        .max(999999.99, 'Settled amount cannot exceed 999,999.99'),
    fees: z.number()
        .nonnegative('Fees cannot be negative')
        .max(99999.99, 'Fees cannot exceed 99,999.99')
        .optional()
        .default(0),

    referenceNumber: z.string()
        .max(50, 'Reference number cannot exceed 50 characters')
        .optional(),
    invoiceNumber: z.string()
        .max(50, 'Invoice number cannot exceed 50 characters')
        .optional(),
    notes: z.string()
        .max(1000, 'Notes cannot exceed 1000 characters')
        .optional(),
    receiptImageUrl: z.string()
        .url('Receipt image URL must be valid')
        .optional(),
});

const UpdateSettlementSchema = CreateSettlementSchema.partial();

const payload = {
  "merchantCode": "011639",
  "merchantName": "011639",
  "batchNumber": "000055",
  "approvalNumber": "469056",
  "settledAmount": 1510,
  "fees": 17.36,
  "settlementDate": "2026-05-10",
  "subService": "سداد اقساط المرابحة"
};

try {
  UpdateSettlementSchema.parse(payload);
  console.log("Validation PASSED");
} catch (e) {
  console.log("Validation FAILED");
  console.log(JSON.stringify(e.errors, null, 2));
}
