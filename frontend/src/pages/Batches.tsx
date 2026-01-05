import { useState, useEffect } from 'react';
import api from '@/api/client';
import { FileText, Eye, CheckCircle, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';

interface BatchSummary {
    batchNumber: string;
    settlementDate: string;
    transactions: any[];
    totalAmount: number;
    isSettled: boolean;
    status: string;
}

export default function Batches() {
    const [batches, setBatches] = useState<BatchSummary[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchBatches();
    }, []);

    const fetchBatches = async () => {
        try {
            const res = await api.get('/settlements/batches');
            setBatches(res.data);
        } catch (error) {
            console.error('Failed to fetch batches:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <FileText className="w-8 h-8 text-blue-600" />
                    سجل الباتشات
                </h2>
                <p className="text-gray-500 mt-1">عرض جميع الباتشات وحالتها (تمت التسوية / معلق)</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-right" dir="rtl">
                    <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold">
                        <tr>
                            <th className="px-6 py-4">رقم الباتش</th>
                            <th className="px-6 py-4">تاريخ المعاملات</th>
                            <th className="px-6 py-4">عدد المعاملات</th>
                            <th className="px-6 py-4">إجمالي المبلغ</th>
                            <th className="px-6 py-4">الحالة</th>
                            <th className="px-6 py-4 text-left">الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">جاري التحميل...</td></tr>
                        ) : batches.length === 0 ? (
                            <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500 italic">لا توجد باتشات مسجلة</td></tr>
                        ) : batches.map((batch) => (
                            <tr key={batch.batchNumber} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 font-bold font-mono text-lg text-blue-600">
                                    #{batch.batchNumber || 'N/A'}
                                </td>
                                <td className="px-6 py-4 text-sm">
                                    {new Date(batch.settlementDate).toLocaleDateString('ar-EG')}
                                </td>
                                <td className="px-6 py-4 font-bold text-gray-700">
                                    {batch.transactions.length}
                                </td>
                                <td className="px-6 py-4 font-bold text-gray-900">
                                    {batch.totalAmount.toLocaleString()} ج.م
                                </td>
                                <td className="px-6 py-4">
                                    {batch.isSettled ? (
                                        <span className="flex items-center gap-1 text-green-700 bg-green-100 px-3 py-1 rounded-full text-xs font-bold w-fit">
                                            <CheckCircle className="w-3 h-3" />
                                            تمت التسوية
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-yellow-700 bg-yellow-100 px-3 py-1 rounded-full text-xs font-bold w-fit">
                                            <Clock className="w-3 h-3" />
                                            معلق
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-left">
                                    <Link
                                        to={`/report/batch/${batch.batchNumber}`}
                                        target="_blank"
                                        className="text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg text-sm font-bold inline-flex items-center gap-2 transition-colors"
                                    >
                                        <Eye className="w-4 h-4" />
                                        عرض التفاصيل
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
