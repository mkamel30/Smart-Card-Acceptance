import { useState, useEffect } from 'react';
import api from '@/api/client';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import Select from 'react-select';
import {
    LayoutDashboard, Calendar, Briefcase, Landmark, CreditCard,
    ArrowUpRight, TrendingUp, RefreshCw, Download
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
        }
        loadData();
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

    const loadData = async () => {
        setLoading(true);
        try {
            // Logic:
            // 1. If user selected branches, use them.
            // 2. If user is restricted to 1 branch, use it automatically (API handles this securely via token, but we can be explicit if needed).
            // 3. If user is Admin/Multi-Branch and selected nothing, API usually returns ALL or User's ALLOWED.
            //    Our backend controller handles `if (role === BRANCH_MANAGER) query.branchId = { in: user.allowedBranches }`.

            const params = {
                branches: selectedBranches.map(b => b.value),
                dateFrom,
                dateTo,
                status,
                bankName: bank
            };
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
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-2xl">
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

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    {canSelectBranch && (
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
                    )}
                    <div className="flex gap-2">
                        <button
                            onClick={handleExport}
                            className="flex-1 sm:flex-none bg-green-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-green-700 transition-all shadow-lg shadow-green-600/20 whitespace-nowrap"
                        >
                            <Download className="w-4 h-4" />
                            تصدير Excel
                        </button>
                        <button
                            onClick={handleApplyFilters}
                            className="flex-1 sm:flex-none bg-primary text-white px-6 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 whitespace-nowrap"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            تحديث
                        </button>
                        <button
                            onClick={handleReset}
                            className="p-2.5 text-gray-400 hover:text-gray-600 border border-gray-100 rounded-xl hover:bg-gray-50 transition-all"
                            title="إعادة ضبط"
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    title="إجمالي المبيعات"
                    value={`${(summary?.totalAmount || 0).toLocaleString()} ج.م`}
                    subtitle="مجموع كافة العمليات"
                    icon={Briefcase}
                    color="text-primary"
                />
                <MetricCard
                    title="المبالغ المسددة"
                    value={`${(summary?.settledAmount || 0).toLocaleString()} ج.م`}
                    subtitle="المبالغ التي تم تحصيلها"
                    icon={TrendingUp}
                    color="text-green-600"
                />
                <MetricCard
                    title="صافي الأرباح"
                    value={`${(summary?.netAmount || 0).toLocaleString()} ج.م`}
                    subtitle="بعد خصم الرسوم والمصاريف"
                    icon={ArrowUpRight}
                    color="text-blue-600"
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
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col">
                    <h3 className="text-lg font-bold mb-6 text-gray-800">الحالة الراهنة</h3>
                    <div className="flex-1 flex flex-col items-center justify-center">
                        <div className="h-64 w-full">
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
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 min-w-0">
                    <h3 className="text-lg font-bold mb-6 text-gray-800">أداء الفروع (الصافي)</h3>
                    <div className="h-80 w-full min-w-0">
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
                    </div>
                </div>

                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 min-w-0">
                    <h3 className="text-lg font-bold mb-6 text-gray-800">توزيع البنوك</h3>
                    <div className="h-80 w-full min-w-0">
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
                    </div>
                </div>
            </div>
        </div>
    );
}
