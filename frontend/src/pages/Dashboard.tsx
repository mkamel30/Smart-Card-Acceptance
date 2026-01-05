import { useState, useEffect, useRef } from 'react';
import api from '@/api/client';
import { Download, Mail, Edit2, Filter, Zap, Loader2, Printer, Trash2, Image } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAdmin } from '@/context/AdminContext';
import EditSettlementModal from '@/components/EditSettlementModal';

export default function Dashboard() {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [settlements, setSettlements] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [filters] = useState({ category: '' });
    const { isAdmin } = useAdmin();
    const [editingSettlement, setEditingSettlement] = useState<any>(null);

    useEffect(() => {
        fetchSettlements();
    }, [filters]);

    const getImageUrl = (s: any) => {
        const path = s.receipt?.imageUrl || s.receiptImageUrl;
        if (!path) return null;
        const cleanPath = path.replace(/\\/g, '/');
        if (cleanPath.startsWith('http')) return cleanPath;
        return cleanPath.startsWith('/') ? `/api${cleanPath}` : `/api/${cleanPath}`;
    };

    const fetchSettlements = async () => {
        setLoading(true);
        try {
            const params: any = {};
            if (filters.category) params.status = filters.category;
            const res = await api.get('/settlements', { params });
            setSettlements(res.data.data);
        } catch (error) {
            console.error('Failed to fetch settlements:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleQuickScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setScanning(true);
        const formData = new FormData();
        formData.append('receipt', file);

        try {
            const res = await api.post('/ocr/scan', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            // Navigate to New Settlement with extracted data
            navigate('/settlement/new', { state: { ocrData: res.data.data } });
        } catch (error) {
            alert('فشل استخراج البيانات من الإيصال. يرجى إدخال البيانات يدوياً.');
            navigate('/settlement/new');
        } finally {
            setScanning(false);
        }
    };

    const handleDownloadExcel = async () => {
        try {
            const response = await api.get('/exports/excel', { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `settlements_${new Date().toLocaleDateString()}.xlsx`);
            document.body.appendChild(link);
            link.click();
        } catch (err) {
            alert('حدث خطأ أثناء تحميل ملف Excel');
        }
    };

    const handleSendEmail = async (id: string) => {
        if (!confirm('هل أنت متأكد من إرسال هذا التقرير عبر البريد الإلكتروني؟')) return;
        try {
            await api.post(`/email/send/${id}`);
            alert('تم إرسال البريد الإلكتروني بنجاح');
            fetchSettlements();
        } catch (err) {
            alert('فشل إرسال البريد الإلكتروني. يرجى التأكد من إعدادات SMTP.');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div>
                    <h2 className="text-2xl font-bold">لوحة معلومات المعاملات و التسويات</h2>
                    <p className="text-gray-500">متابعة المعاملات و التسويات الخاصة بقبول البطاقات</p>
                </div>
                <div className="flex gap-3 text-right" dir="rtl">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleQuickScan}
                        className="hidden"
                        accept="image/*"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={scanning}
                        className="btn-secondary flex items-center gap-2 border-primary text-primary hover:bg-primary/5 shadow-sm"
                    >
                        {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-primary" />}
                        {scanning ? 'جاري المسح...' : 'إضافة عبر مسح إيصال'}
                    </button>
                    <button onClick={handleDownloadExcel} className="btn-secondary flex items-center gap-2">
                        <Download className="w-4 h-4" />
                        تصدير تقرير Excel
                    </button>
                    <Link to="/settlement/new" className="btn-primary flex items-center gap-2 px-6">
                        إضافة معاملة جديدة
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-5 gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm border-r-4 border-r-purple-500">
                    <p className="text-sm text-gray-500">عدد الباتشات</p>
                    <p className="text-2xl font-bold text-purple-600">
                        {new Set(settlements.map(s => s.batchNumber).filter(b => b)).size}
                    </p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                    <p className="text-sm text-gray-500">إجمالي المعاملات</p>
                    <p className="text-2xl font-bold">{settlements.length}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm border-r-4 border-r-blue-500">
                    <p className="text-sm text-gray-500">شركة سمارت</p>
                    <p className="text-2xl font-bold text-blue-600">
                        {settlements.filter(s =>
                            !s.subService?.includes('فروق') &&
                            !s.subService?.includes('غرامات') &&
                            !s.subService?.includes('الغرامات')
                        ).length}
                    </p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm border-r-4 border-r-green-500">
                    <p className="text-sm text-gray-500">وزارة التموين</p>
                    <p className="text-2xl font-bold text-green-600">
                        {settlements.filter(s =>
                            s.subService?.includes('فروق') ||
                            s.subService?.includes('غرامات') ||
                            s.subService?.includes('الغرامات')
                        ).length}
                    </p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm border-r-4 border-r-yellow-500">
                    <p className="text-sm text-gray-500">بانتظار الموافقة</p>
                    <p className="text-2xl font-bold text-yellow-600">{settlements.filter(s => s.status === 'PENDING').length}</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                    <span className="font-bold text-gray-700">قائمة الحركات الأخيرة</span>
                    <div className="flex gap-2 items-center">
                        <Filter className="w-4 h-4 text-gray-400" />
                        <select className="text-xs border-none bg-transparent focus:ring-0">
                            <option>الكل</option>
                            <option>شركة سمارت</option>
                            <option>وزارة التموين</option>
                        </select>
                    </div>
                </div>
                <table className="w-full text-right" dir="rtl">
                    <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold">
                        <tr>
                            <th className="px-6 py-4">التاريخ</th>
                            <th className="px-6 py-4">التصنيف</th>
                            <th className="px-6 py-4">كود التاجر</th>
                            <th className="px-6 py-4">الباتش / الموافقة</th>
                            <th className="px-6 py-4">المبلغ الصافي</th>
                            <th className="px-6 py-4">الحالة</th>
                            <th className="px-6 py-4 text-left">العمليات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan={7} className="px-6 py-10 text-center text-gray-500">جاري التحميل...</td></tr>
                        ) : settlements.length === 0 ? (
                            <tr><td colSpan={7} className="px-6 py-10 text-center text-gray-500 italic">لا توجد بيانات مسجلة حالياً</td></tr>
                        ) : settlements.map((s) => (
                            <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-6 py-4 text-sm">{new Date(s.settlementDate).toLocaleDateString('ar-EG')}</td>
                                <td className="px-6 py-4">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${s.serviceCategory === 'TAMWEEN' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                        {s.subService || (s.serviceCategory === 'SMART' ? 'سمارت' : 'تموين')}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm font-bold font-mono">{s.merchantCode}</td>
                                <td className="px-6 py-4 text-xs text-gray-500">
                                    B: {s.batchNumber || '---'} / A: {s.approvalNumber || '---'}
                                </td>
                                <td className="px-6 py-4 text-sm font-black text-gray-800">{Number(s.netAmount).toLocaleString()} ج.م</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 text-[10px] rounded-lg font-bold ${s.status === 'APPROVED' ? 'bg-green-100 text-green-700 border border-green-200' :
                                        s.status === 'PENDING' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                                            'bg-gray-100 text-gray-700'
                                        }`}>
                                        {s.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-left flex justify-end gap-1">
                                    <button onClick={() => window.open(`/settlement/${s.id}/print`, '_blank')} className="p-2 text-gray-400 hover:text-blue-500 transition-colors" title="طباعة الإيصال">
                                        <Printer className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleSendEmail(s.id)} className="p-2 text-gray-400 hover:text-primary transition-colors" title="إرسال إيميل">
                                        <Mail className="w-4 h-4" />
                                    </button>
                                    <a href={`/api/exports/pdf/${s.id}`} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-red-500 transition-colors" title="تقرير PDF">
                                        <Download className="w-4 h-4" />
                                    </a>
                                    <Link to={`/settlement/${s.id}/receipt`} className="p-2 text-gray-400 hover:text-primary transition-colors" title="عرض الإيصال">
                                        <Edit2 className="w-4 h-4" />
                                    </Link>

                                    {getImageUrl(s) && (
                                        <button
                                            onClick={() => window.open(getImageUrl(s), '_blank')}
                                            className="p-2 text-gray-400 hover:text-green-600 transition-colors"
                                            title="فتح صورة الإيصال الأصلية"
                                        >
                                            <Image className="w-4 h-4" />
                                        </button>
                                    )}

                                    {isAdmin && (
                                        <>
                                            <button
                                                onClick={() => setEditingSettlement(s)}
                                                className="p-2 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                                                title="تعديل"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (confirm('هل أنت متأكد من الحذف؟')) {
                                                        try {
                                                            await api.delete(`/settlements/${s.id}`);
                                                            fetchSettlements();
                                                        } catch (e) { alert('فشل الحذف'); }
                                                    }
                                                }}
                                                className="p-2 text-red-500 hover:bg-red-50 rounded transition-colors"
                                                title="حذف"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}

                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <EditSettlementModal
                isOpen={!!editingSettlement}
                onClose={() => setEditingSettlement(null)}
                settlement={editingSettlement}
                onSave={fetchSettlements}
            />
        </div>
    );
}
