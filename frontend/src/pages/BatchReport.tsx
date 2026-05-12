import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Printer, ArrowRight, Trash2, Edit2, Image, Plus, Settings } from 'lucide-react';
import { useAdmin } from '@/context/AdminContext';
import EditSettlementModal from '@/components/EditSettlementModal';
import api from '@/api/client';

interface Transaction {
    id: string;
    merchantCode: string;
    merchantName: string;
    subService: string;
    approvalNumber: string;
    settledAmount: number;
}

interface BatchData {
    batchNumber: string;
    settlementDate: string;
    transactions: Transaction[];
    totalAmount: number;
    isSettled: boolean;
}

export default function BatchReport() {
    const { batchNumber } = useParams();
    const navigate = useNavigate();
    const { isAdmin } = useAdmin();
    const [batch, setBatch] = useState<BatchData | null>(null);
    const [editingTransaction, setEditingTransaction] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
    const [isEditingBatch, setIsEditingBatch] = useState(false);
    const [newBatchNumber, setNewBatchNumber] = useState('');
    const [newSettlementDate, setNewSettlementDate] = useState('');

    const getImageUrl = (s: any) => {
        const path = s.receipt?.imageUrl || s.receiptImageUrl;
        if (!path) return null;
        const cleanPath = path.replace(/\\/g, '/');
        if (cleanPath.startsWith('http')) return cleanPath;
        return cleanPath.startsWith('/') ? `/api${cleanPath}` : `/api/${cleanPath}`;
    };

    const loadBatch = async () => {
        try {
            const res = await api.get('/settlements/batches');
            const found = res.data.find((b: any) => b.batchNumber === batchNumber);
            setBatch(found);
            if (found) {
                setNewBatchNumber(found.batchNumber);
                setNewSettlementDate(new Date(found.settlementDate).toISOString().slice(0, 10));
            }
        } catch (error) {
            console.error(error);
            alert('فشل تحميل بيانات الباتش');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadBatch();
    }, [batchNumber]);

    const handleDeleteBatch = async () => {
        if (!confirm('هل أنت متأكد من حذف الباتش بالكامل وجميع معاملاته نهائياً؟')) return;
        try {
            await api.delete(`/settlements/batches/${batchNumber}`);
            navigate('/batches');
        } catch (error) {
            alert('فشل حذف الباتش');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedTransactions.length === 0) return;
        if (!confirm(`هل أنت متأكد من حذف ${selectedTransactions.length} معاملة نهائياً؟`)) return;
        try {
            await api.post('/settlements/bulk-delete', { ids: selectedTransactions });
            setSelectedTransactions([]);
            loadBatch();
        } catch (error) {
            alert('فشل الحذف الجماعي');
        }
    };

    const handleUpdateBatch = async () => {
        try {
            await api.put(`/settlements/batches/${batchNumber}`, { newBatchNumber, newSettlementDate });
            if (newBatchNumber !== batchNumber) {
                navigate(`/report/batch/${newBatchNumber}`);
            } else {
                setIsEditingBatch(false);
                loadBatch();
            }
        } catch (error) {
            alert('فشل تحديث الباتش');
        }
    };

    const toggleSelectAll = () => {
        if (selectedTransactions.length === batch?.transactions.length) {
            setSelectedTransactions([]);
        } else {
            setSelectedTransactions(batch?.transactions.map(t => t.id) || []);
        }
    };

    const toggleSelect = (id: string) => {
        setSelectedTransactions(prev => prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]);
    };

    if (loading) return <div className="flex justify-center items-center h-screen">جاري التحميل...</div>;
    if (!batch) return <div className="flex justify-center items-center h-screen">الباتش غير موجود</div>;

    return (
        <div className="min-h-screen bg-gray-100 p-8 print:p-0 print:bg-white font-sans">
            {/* Toolbar - Hidden in Print */}
            <div className="max-w-[210mm] mx-auto mb-6 flex justify-between items-center print:hidden">
                <button
                    onClick={() => window.close()}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                >
                    <ArrowRight className="w-5 h-5" />
                    إغلاق
                </button>
                <div className="flex gap-3">
                    {isAdmin && (
                        <>
                            {selectedTransactions.length > 0 && (
                                <button
                                    onClick={handleBulkDelete}
                                    className="bg-red-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-600 font-bold shadow-sm"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    حذف المحدد ({selectedTransactions.length})
                                </button>
                            )}
                            <button
                                onClick={() => setIsEditingBatch(!isEditingBatch)}
                                className="bg-orange-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-orange-600 font-bold shadow-sm"
                            >
                                <Settings className="w-4 h-4" />
                                تعديل الباتش
                            </button>
                            <button
                                onClick={handleDeleteBatch}
                                className="bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-red-700 font-bold shadow-sm"
                            >
                                <Trash2 className="w-4 h-4" />
                                حذف الباتش
                            </button>
                            <Link
                                to="/settlement/new"
                                state={{ prefill: { batchNumber: batch.batchNumber, settlementDate: batch.settlementDate } }}
                                className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-700 font-bold shadow-sm"
                            >
                                <Plus className="w-4 h-4" />
                                إضافة للباتش
                            </Link>
                        </>
                    )}
                    <button
                        onClick={() => window.print()}
                        className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 font-bold shadow-sm"
                    >
                        <Printer className="w-5 h-5" />
                        طباعة / حفظ PDF
                    </button>
                </div>
            </div>

            {/* A4 Paper */}
            <div className="max-w-[210mm] mx-auto bg-white p-[15mm] shadow-xl print:shadow-none print:w-full min-h-[297mm]">

                {/* Header */}
                <div className="flex justify-between items-start mb-8 border-b-2 border-blue-900 pb-6">
                    <div>
                        <img src="/logo.png" alt="Logo" className="h-16 object-contain" />
                    </div>
                    <div className="text-left">
                        <h1 className="text-3xl font-bold text-blue-900 mb-2">تقرير تسوية مجمعة</h1>
                        <p className="text-gray-500 font-mono text-lg">Batch #{batch.batchNumber}</p>
                    </div>
                </div>

                {isEditingBatch && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-8 print:hidden">
                        <h3 className="font-bold text-orange-800 mb-4 flex items-center gap-2">
                            <Settings className="w-5 h-5" /> إعدادات الباتش
                        </h3>
                        <div className="flex gap-4 items-end flex-wrap">
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-sm font-bold text-gray-700 mb-1">تغيير رقم الباتش</label>
                                <input type="text" value={newBatchNumber} onChange={e => setNewBatchNumber(e.target.value)} className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                            </div>
                            <div className="flex-1 min-w-[200px]">
                                <label className="block text-sm font-bold text-gray-700 mb-1">تغيير تاريخ التسوية</label>
                                <input type="date" value={newSettlementDate} onChange={e => setNewSettlementDate(e.target.value)} className="w-full px-3 py-2 border border-orange-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleUpdateBatch} className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg font-bold transition-colors">
                                    حفظ التعديلات
                                </button>
                                <button onClick={() => setIsEditingBatch(false)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-bold transition-colors">
                                    إلغاء
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Meta Data Box */}
                <div className="bg-gray-50 rounded-xl p-6 mb-8 flex flex-wrap justify-between items-center border border-gray-100 gap-4">
                    <div className="text-right">
                        <p className="text-sm text-gray-500 mb-1">تاريخ التسوية</p>
                        <p className="text-xl font-bold text-gray-800">
                            {new Date(batch.settlementDate).toLocaleDateString('ar-EG')}
                        </p>
                    </div>
                    <div className="text-right border-r border-gray-200 pr-8">
                        <p className="text-sm text-gray-500 mb-1">عدد المعاملات</p>
                        <p className="text-xl font-bold text-gray-800">{batch.transactions.length}</p>
                    </div>
                    <div className="text-right border-r border-gray-200 pr-8">
                        <p className="text-sm text-gray-500 mb-1">صافي مبلغ الخدمة</p>
                        <p className="text-xl font-bold text-blue-600">
                            {(batch as any).totalAmount?.toLocaleString()} ج.م
                        </p>
                    </div>
                    <div className="text-right border-r border-gray-200 pr-8">
                        <p className="text-sm text-gray-500 mb-1">الربح (1.15%)</p>
                        <p className="text-xl font-bold text-red-600">
                            {(batch as any).totalFees?.toLocaleString()} ج.م
                        </p>
                    </div>
                    <div className="text-right border-r border-gray-200 pr-8">
                        <p className="text-sm text-gray-500 mb-1">الإجمالي</p>
                        <p className="text-xl font-black text-emerald-600">
                            {(batch as any).totalNet?.toLocaleString()} ج.م
                        </p>
                    </div>
                    <div className="mr-auto">
                        {batch.isSettled ? (
                            <span className="bg-green-100 text-green-700 px-4 py-2 rounded-lg font-bold border border-green-200">
                                تمت التسوية ✅
                            </span>
                        ) : (
                            <span className="bg-yellow-100 text-yellow-700 px-4 py-2 rounded-lg font-bold border border-yellow-200">
                                معلق ⏳
                            </span>
                        )}
                    </div>
                </div>

                {/* Transactions Table */}
                <table className="w-full text-sm text-right">
                    <thead>
                        <tr className="bg-blue-900 text-white">
                            {isAdmin && (
                                <th className="px-4 py-3 rounded-tr-lg print:hidden text-center w-10">
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 cursor-pointer accent-blue-500" 
                                        checked={selectedTransactions.length === batch.transactions.length && batch.transactions.length > 0} 
                                        onChange={toggleSelectAll} 
                                    />
                                </th>
                            )}
                            <th className={`px-4 py-3 ${!isAdmin ? 'rounded-tr-lg' : ''}`}>م</th>
                            <th className="px-4 py-3">كود التاجر</th>
                            <th className="px-4 py-3">اسم التاجر</th>
                            <th className="px-4 py-3">الخدمة</th>
                            <th className="px-4 py-3">رقم الموافقة</th>
                            <th className="px-4 py-3 text-left">المبلغ الصافي</th>
                            <th className="px-4 py-3 text-left">العمولة (1.15%)</th>
                            <th className="px-4 py-3 text-left">الإجمالي</th>
                            <th className="px-4 py-3 rounded-tl-lg text-center print:hidden">إجراءات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {batch.transactions.map((t, idx) => (
                            <tr key={t.id} className={`even:bg-gray-50 ${selectedTransactions.includes(t.id) ? 'bg-blue-50' : ''}`}>
                                {isAdmin && (
                                    <td className="px-4 py-3 text-center print:hidden">
                                        <input 
                                            type="checkbox" 
                                            className="w-4 h-4 cursor-pointer accent-blue-600" 
                                            checked={selectedTransactions.includes(t.id)} 
                                            onChange={() => toggleSelect(t.id)} 
                                        />
                                    </td>
                                )}
                                <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                                <td className="px-4 py-3 font-mono">{t.merchantCode}</td>
                                <td className="px-4 py-3">{t.merchantName || '-'}</td>
                                <td className="px-4 py-3 text-gray-600">{t.subService}</td>
                                <td className="px-4 py-3 font-mono text-gray-500">{t.approvalNumber}</td>
                                <td className="px-4 py-3 font-bold text-left" dir="ltr">
                                    {Number(t.settledAmount).toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-red-600 text-left" dir="ltr">
                                    {Number((t as any).fees || 0).toLocaleString()}
                                </td>
                                <td className="px-4 py-3 font-black text-emerald-600 text-left" dir="ltr">
                                    {Number((t as any).netAmount || 0).toLocaleString()}
                                </td>
                                <td className="px-4 py-3 text-center print:hidden flex justify-center gap-2">
                                    {getImageUrl(t) && (
                                        <button
                                            onClick={() => window.open(getImageUrl(t), '_blank')}
                                            className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50 transition-colors"
                                            title="فتح صورة الإيصال"
                                        >
                                            <Image className="w-4 h-4" />
                                        </button>
                                    )}
                                    {isAdmin && (
                                        <>
                                            <button
                                                onClick={() => setEditingTransaction(t as any)}
                                                className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition-colors"
                                                title="تعديل"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (confirm('هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع.')) {
                                                        try {
                                                            await api.delete(`/settlements/${t.id}`);
                                                            loadBatch();
                                                        } catch (e) {
                                                            alert('فشل الحذف');
                                                        }
                                                    }
                                                }}
                                                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
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

                {/* Footer */}
                <div className="mt-12 pt-6 border-t border-gray-200 text-center text-gray-400 text-xs">
                    <p>تم استخراج هذا التقرير آلياً من نظام تسوية البطاقات الإلكترونية - شركة سمارت</p>
                    <p className="mt-1" dir="ltr">{new Date().toLocaleString('en-GB')}</p>
                </div>

                <EditSettlementModal
                    isOpen={!!editingTransaction}
                    onClose={() => setEditingTransaction(null)}
                    settlement={editingTransaction}
                    onSave={loadBatch}
                />
            </div>
        </div>
    );
}
