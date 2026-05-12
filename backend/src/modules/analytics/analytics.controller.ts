import { Request, Response, NextFunction } from 'express';
import analyticsService from './analytics.service';

export class AnalyticsController {
    async getSummary(req: Request, res: Response, next: NextFunction) {
        let filters: any = {};
        try {
            const user = (req as any).user;
            filters = await this.parseFilters(req.query, user);
            const summary = await analyticsService.getDashboardSummary(filters);
            res.json(summary);
        } catch (error: any) {
            console.error('[AnalyticsController.getSummary] Error:', {
                message: error.message,
                stack: error.stack,
                filters
            });
            next(error);
        }
    }

    async getCharts(req: Request, res: Response, next: NextFunction) {
        let filters: any = {};
        try {
            const user = (req as any).user;
            filters = await this.parseFilters(req.query, user);
            const charts = await analyticsService.getChartsData(filters);
            res.json(charts);
        } catch (error: any) {
            console.error('[AnalyticsController.getCharts] Error:', {
                message: error.message,
                stack: error.stack,
                filters
            });
            next(error);
        }
    }

    async exportSettlements(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            const filters = await this.parseFilters(req.query, user);
            const data = await analyticsService.getExportData(filters);

            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Settlements');

            worksheet.columns = [
                { header: 'التاريخ', key: 'date', width: 15 },
                { header: 'الفرع', key: 'branch', width: 20 },
                { header: 'البنك', key: 'bank', width: 15 },
                { header: 'نوع البطاقة', key: 'card', width: 15 },
                { header: 'كود التاجر', key: 'mid', width: 15 },
                { header: 'رقم الباتش', key: 'batch', width: 15 },
                { header: 'رقم الموافقة', key: 'approval', width: 15 },
                { header: 'أول 6 أرقام', key: 'bin', width: 12 },
                { header: 'آخر 4 أرقام', key: 'last4', width: 12 },
                { header: 'المبلغ الأساسي', key: 'total', width: 15 },
                { header: 'الربح (1.15%)', key: 'fees', width: 15 },
                { header: 'الإجمالي الشامل', key: 'net', width: 15 },
                { header: 'الحالة', key: 'status', width: 15 },
                { header: 'رقم المرجع', key: 'ref', width: 20 },
            ];

            // Style header
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            };

            data.forEach((item: any) => {
                worksheet.addRow({
                    date: item.settlementDate.toISOString().split('T')[0],
                    branch: item.branch?.name || '-',
                    bank: item.bankName || '-',
                    card: item.cardType || '-',
                    mid: item.merchantCode || '-',
                    batch: item.batchNumber || '-',
                    approval: item.approvalNumber || '-',
                    bin: item.cardBin || '-',
                    last4: item.last4Digits || '-',
                    total: Number(item.totalAmount),
                    fees: Number(item.fees),
                    net: Number(item.netAmount),
                    status: item.status,
                    ref: item.referenceNumber || '-'
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=settlements-export.xlsx');

            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            next(error);
        }
    }

    async getTransactions(req: Request, res: Response, next: NextFunction) {
        let filters: any = {};
        try {
            const user = (req as any).user;
            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 10;
            filters = await this.parseFilters(req.query, user);
            const result = await analyticsService.getPaginatedTransactions(page, limit, filters);
            res.json(result);
        } catch (error: any) {
            console.error('[AnalyticsController.getTransactions] Error:', {
                message: error.message,
                stack: error.stack,
                filters
            });
            next(error);
        }
    }

    private async parseFilters(query: any, user?: any) {
        const filters: any = {};

        let allowedBranches: string[] = [];
        if (user && user.role === 'BRANCH_MANAGER') {
            allowedBranches = user.allowedBranches || [];
        }

        // Handle Branch Multi-select or Single-select
        const branchInput = query.branches || query.branchId;
        if (branchInput && branchInput !== 'all' && branchInput !== 'null' && branchInput !== 'undefined') {
            const requestedBranches = Array.isArray(branchInput) ? branchInput : [branchInput];

            // Use OR condition because Prisma doesn't like mixed types in 'in' (strings and null)
            filters.OR = [
                { branchId: { in: requestedBranches } },
                { branchId: null },
                { branchId: '' }
            ];
        } else if (user?.role === 'BRANCH_MANAGER') {
            filters.OR = [
                { branchId: { in: allowedBranches } },
                { branchId: null },
                { branchId: '' }
            ];
        }

        // Handle Date Range
        if (query.dateFrom || query.dateTo) {
            filters.settlementDate = {};
            if (query.dateFrom) filters.settlementDate.gte = new Date(query.dateFrom);
            if (query.dateTo) filters.settlementDate.lte = new Date(query.dateTo);
        }

        // Status
        if (query.status) {
            filters.status = query.status;
        }

        // Service Category
        if (query.serviceCategory) {
            filters.serviceCategory = query.serviceCategory;
        }

        // Bank
        if (query.bankName) {
            filters.bankName = query.bankName;
        }

        // Card Type
        if (query.cardType) {
            filters.cardType = query.cardType;
        }

        // Search Fields
        if (query.merchantCode) {
            filters.merchantCode = query.merchantCode;
        }
        if (query.batchNumber) {
            filters.batchNumber = query.batchNumber;
        }
        if (query.approvalNumber) {
            filters.approvalNumber = query.approvalNumber;
        }
        if (query.merchantName) {
            filters.merchantName = { contains: query.merchantName, mode: 'insensitive' };
        }
        if (query.search) {
            const search = String(query.search);
            filters.OR = [
                ...(filters.OR || []),
                { merchantCode: { contains: search, mode: 'insensitive' } },
                { merchantName: { contains: search, mode: 'insensitive' } },
                { batchNumber: { contains: search, mode: 'insensitive' } },
                { approvalNumber: { contains: search, mode: 'insensitive' } },
                { referenceNumber: { contains: search, mode: 'insensitive' } },
            ];
        }

        return filters;
    }
}

export default new AnalyticsController();
