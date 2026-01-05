
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
