import { z } from 'zod';

export const ServiceCategorySchema = z.enum(['SMART', 'TAMWEEN', 'TAM']); // Added TAM for consistency

export const CreateSettlementSchema = z.object({
    branchId: z.string().optional(),
    settlementDate: z.string().or(z.date()).refine((val) => {
        const date = typeof val === 'string' ? new Date(val) : val;
        return !isNaN(date.getTime());
    }, {
        message: 'Invalid settlement date'
    }),
    bankName: z.string().max(100).optional(),
    cardType: z.string().max(50).optional(),

    // Business Fields
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

    // Amount Info with validation
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

    // Reference fields
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

export const UpdateSettlementSchema = CreateSettlementSchema.partial();

export const SettlementStatusSchema = z.enum(['PENDING', 'APPROVED', 'SETTLED', 'REJECTED', 'CANCELLED']);

export const SettlementFilterSchema = z.object({
    branchId: z.string().optional(),
    status: SettlementStatusSchema.optional(),
    serviceCategory: ServiceCategorySchema.optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    bankName: z.string().optional(),
    merchantCode: z.string().optional(),
    page: z.number().int().positive().optional().default(1),
    limit: z.number().int().positive().max(100).optional().default(20),
    sortBy: z.enum(['createdAt', 'settlementDate', 'totalAmount']).optional().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
});

// Branch creation and validation schemas
export const CreateBranchSchema = z.object({
    name: z.string()
        .min(1, 'Branch name is required')
        .max(100, 'Branch name cannot exceed 100 characters')
        .refine(name => name.trim().length > 0, 'Branch name cannot be empty'),
    code: z.string()
        .max(20, 'Branch code cannot exceed 20 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Branch code can only contain letters, numbers, underscores, and hyphens')
        .optional(),
});

export const UpdateBranchSchema = CreateBranchSchema.partial().extend({
    id: z.string().min(1, 'Invalid branch ID')
});

export const BranchFilterSchema = z.object({
    name: z.string().optional(),
    code: z.string().optional(),
    active: z.boolean().optional(),
    page: z.number().int().positive().optional().default(1),
    limit: z.number().int().positive().max(100).optional().default(20)
});

// OCR Request validation
export const OCRRequestSchema = z.object({
    image: z.any().refine((file) => file, 'Image file is required'),
    language: z.enum(['eng', 'ara', 'eng+ara']).optional().default('eng+ara'),
    enhance: z.boolean().optional().default(true)
});

// Authentication schemas
export const LoginSchema = z.object({
    username: z.string()
        .min(1, 'Username is required')
        .max(50, 'Username cannot exceed 50 characters'),
    password: z.string()
        .min(6, 'Password must be at least 6 characters')
        .max(100, 'Password cannot exceed 100 characters')
});

export const CreateUserSchema = z.object({
    username: z.string()
        .min(1, 'Username is required')
        .max(50, 'Username cannot exceed 50 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(100, 'Password cannot exceed 100 characters')
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one digit'),
    role: z.enum(['ADMIN', 'BRANCH_MANAGER']).default('BRANCH_MANAGER'),
    branchIds: z.array(z.string()).optional()
});

export const UpdateUserSchema = CreateUserSchema.partial().extend({
    id: z.string().min(1, 'Invalid user ID')
});

// Export validation
export const ExportFilterSchema = SettlementFilterSchema.extend({
    format: z.enum(['excel', 'pdf', 'csv']).default('excel'),
    includeReceipts: z.boolean().optional().default(false),
    includeAnalytics: z.boolean().optional().default(false)
});

// Validation error response type
export interface ValidationError {
    field: string;
    message: string;
    code: string;
}

// Export types
export type CreateSettlementInput = z.infer<typeof CreateSettlementSchema>;
export type UpdateSettlementInput = z.infer<typeof UpdateSettlementSchema>;
export type SettlementFilterInput = z.infer<typeof SettlementFilterSchema>;
export type CreateBranchInput = z.infer<typeof CreateBranchSchema>;
export type UpdateBranchInput = z.infer<typeof UpdateBranchSchema>;
export type BranchFilterInput = z.infer<typeof BranchFilterSchema>;
export type OCRRequestInput = z.infer<typeof OCRRequestSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type ExportFilterInput = z.infer<typeof ExportFilterSchema>;