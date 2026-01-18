
import prisma from '../../config/database';

export class AnalyticsService {
    async getDashboardSummary(filters: any) {
        try {
            // 1. Basic Aggregations (Sums)
            const stats = await prisma.settlement.aggregate({
                where: filters,
                _sum: {
                    totalAmount: true,
                    settledAmount: true,
                    fees: true,
                    netAmount: true
                },
                _count: {
                    id: true
                }
            });

            // 2. Counts for Categories (SMART/TAMWEEN)
            const categoryCounts = await prisma.settlement.groupBy({
                where: filters,
                by: ['serviceCategory'],
                _count: {
                    id: true
                }
            });

            // 3. Status Breakdown (for Pending etc)
            const statusCounts = await prisma.settlement.groupBy({
                where: filters,
                by: ['status'],
                _count: {
                    id: true
                }
            });

            // 4. Unique Batch Count
            const batchCountGroup = await prisma.settlement.groupBy({
                where: {
                    AND: [
                        filters,
                        { batchNumber: { not: null } },
                        { batchNumber: { not: '' } }
                    ]
                },
                by: ['batchNumber'],
            });

            return {
                totalAmount: Number(stats._sum.totalAmount) || 0,
                settledAmount: Number(stats._sum.settledAmount) || 0,
                fees: Number(stats._sum.fees) || 0,
                netAmount: Number(stats._sum.netAmount) || 0,
                totalCount: stats._count.id,
                batchCount: batchCountGroup.length,
                smartCount: categoryCounts.find(c => c.serviceCategory === 'SMART')?._count.id || 0,
                tamweenCount: categoryCounts.find(c => c.serviceCategory === 'TAMWEEN')?._count.id || 0,
                pendingCount: statusCounts.find(s => s.status === 'PENDING')?._count.id || 0,
                statusBreakdown: statusCounts.map(s => ({
                    status: s.status,
                    count: s._count.id
                }))
            };
        } catch (error: any) {
            console.error('[AnalyticsService.getDashboardSummary] PRISMA ERROR:', error);
            throw error;
        }
    }

    async getChartsData(filters: any) {
        try {
            // 1. By Branch
            const byBranch = await prisma.settlement.groupBy({
                where: filters,
                by: ['branchId'],
                _sum: {
                    netAmount: true
                },
                _count: {
                    id: true
                }
            });

            // 2. By Bank
            const byBank = await prisma.settlement.groupBy({
                where: filters,
                by: ['bankName'],
                _sum: {
                    netAmount: true
                },
                _count: {
                    id: true
                }
            });

            // 3. Trend by Date
            const trend = await prisma.settlement.groupBy({
                where: filters,
                by: ['settlementDate'],
                _sum: {
                    netAmount: true
                },
                _count: {
                    id: true
                },
                orderBy: {
                    settlementDate: 'asc'
                }
            });

            // Map branch IDs to names
            const branches = await prisma.branch.findMany({
                where: { id: { in: byBranch.map(b => b.branchId).filter(Boolean) as string[] } }
            });

            return {
                byBranch: byBranch.map(b => ({
                    branchId: b.branchId,
                    branchName: branches.find(br => br.id === b.branchId)?.name || 'Unknown',
                    total: Number(b._sum.netAmount) || 0,
                    count: b._count.id
                })),
                byBank: byBank.map(b => ({
                    bankName: b.bankName || 'Unknown',
                    total: Number(b._sum.netAmount) || 0,
                    count: b._count.id
                })),
                trend: trend.map(t => ({
                    date: t.settlementDate,
                    total: Number(t._sum.netAmount) || 0,
                    count: t._count.id
                }))
            };
        } catch (error: any) {
            console.error('[AnalyticsService.getChartsData] PRISMA ERROR:', error);
            throw error;
        }
    }
    async getExportData(filters: any) {
        return await prisma.settlement.findMany({
            where: filters,
            include: {
                branch: {
                    select: { name: true, code: true }
                }
            },
            orderBy: {
                settlementDate: 'desc'
            }
        });
    }

    async getPaginatedTransactions(page: number, limit: number, filters: any) {
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            prisma.settlement.findMany({
                where: filters,
                include: {
                    branch: {
                        select: { name: true, code: true }
                    },
                    receipt: true
                },
                orderBy: {
                    settlementDate: 'desc'
                },
                skip,
                take: limit
            }),
            prisma.settlement.count({ where: filters })
        ]);

        return {
            data,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    }
}

export default new AnalyticsService();
