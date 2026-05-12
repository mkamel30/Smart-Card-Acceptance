import React, { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import api from '@/api/client';

interface EditSettlementModalProps {
    isOpen: boolean;
    onClose: () => void;
    settlement: any;
    onSave: () => void;
}

export default function EditSettlementModal({ isOpen, onClose, settlement, onSave }: EditSettlementModalProps) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<any>({});

    useEffect(() => {
        if (settlement) {
            setFormData({
                merchantCode: settlement.merchantCode,
                merchantName: settlement.merchantName,
                batchNumber: settlement.batchNumber,
                approvalNumber: settlement.approvalNumber,
                settledAmount: settlement.settledAmount,
                fees: settlement.fees,
                settlementDate: settlement.settlementDate ? new Date(settlement.settlementDate).toISOString().slice(0, 10) : '',
                subService: settlement.subService
            });
        }
    }, [settlement]);

    if (!isOpen || !settlement) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.put(`/settlements/${settlement.id}`, {
                ...formData,
                settledAmount: Number(formData.settledAmount),
                fees: Number(formData.fees)
            });
            onSave();
            onClose();
        } catch (error) {
            alert('فشل حفظ التعديلات');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200" dir="rtl">
                <div className="bg-blue-900 text-white p-4 flex justify-between items-center">
                    <h3 className="font-bold">تعديل معاملة</h3>
                    <button onClick={onClose} className="hover:bg-white/10 p-1 rounded-full"><X className="w-5 h-5" /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">كود التاجر</label>
                            <input
                                type="text"
                                value={formData.merchantCode || ''}
                                onChange={e => setFormData({ ...formData, merchantCode: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">اسم التاجر</label>
                            <input
                                type="text"
                                value={formData.merchantName || ''}
                                onChange={e => setFormData({ ...formData, merchantName: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">رقم الباتش</label>
                            <input
                                type="text"
                                value={formData.batchNumber || ''}
                                onChange={e => setFormData({ ...formData, batchNumber: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">رقم الموافقة</label>
                            <input
                                type="text"
                                value={formData.approvalNumber || ''}
                                onChange={e => setFormData({ ...formData, approvalNumber: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">المبلغ (Settled)</label>
                            <input
                                type="number"
                                value={formData.settledAmount || ''}
                                onChange={e => {
                                    const val = Number(e.target.value);
                                    setFormData({ 
                                        ...formData, 
                                        settledAmount: e.target.value,
                                        fees: (Math.round(val * 0.0115 * 100) / 100).toString()
                                    });
                                }}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">الرسوم (Fees)</label>
                            <input
                                type="number"
                                value={formData.fees || ''}
                                onChange={e => setFormData({ ...formData, fees: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
                            <input
                                type="date"
                                value={formData.settlementDate || ''}
                                onChange={e => setFormData({ ...formData, settlementDate: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">الخدمة الفرعية</label>
                            <input
                                type="text"
                                value={formData.subService || ''}
                                onChange={e => setFormData({ ...formData, subService: e.target.value })}
                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 mt-6">
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            حفظ التعديلات
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 bg-gray-100 text-gray-700 py-2 rounded-lg font-bold hover:bg-gray-200 transition-colors"
                        >
                            إلغاء
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
