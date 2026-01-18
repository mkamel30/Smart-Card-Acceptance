import { useState, useEffect } from 'react';
import api from '@/api/client';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import Select from 'react-select';
import {
    LayoutDashboard, Calendar, Briefcase, Landmark, CreditCard,
    ArrowUpRight, TrendingUp, RefreshCw, Download, Image as ImageIcon, X, ChevronLeft, ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/context/AdminContext';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function BranchDashboard() {
    const { user, isAdmin } = useAuth();
    const [summary, setSummary] = useState<any>(null);
    const [charts, setCharts] = useState<any>(null);
    const [branches, setBranches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [selectedBranches, setSelectedBranches] = useState<any[]>([]);
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [status, setStatus] = useState('');
    const [bank, setBank] = useState('');

    const canSelectBranch = isAdmin || (user?.role === 'BRANCH_MANAGER' && user?.branches && user.branches.length > 1);

    useEffect(() => {
        // Fetch branches only if user has permission to see multiple or select
        if (canSelectBranch) {
            fetchBranches();
            loadData();
        } else if (user?.branches?.length === 1) {
            // Use functional update or set directly
            const b = user.branches[0];
            const branchOption = { value: b.id, label: b.name };
            setSelectedBranches([branchOption]);
            loadData([branchOption]);
        } else {
            loadData();
        }
    }, [user, isAdmin]);

    const fetchBranches = async () => {
        try {
            const res = await api.get('/branches');
            const availableBranches = isAdmin
                ? res.data
                : res.data.filter((b: any) => user?.branches?.some(ub => ub.id === b.id));

            setBranches(availableBranches.map((b: any) => ({ value: b.id, label: b.name })));
        } catch (err) {
            console.error('Failed to fetch branches');
        }
    };

    const loadData = async (overrideBranches?: any[]) => {
        setLoading(true);
        try {
            const effectiveBranches = overrideBranches || selectedBranches;

            const params: any = {};

            if (dateFrom) params.dateFrom = dateFrom;
            if (dateTo) params.dateTo = dateTo;
            if (status) params.status = status;
            if (bank) params.bankName = bank;

            if (effectiveBranches && effectiveBranches.length > 0) {
                params.branches = effectiveBranches.map(b => b.value);
            }
            const [sumRes, chartRes] = await Promise.all([
                api.get('/analytics/summary', { params }),
                api.get('/analytics/charts', { params })
            ]);
            setSummary(sumRes.data);
            setCharts(chartRes.data);
        } catch (err) {
            console.error('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    const handleApplyFilters = () => loadData();
    const handleReset = () => {
        setSelectedBranches([]);
        setDateFrom('');
        setDateTo('');
        setStatus('');
        setBank('');
    };

    const handleExport = async () => {
        try {
            const params = {
                branches: selectedBranches.map(b => b.value),
                dateFrom,
                dateTo,
                status,
                bankName: bank
            };
            const response = await api.get('/analytics/export', {
                params,
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `settlements-export-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (err) {
            console.error('Export failed', err);
        }
    };

    const getReceiptUrl = (tx: any) => {
        const path = tx.receipt?.imageUrl || tx.receiptImageUrl;
        if (!path) return null;
        const cleanPath = path.replace(/\\/g, '/');
        if (cleanPath.startsWith('http')) return cleanPath;
        return cleanPath.startsWith('/') ? `/api${cleanPath}` : `/api/${cleanPath}`;
    };

    // Transactions State
    const [transactions, setTransactions] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [viewImage, setViewImage] = useState<string | null>(null);

    const loadTransactions = async () => {
        try {
            const params = {
                branches: selectedBranches.map(b => b.value),
                dateFrom,
                dateTo,
                status,
                bankName: bank,
                page,
                limit: 10
            };
            const res = await api.get('/analytics/transactions', { params });
            setTransactions(res.data.data);
            setTotalPages(res.data.pagination.totalPages);
        } catch (err) {
            console.error('Failed to load transactions');
        }
    };

    useEffect(() => {
        loadTransactions();
    }, [page, summary]); // Reload when page changes or summary updates (implies filter change)

    // Image Modal Component
    const ImageModal = () => {
        if (!viewImage) return null;
        return (
            <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setViewImage(null)}>
                <div className="bg-white rounded-2xl p-2 max-w-2xl w-full relative animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                    <button
                        onClick={() => setViewImage(null)}
                        className="absolute top-4 right-4 bg-black/50 hover:bg-black text-white p-2 rounded-full transition-colors z-10"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    <img src={viewImage} alt="Receipt" className="w-full h-auto rounded-xl" />
                </div>
            </div>
        );
    };

    const MetricCard = ({ title, value, subtitle, icon: Icon, color }: any) => (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-start justify-between group hover:shadow-md transition-all">
            <div className="space-y-2">
                <p className="text-sm font-medium text-gray-500">{title}</p>
                <p className={`text-2xl font-black ${color}`}>{value}</p>
                <p className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-green-500" />
                    {subtitle}
                </p>
            </div>
            <div className={`p-3 rounded-xl bg-gray-50 group-hover:bg-opacity-80 transition-colors`}>
                <Icon className={`w-6 h-6 ${color.replace('text-', 'text-opacity-70 ')}`} />
            </div>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-700" dir="rtl">
            {/* Header & Main Filters */}
            {/* Header Area */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    {/* Title & Info */}
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary/10 rounded-2xl hidden sm:block">
                            <LayoutDashboard className="w-8 h-8 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl lg:text-2xl font-black text-gray-900 leading-tight">
                                {canSelectBranch ? 'داشبورد إدارة الفروع' : 'داشبورد الفرع'}
                            </h1>
                            <p className="text-sm text-gray-500 font-medium">
                                {canSelectBranch ? 'نظرة شاملة على أداء ومبيعات كافة الفروع' : 'متابعة أداء ومبيعات الفرع الحالي'}
                            </p>
                        </div>
                    </div>

                    {/* Quick Actions & Branch Toggle */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        {canSelectBranch ? (
                            <div className="w-full sm:w-64">
                                <Select
                                    isMulti
                                    options={branches}
                                    value={selectedBranches}
                                    onChange={(val) => setSelectedBranches(val as any)}
                                    placeholder="اختر الفروع..."
                                    className="text-sm"
                                    styles={{
                                        control: (base) => ({
                                            ...base,
                                            borderRadius: '12px',
                                            borderColor: '#e5e7eb',
                                            padding: '2px'
                                        })
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="w-full sm:w-64 flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-600 font-bold shadow-sm">
                                <span className="text-gray-400 text-xs">الفرع:</span>
                                <span className="truncate">
                                    {selectedBranches[0]?.label || user?.branches?.[0]?.name || '...'}
                                </span>
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={handleApplyFilters}
                                className="flex-1 sm:flex-none bg-primary text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                                <span className="hidden sm:inline">تحديث</span>
                            </button>
                            <button
                                onClick={handleExport}
                                className="flex-1 sm:flex-none bg-green-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-green-700 transition-all shadow-md shadow-green-600/20"
                            >
                                <Download className="w-4 h-4" />
                                <span className="hidden sm:inline">تصدير</span>
                            </button>
                            {isAdmin && (
                                <button
                                    onClick={async () => {
                                        if (confirm('بدء عملية تصحيح العمولات (1.15%)؟ سيتم عمل نسخة احتياطية للقاعدة أولاً.')) {
                                            try {
                                                const res = await api.get('/settlements/sync/fees', {
                                                    params: { password: 'TITI' } // Pass it in query as we allowed in adminAuth
                                                });
                                                alert(res.data.message);
                                                loadData();
                                            } catch (err) {
                                                alert('فشل في الوصول لرابط المزامنة. يرجى التأكد من اكتمال تحديث الخادم.');
                                            }
                                        }
                                    }}
                                    className="flex-1 sm:flex-none bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20"
                                    title="مزامنة وتصحيح العمولات الصفرية"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    <span className="text-xs">المزامنة (1.15%)</span>
                                </button>
                            )}
                            <button
                                onClick={handleReset}
                                className="p-2.5 text-gray-400 hover:text-gray-600 border border-gray-100 rounded-xl hover:bg-gray-50 transition-all"
                                title="إعادة ضبط الفلاتر"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-500 mr-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> من تاريخ
                    </label>
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-500 mr-1 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> إلى تاريخ
                    </label>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-500 mr-1 flex items-center gap-1">
                        <Landmark className="w-3 h-3" /> البنك
                    </label>
                    <select
                        value={bank}
                        onChange={e => setBank(e.target.value)}
                        className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none appearance-none"
                    >
                        <option value="">كل البنوك</option>
                        <option value="BANQUE MISR">بنك مصر</option>
                        <option value="CIB">CIB</option>
                        <option value="NBE">البنك الأهلي</option>
                    </select>
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-500 mr-1 flex items-center gap-1">
                        <CreditCard className="w-3 h-3" /> الحالة
                    </label>
                    <select
                        value={status}
                        onChange={e => setStatus(e.target.value)}
                        className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none appearance-none"
                    >
                        <option value="">كل الحالات</option>
                        <option value="PENDING">بانتظار الموافقة</option>
                        <option value="APPROVED">تمت الموافقة</option>
                        <option value="SETTLED">تمت التسوية</option>
                        <option value="REJECTED">مرفوض</option>
                    </select>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <MetricCard
                    title="مبالغ العمليات"
                    value={`${(summary?.settledAmount || 0).toLocaleString()} ج.م`}
                    subtitle="المبالغ المسددة الأساسية"
                    icon={Briefcase}
                    color="text-primary"
                />
                <MetricCard
                    title="الربح (1.15%)"
                    value={`${(summary?.fees || 0).toLocaleString()} ج.م`}
                    subtitle="إجمالي الربح المضاف"
                    icon={TrendingUp}
                    color="text-red-600"
                />
                <MetricCard
                    title="الإجمالي الشامل"
                    value={`${(summary?.netAmount || 0).toLocaleString()} ج.م`}
                    subtitle="المبلغ الأساسي + الربح"
                    icon={ArrowUpRight}
                    color="text-emerald-600"
                />
                <MetricCard
                    title="عدد العمليات"
                    value={summary?.totalCount || 0}
                    subtitle="إجمالي عدد الإيصالات"
                    icon={CreditCard}
                    color="text-purple-600"
                />
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold mb-6 text-gray-800 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-primary" /> تطور المبيعات (الصافي)
                    </h3>
                    <div className="h-80 w-full">
                        {loading ? (
                            <div className="h-full flex items-center justify-center text-gray-400">
                                <RefreshCw className="w-6 h-6 animate-spin" />
                            </div>
                        ) : (!charts?.trend || charts.trend.length === 0) ? (
                            <div className="h-full flex items-center justify-center text-gray-400 font-medium">
                                لا توجد بيانات
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={charts?.trend || []}>
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

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col">
                    <h3 className="text-lg font-bold mb-6 text-gray-800">الحالة الراهنة</h3>
                    <div className="flex-1 flex flex-col items-center justify-center">
                        <div className="h-64 w-full">
                            {loading ? (
                                <div className="h-full flex items-center justify-center text-gray-400">
                                    <RefreshCw className="w-6 h-6 animate-spin" />
                                </div>
                            ) : (!summary?.statusBreakdown || summary.statusBreakdown.length === 0) ? (
                                <div className="h-full flex items-center justify-center text-gray-400 font-medium">
                                    لا توجد بيانات
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={summary?.statusBreakdown || []}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="count"
                                            label={({ status, percent }: any) => `${status} ${(percent * 100).toFixed(0)}%`}
                                        >
                                            {(summary?.statusBreakdown || []).map((_entry: any, index: number) => (
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

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 min-w-0">
                    <h3 className="text-lg font-bold mb-6 text-gray-800">أداء الفروع (الصافي)</h3>
                    <div className="h-80 w-full min-w-0">
                        {loading ? (
                            <div className="h-full flex items-center justify-center text-gray-400">
                                <RefreshCw className="w-6 h-6 animate-spin" />
                            </div>
                        ) : (!charts?.byBranch || charts.byBranch.length === 0) ? (
                            <div className="h-full flex items-center justify-center text-gray-400 font-medium">
                                لا توجد بيانات
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={charts?.byBranch || []} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                                    <XAxis type="number" hide />
                                    <YAxis
                                        dataKey="branchName"
                                        type="category"
                                        tick={{ fontSize: 11, fontWeight: 'bold', fill: '#4b5563' }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={100}
                                    />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar
                                        dataKey="total"
                                        fill="#6366f1"
                                        radius={[0, 8, 8, 0]}
                                        barSize={20}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 min-w-0">
                    <h3 className="text-lg font-bold mb-6 text-gray-800">توزيع البنوك</h3>
                    <div className="h-80 w-full min-w-0">
                        {loading ? (
                            <div className="h-full flex items-center justify-center text-gray-400">
                                <RefreshCw className="w-6 h-6 animate-spin" />
                            </div>
                        ) : (!charts?.byBank || charts.byBank.length === 0) ? (
                            <div className="h-full flex items-center justify-center text-gray-400 font-medium">
                                لا توجد بيانات
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={charts?.byBank || []}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                    <XAxis
                                        dataKey="bankName"
                                        tick={{ fontSize: 12, fontWeight: 'bold', fill: '#4b5563' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis hide />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar
                                        dataKey="total"
                                        fill="#10b981"
                                        radius={[8, 8, 0, 0]}
                                        barSize={40}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-800">أحدث المعاملات</h3>
                    <div className="flex gap-2">
                        <button
                            disabled={page === 1}
                            onClick={() => setPage(p => p - 1)}
                            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                        <span className="flex items-center px-4 font-bold text-gray-600 bg-gray-50 rounded-lg">
                            {page} / {totalPages}
                        </span>
                        <button
                            disabled={page === totalPages}
                            onClick={() => setPage(p => p + 1)}
                            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="text-right p-4 text-xs font-bold text-gray-500">التاريخ</th>
                                <th className="text-right p-4 text-xs font-bold text-gray-500">الفرع</th>
                                <th className="text-right p-4 text-xs font-bold text-gray-500">البنك</th>
                                <th className="text-right p-4 text-xs font-bold text-gray-500">المبلغ</th>
                                <th className="text-right p-4 text-xs font-bold text-gray-500">الربح</th>
                                <th className="text-right p-4 text-xs font-bold text-gray-500">الصافي</th>
                                <th className="text-right p-4 text-xs font-bold text-gray-500">الحالة</th>
                                <th className="text-center p-4 text-xs font-bold text-gray-500 w-24">صورة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {transactions.map((tx: any) => (
                                <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="p-4 text-sm font-bold text-gray-700">
                                        {format(new Date(tx.settlementDate), 'yyyy/MM/dd')}
                                    </td>
                                    <td className="p-4 text-sm text-gray-600">{tx.branch?.name}</td>
                                    <td className="p-4 text-sm text-gray-600 font-medium">{tx.bankName}</td>
                                    <td className="p-4 text-sm font-bold text-gray-900">
                                        {Number(tx.totalAmount).toLocaleString()}
                                    </td>
                                    <td className="p-4 text-sm text-red-600 font-bold">
                                        {Number(tx.fees || 0).toLocaleString()}
                                    </td>
                                    <td className="p-4 text-sm text-emerald-600 font-black">
                                        {Number(tx.netAmount || 0).toLocaleString()}
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${tx.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                                            tx.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                                                tx.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                                                    'bg-blue-100 text-blue-700'
                                            }`}>
                                            {tx.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        {getReceiptUrl(tx) ? (
                                            <button
                                                onClick={() => setViewImage(getReceiptUrl(tx))}
                                                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-primary transition-colors mx-auto"
                                                title="عرض الصورة"
                                            >
                                                <ImageIcon className="w-5 h-5" />
                                            </button>
                                        ) : (
                                            <span className="text-gray-300">-</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <ImageModal />
        </div >
    );
}
