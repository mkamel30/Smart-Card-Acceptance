import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, ArrowRight, Trash2, Edit2 } from 'lucide-react';
import { useAdmin } from '@/context/AdminContext';
import EditSettlementModal from '@/components/EditSettlementModal';

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
    const { isAdmin } = useAdmin();
    const [batch, setBatch] = useState<BatchData | null>(null);
    const [editingTransaction, setEditingTransaction] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchBatch = async () => {
            try {
                const res = await api.get('/settlements/batches');
                const found = res.data.find((b: any) => b.batchNumber === batchNumber);
                setBatch(found);
            } catch (error) {
                console.error(error);
                alert('فشل تحميل بيانات الباتش');
            } finally {
                setLoading(false);
            }
        };
        fetchBatch();
    }, [batchNumber]);

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
                <button
                    onClick={() => window.print()}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 font-bold shadow-sm"
                >
                    <Printer className="w-5 h-5" />
                    طباعة / حفظ PDF
                </button>
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

                {/* Meta Data Box */}
                <div className="bg-gray-50 rounded-xl p-6 mb-8 flex justify-between items-center border border-gray-100">
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
                        <p className="text-sm text-gray-500 mb-1">إجمالي المبلغ</p>
                        <p className="text-2xl font-black text-blue-600">
                            {batch.totalAmount.toLocaleString()} ج.م
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
                            <th className="px-4 py-3 rounded-tr-lg">م</th>
                            <th className="px-4 py-3">كود التاجر</th>
                            <th className="px-4 py-3">اسم التاجر</th>
                            <th className="px-4 py-3">الخدمة</th>
                            <th className="px-4 py-3">رقم الموافقة</th>
                            <th className="px-4 py-3 text-left">المبلغ</th>
                            {isAdmin && <th className="px-4 py-3 rounded-tl-lg text-center print:hidden">إجراءات</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {batch.transactions.map((t, idx) => (
                            <tr key={t.id} className="even:bg-gray-50">
                                <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                                <td className="px-4 py-3 font-mono">{t.merchantCode}</td>
                                <td className="px-4 py-3">{t.merchantName || '-'}</td>
                                <td className="px-4 py-3 text-gray-600">{t.subService}</td>
                                <td className="px-4 py-3 font-mono text-gray-500">{t.approvalNumber}</td>
                                <td className="px-4 py-3 font-bold text-left" dir="ltr">
                                    {Number(t.settledAmount).toLocaleString()}
                                </td>
                                {isAdmin && (
                                    <td className="px-4 py-3 text-center print:hidden flex justify-center gap-2">
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
                                                        setBatch(prev => prev ? {
                                                            ...prev,
                                                            transactions: prev.transactions.filter(tr => tr.id !== t.id),
                                                            totalAmount: prev.totalAmount - Number(t.settledAmount)
                                                        } : null);
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
                                    </td>
                                )}
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
                    onSave={() => {
                        // Reload batch
                        api.get('/settlements/batches').then(res => {
                            const found = res.data.find((b: any) => b.batchNumber === batchNumber);
                            setBatch(found);
                        });
                    }}
                />
            </div>
        </div>
    );
}
