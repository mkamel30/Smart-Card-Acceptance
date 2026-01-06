import { useState, useEffect } from 'react';
import api from '@/api/client';
import {
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import {
    LayoutDashboard, CreditCard, TrendingUp, RefreshCw, Image as ImageIcon, X
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/context/AdminContext';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function BranchStats() {
    const { user } = useAuth();
    const [summary, setSummary] = useState<any>(null);
    const [charts, setCharts] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState<any[]>([]);

    // Modal state for viewing images
    const [viewImage, setViewImage] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, [user]);

    const loadData = async () => {
        setLoading(true);
        try {
            // Priority: LocalStorage Branch (for Admins switching context) -> User's First Branch (for Managers)
            const storedBranchId = localStorage.getItem('selectedBranchId');
            const userBranchId = user?.branches?.[0]?.id;
            const branchId = storedBranchId || userBranchId;

            if (!branchId) {
                console.warn('No branch ID found for stats');
                setLoading(false);
                return;
            }

            const params = { branchId };

            const [sumRes, chartRes, txRes] = await Promise.all([
                api.get('/analytics/summary', { params }),
                api.get('/analytics/charts', { params }),
                api.get('/analytics/transactions', { params: { ...params, limit: 5 } }) // Get recent 5
            ]);

            setSummary(sumRes.data);
            setCharts(chartRes.data);
            setTransactions(txRes.data.data);
        } catch (err) {
            console.error('Failed to load stats data', err);
        } finally {
            setLoading(false);
        }
    };

    const getReceiptUrl = (tx: any) => {
        const path = tx.receipt?.imageUrl || tx.receiptImageUrl;
        if (!path) return null;
        const cleanPath = path.replace(/\\/g, '/');
        if (cleanPath.startsWith('http')) return cleanPath;
        return cleanPath.startsWith('/') ? `/api${cleanPath}` : `/api/${cleanPath}`;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-10">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-gray-800">إحصائيات الفرع</h2>
                <p className="text-gray-500 mt-1">نظرة عامة على أداء الفرع والمعاملات الجارية</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <SummaryCard
                    title="عدد الباتشات"
                    value={summary?.totalBatches || 0}
                    icon={LayoutDashboard}
                    color="text-purple-600"
                />
                <SummaryCard
                    title="إجمالي المعاملات"
                    value={summary?.totalCount || 0}
                    icon={CreditCard}
                    color="text-blue-600"
                />
                <SummaryCard
                    title="شركة سمارت"
                    value={summary?.smartCount || 0}
                    icon={TrendingUp}
                    color="text-indigo-600"
                />
                <SummaryCard
                    title="وزارة التموين"
                    value={summary?.tamweenCount || 0}
                    icon={TrendingUp}
                    color="text-green-600"
                />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Trend Chart (Sales over time) */}
                <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold mb-6 text-gray-800 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-primary" /> تطور المبيعات (الصافي)
                    </h3>
                    <div className="h-80 w-full">
                        {(!charts?.trend || charts.trend.length === 0) ? (
                            <div className="h-full flex items-center justify-center text-gray-400 font-medium">
                                لا توجد بيانات
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={charts.trend}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={(str) => format(new Date(str), 'MM/dd')}
                                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                        labelFormatter={(val) => format(new Date(val), 'yyyy/MM/dd')}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="total"
                                        stroke="#6366f1"
                                        strokeWidth={4}
                                        dot={{ fill: '#6366f1', strokeWidth: 2, r: 4, stroke: '#fff' }}
                                        activeDot={{ r: 6, strokeWidth: 0 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Status Pie Chart */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col">
                    <h3 className="text-lg font-bold mb-6 text-gray-800">حالة المعاملات</h3>
                    <div className="flex-1 flex flex-col items-center justify-center">
                        <div className="h-64 w-full">
                            {(!summary?.statusBreakdown || summary.statusBreakdown.length === 0) ? (
                                <div className="h-full flex items-center justify-center text-gray-400 font-medium">
                                    لا توجد بيانات
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={summary.statusBreakdown}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="count"
                                            label={({ status, percent }: any) => `${status} ${(percent * 100).toFixed(0)}%`}
                                        >
                                            {summary.statusBreakdown.map((_entry: any, index: number) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ borderRadius: '12px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Transactions (Simplified) */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800">أحدث المعاملات المسجلة</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="p-4 text-xs font-bold text-gray-500">التاريخ</th>
                                <th className="p-4 text-xs font-bold text-gray-500">التاجر / البنك</th>
                                <th className="p-4 text-xs font-bold text-gray-500">المبلغ</th>
                                <th className="p-4 text-xs font-bold text-gray-500">الحالة</th>
                                <th className="p-4 text-center text-xs font-bold text-gray-500">صورة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {transactions.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-gray-400">لا توجد معاملات حديثة</td>
                                </tr>
                            ) : transactions.map((tx: any) => (
                                <tr key={tx.id} className="hover:bg-gray-50/50">
                                    <td className="p-4 text-sm font-bold text-gray-700">
                                        {format(new Date(tx.settlementDate), 'yyyy/MM/dd')}
                                    </td>
                                    <td className="p-4">
                                        <div className="text-sm font-bold text-gray-800">{tx.merchantCode}</div>
                                        <div className="text-xs text-gray-500">{tx.bankName}</div>
                                    </td>
                                    <td className="p-4 text-sm font-bold text-gray-900">
                                        {Number(tx.netAmount).toLocaleString()} ج.م
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${tx.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                                            tx.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                                                'bg-red-100 text-red-700'
                                            }`}>
                                            {tx.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        {getReceiptUrl(tx) && (
                                            <button
                                                onClick={() => setViewImage(getReceiptUrl(tx))}
                                                className="text-gray-400 hover:text-primary transition-colors"
                                            >
                                                <ImageIcon className="w-4 h-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Image Modal */}
            {viewImage && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setViewImage(null)}>
                    <div className="relative max-w-4xl w-full bg-white rounded-2xl overflow-hidden">
                        <button onClick={() => setViewImage(null)} className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 text-white rounded-full p-2 backdrop-blur-sm z-10 transition-colors">
                            <X className="w-6 h-6 text-gray-800 mix-blend-difference" />
                        </button>
                        <img src={viewImage} alt="Receipt" className="w-full h-auto max-h-[85vh] object-contain bg-gray-100" />
                    </div>
                </div>
            )}
        </div>
    );
}

function SummaryCard({ title, value, icon: Icon, color, subtitle }: any) {
    return (
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-2xl ${color.replace('text-', 'bg-').replace('600', '50')}`}>
                    <Icon className={`w-6 h-6 ${color}`} />
                </div>
                {subtitle && <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">{subtitle}</span>}
            </div>
            <div>
                <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
                <h3 className="text-3xl font-bold text-gray-900">{typeof value === 'number' ? value.toLocaleString() : value}</h3>
            </div>
        </div>
    );
}
