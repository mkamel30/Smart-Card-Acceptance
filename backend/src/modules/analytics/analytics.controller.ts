
import { Request, Response, NextFunction } from 'express';
import analyticsService from './analytics.service';

export class AnalyticsController {
    async getSummary(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            const filters = this.parseFilters(req.query, user);
            const summary = await analyticsService.getDashboardSummary(filters);
            res.json(summary);
        } catch (error) {
            next(error);
        }
    }

    async getCharts(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            const filters = this.parseFilters(req.query, user);
            const charts = await analyticsService.getChartsData(filters);
            res.json(charts);
        } catch (error) {
            next(error);
        }
    }

    async exportSettlements(req: Request, res: Response, next: NextFunction) {
        try {
            const user = (req as any).user;
            const filters = this.parseFilters(req.query, user);
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
                { header: 'الإجمالي', key: 'total', width: 15 },
                { header: 'الرسوم', key: 'fees', width: 15 },
                { header: 'الصافي', key: 'net', width: 15 },
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
        try {
            const user = (req as any).user;
            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 10;
            const filters = this.parseFilters(req.query, user);
            const result = await analyticsService.getPaginatedTransactions(page, limit, filters);
            res.json(result);
        } catch (error) {
            next(error);
        }
    }

    private parseFilters(query: any, user?: any) {
        const filters: any = {};

        let allowedBranches: string[] = [];
        if (user && user.role === 'BRANCH_MANAGER') {
            allowedBranches = user.allowedBranches || [];
        }

        // Handle Branch Multi-select
        if (query.branches) {
            const requestedBranches = Array.isArray(query.branches) ? query.branches : [query.branches];

            if (user?.role === 'BRANCH_MANAGER') {
                const validBranches = requestedBranches.filter((id: string) => allowedBranches.includes(id));
                filters.branchId = { in: validBranches.length > 0 ? validBranches : ['NO_ACCESS'] };
            } else {
                filters.branchId = { in: requestedBranches };
            }
        } else if (user?.role === 'BRANCH_MANAGER') {
            filters.branchId = { in: allowedBranches.length > 0 ? allowedBranches : ['NO_ACCESS'] };
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

        // Bank
        if (query.bankName) {
            filters.bankName = query.bankName;
        }

        // Card Type
        if (query.cardType) {
            filters.cardType = query.cardType;
        }

        return filters;
    }
}

export default new AnalyticsController();
