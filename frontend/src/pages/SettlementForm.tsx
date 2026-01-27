import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation } from 'react-router-dom';
import api from '@/api/client';
import { Zap, CheckCircle2, Loader2, Plus, Package, Download, Mail, FileSpreadsheet, Printer, Image } from 'lucide-react';

const settlementSchema = z.object({
    settlementDate: z.string().min(1, 'التاريخ مطلوب'),
    merchantCode: z.string().min(1, 'كود المخبز مطلوب'),
    merchantName: z.string().min(1, 'اسم المخبز مطلوب'),
    subService: z.string().min(1, 'نوع الخدمة مطلوب'),
    settledAmount: z.number().positive('المبلغ مطلوب'),
    approvalNumber: z.string().optional(),
    batchNumber: z.string().optional(),
    cardBin: z.string().optional(),
    last4Digits: z.string().length(4, 'يجب إدخال 4 أرقام').optional(),
    // Hidden/Defaulted fields
    serviceCategory: z.string().default('SMART'),
    totalAmount: z.number().optional(),
    fees: z.number().default(0),
    netAmount: z.number().optional(),
    referenceNumber: z.string().optional(),
    bankName: z.string().default('BANQUE MISR'),
});

type SettlementFormValues = z.infer<typeof settlementSchema>;

interface BatchGroup {
    batchNumber: string;
    settlementDate: string;
    transactions: any[];
    totalAmount: number;
    status: string;
    isSettled: boolean;
}

export default function SettlementWorkFlow() {
    const location = useLocation();
    const [activeTab, setActiveTab] = useState<'entry' | 'settle'>('entry');
    const [entryMode, setEntryMode] = useState<'manual' | 'ocr'>('manual');
    const [scanning, setScanning] = useState(false);
    const [settling, setSettling] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [recentSettlements, setRecentSettlements] = useState<any[]>([]);
    const [ocrEngine, setOcrEngine] = useState<string | null>(null);
    const imageOnlyInputRef = useRef<HTMLInputElement>(null);

    const getImageUrl = (s: z.infer<typeof settlementSchema> | any) => {
        const path = s.receipt?.imageUrl || s.receiptImageUrl;
        if (!path) return null;
        const cleanPath = path.replace(/\\/g, '/');
        if (cleanPath.startsWith('http')) return cleanPath;
        return cleanPath.startsWith('/') ? `/api${cleanPath}` : `/api/${cleanPath}`;
    };
    const [batches, setBatches] = useState<BatchGroup[]>([]);

    const { register, handleSubmit, formState: { errors, isSubmitting }, setValue, reset, watch } = useForm<SettlementFormValues>({
        resolver: zodResolver(settlementSchema),
        defaultValues: {
            settlementDate: new Date().toISOString().slice(0, 16),
            serviceCategory: 'SMART',
            bankName: 'BANQUE MISR',
            fees: 0,
        }
    });

    const merchantCodeValue = watch('merchantCode');
    const subServiceValue = watch('subService');

    // Auto-fill Merchant Name with Code if Name is empty or they are typing
    useEffect(() => {
        if (merchantCodeValue) {
            setValue('merchantName', merchantCodeValue);
        }
    }, [merchantCodeValue, setValue]);

    // Auto-set Category based on SubService
    useEffect(() => {
        if (subServiceValue?.includes('فروق') || subServiceValue?.includes('غرامات') || subServiceValue?.includes('الغرامات')) {
            setValue('serviceCategory', 'TAMWEEN');
        } else {
            setValue('serviceCategory', 'SMART');
        }
    }, [subServiceValue, setValue]);

    const settledAmountValue = watch('settledAmount');
    const feesValue = watch('fees');

    // Auto-calculate Fees and Net Amount
    useEffect(() => {
        if (settledAmountValue > 0) {
            const calculatedFees = Math.round(settledAmountValue * 0.0115 * 100) / 100;
            setValue('fees', calculatedFees);
            setValue('netAmount', settledAmountValue + calculatedFees);
        } else {
            setValue('fees', 0);
            setValue('netAmount', 0);
        }
    }, [settledAmountValue, setValue]);

    useEffect(() => {
        fetchRecent();
        // Handle incoming OCR data if navigated from Quick Scan
        const state = location.state as any;
        const ocrData = state?.ocrData;
        if (ocrData) {
            applyOCR(ocrData);
            if (state.imageUrl) setReceiptImageUrl(state.imageUrl);
            // Clear the state to prevent re-applying on refresh
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    const fetchRecent = async () => {
        try {
            const res = await api.get('/settlements?limit=5');
            setRecentSettlements(res.data.data);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchBatches = async () => {
        try {
            const res = await api.get('/settlements/batches');
            setBatches(res.data);
        } catch (e) {
            console.error(e);
        }
    };

    const handleSettleBatch = async (batchNumber: string) => {
        if (!confirm(`هل أنت متأكد من تسوية جميع معاملات الباتش ${batchNumber}؟`)) return;
        setSettling(batchNumber);
        try {
            await api.post(`/settlements/batches/${encodeURIComponent(batchNumber)}/settle`);
            alert(`تم تسوية الباتش ${batchNumber} بنجاح!`);
            fetchBatches();
        } catch (e: any) {
            console.error('Batch Settlement Error:', e);
            const msg = e.response?.data?.message || e.response?.data?.error || 'حدث خطأ أثناء التسوية';
            alert(msg);
        } finally {
            setSettling(null);
        }
    };

    const handleDownloadPDF = (batchNumber: string) => {
        // Open the HTML report page in a new tab
        window.open(`/report/batch/${encodeURIComponent(batchNumber)}`, '_blank');
    };

    const handleDownloadExcel = (batchNumber: string) => {
        window.open(`${api.defaults.baseURL}/exports/batch/${encodeURIComponent(batchNumber)}/excel`, '_blank');
    };

    const handleEmailPDF = (batch: BatchGroup) => {
        const merchantCode = batch.transactions[0]?.merchantCode || '';
        const subject = `تسوية فروق تصنيع_${merchantCode}`;
        const totalNet = Number((batch as any).totalNet || batch.totalAmount + (batch as any).totalFees || 0);
        const totalSettled = Number(batch.totalAmount);
        const totalFees = Number((batch as any).totalFees || 0);

        const body = `السادة الزملاء،\n\nيرجى العلم ببيانات التسوية التالية:\n\nالتاريخ: ${new Date(batch.settlementDate).toLocaleDateString('ar-EG')}\nكود التاجر: ${merchantCode}\nصافي مبلغ الخدمة: ${totalSettled.toLocaleString()} ج.م\nالعمولة (1.15%): ${totalFees.toLocaleString()} ج.م\nالإجمالي: ${totalNet.toLocaleString()} ج.م\nالباتش: ${batch.batchNumber} / الموافقة: ${batch.transactions[0]?.approvalNumber || ''}\n\nمع التحية.`;

        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };

    const handleEmailSingle = (s: any) => {
        const merchantCode = s.merchantCode || '';
        const subject = `تسوية فروق تصنيع_${merchantCode}`;
        const body = `السادة الزملاء،\n\nيرجى العلم ببيانات التسوية التالية:\n\nالتاريخ: ${new Date(s.settlementDate).toLocaleDateString('ar-EG')}\nكود التاجر: ${merchantCode}\nصافي مبلغ الخدمة: ${Number(s.settledAmount).toLocaleString()} ج.م\nالعمولة (1.15%): ${Number(s.fees).toLocaleString()} ج.م\nالإجمالي: ${Number(s.netAmount).toLocaleString()} ج.م\nالباتش: ${s.batchNumber} / الموافقة: ${s.approvalNumber || ''}\n\nمع التحية.`;

        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };

    // Fetch batches when switching to settle tab
    useEffect(() => {
        if (activeTab === 'settle') {
            fetchBatches();
        }
    }, [activeTab]);

    const [receiptImageUrl, setReceiptImageUrl] = useState<string>('');

    const applyOCR = (ocrData: any) => {
        setEntryMode('manual');
        if (ocrData.batchNumber) setValue('batchNumber', ocrData.batchNumber);
        if (ocrData.approvalNumber) setValue('approvalNumber', ocrData.approvalNumber);
        if (ocrData.rrn) setValue('referenceNumber', ocrData.rrn);
        if (ocrData.cardBin) setValue('cardBin', ocrData.cardBin);
        if (ocrData.last4Digits) setValue('last4Digits', ocrData.last4Digits);
        if (ocrData.totalAmount) setValue('settledAmount', ocrData.totalAmount);

        if (ocrData.date) {
            // Robust Date Parsing
            const parts = ocrData.date.split(/[-/.]/);
            let y, m, d;
            if (parts[0].length === 4) { // YYYY-MM-DD
                y = parts[0]; m = parts[1]; d = parts[2];
            } else { // DD-MM-YYYY
                d = parts[0]; m = parts[1]; y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            }
            const tParts = (ocrData.time || '00:00').split(':');
            const hh = (tParts[0] || '00').padStart(2, '0');
            const mm = (tParts[1] || '00').padStart(2, '0');

            // Format for datetime-local: YYYY-MM-DDTHH:MM
            const formatted = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${hh}:${mm}`;
            setValue('settlementDate', formatted);
        }
    };

    const handleOCRUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setScanning(true);
        const formData = new FormData();
        formData.append('receipt', file);
        try {
            const res = await api.post('/ocr/scan', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            applyOCR(res.data.data);
            setOcrEngine(res.data.engine); // Save which engine was used
            if (res.data.imageUrl) setReceiptImageUrl(res.data.imageUrl);
        } catch (err) {
            alert('فشل قراءة الإيصال، يرجى الإدخال يدوياً');
        } finally {
            setScanning(false);
            if (e.target) e.target.value = ''; // Reset input to allow same file scan
        }
    };

    const handleImageOnlyUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setScanning(true);
        const formData = new FormData();
        formData.append('receipt', file);
        try {
            const res = await api.post('/ocr/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.imageUrl) {
                setReceiptImageUrl(res.data.imageUrl);
                alert('تم رفع الصورة بنجاح');
            }
        } catch (err) {
            alert('فشل رفع الصورة');
        } finally {
            setScanning(false);
            if (e.target) e.target.value = '';
        }
    };

    const onSubmit = async (data: SettlementFormValues) => {
        try {
            // Clean data
            const payload = {
                ...data,
                totalAmount: data.settledAmount, // Sync if empty
                netAmount: data.settledAmount,
                referenceNumber: data.referenceNumber || `REF-${Date.now()}`,
                branchId: localStorage.getItem('selectedBranchId') || undefined, // Attach Branch ID
                receiptImageUrl: receiptImageUrl || undefined,
            };
            await api.post('/settlements', payload);
            alert('تم حفظ الإيصال بنجاح');
            // Full reset to default values
            reset({
                settlementDate: new Date().toISOString().slice(0, 16),
                serviceCategory: 'SMART',
                bankName: 'BANQUE MISR',
                fees: 0,
                merchantCode: '',
                merchantName: '',
                subService: '',
                settledAmount: 0,
                approvalNumber: '',
                batchNumber: '',
                last4Digits: '',
                referenceNumber: '',
            });
            setReceiptImageUrl('');
            fetchRecent();
        } catch (err) {
            alert('خطأ أثناء الحفظ');
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 text-right" dir="rtl">
            {/* Main Tabs */}
            <div className="flex bg-white rounded-xl shadow-sm border border-gray-200 p-1">
                <button
                    onClick={() => setActiveTab('entry')}
                    className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-lg font-bold transition-all ${activeTab === 'entry' ? 'bg-primary text-white shadow-md scale-[1.02]' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    <Plus className="w-5 h-5" />
                    إدخال إيصال (جديد)
                </button>
                <button
                    onClick={() => setActiveTab('settle')}
                    className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-lg font-bold transition-all ${activeTab === 'settle' ? 'bg-primary text-white shadow-md scale-[1.02]' : 'text-gray-500 hover:bg-gray-50'}`}
                >
                    <CheckCircle2 className="w-5 h-5" />
                    عمل تسوية (التقرير النهائي)
                </button>
            </div>

            {activeTab === 'entry' ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left: Entry Form */}
                    <div className="lg:col-span-8 bg-white p-4 lg:p-8 rounded-2xl shadow-sm border border-gray-200 order-2 lg:order-1">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                            <h2 className="text-xl font-black text-gray-800">بيانات الإيصال</h2>
                            <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-full sm:w-auto self-end">
                                <button
                                    onClick={() => setEntryMode('manual')}
                                    className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-bold transition-all ${entryMode === 'manual' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
                                >
                                    إدخال يدوي
                                </button>
                                <button
                                    onClick={() => imageOnlyInputRef.current?.click()}
                                    className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-bold transition-all text-gray-500 hover:bg-gray-200`}
                                >
                                    <Image className="w-4 h-4 inline ml-1" />
                                    {receiptImageUrl ? 'تغيير الصورة' : 'إرفاق صورة'}
                                </button>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`flex-1 sm:flex-none px-4 py-1.5 rounded-md text-sm font-bold transition-all ${scanning ? 'bg-primary text-white animate-pulse' : 'text-gray-500 hover:bg-gray-200'}`}
                                >
                                    {scanning ? <Loader2 className="w-4 h-4 animate-spin inline ml-1" /> : <Zap className="w-4 h-4 inline ml-1" />}
                                    مسح OCR
                                    {ocrEngine && !scanning && (
                                        <span className="mr-2 px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] rounded border border-blue-100 animate-fade-in">
                                            بواسطة: {ocrEngine === 'OCR.space' ? 'محرك أساسي ⚡' : 'محرك احتياطي 🔧'}
                                        </span>
                                    )}
                                </button>
                            </div>
                            <input type="file" ref={fileInputRef} onChange={handleOCRUpload} className="hidden" accept="image/*" />
                            <input type="file" ref={imageOnlyInputRef} onChange={handleImageOnlyUpload} className="hidden" accept="image/*" />
                        </div>

                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div>
                                    <label className="label-sm">التاريخ</label>
                                    <input type="datetime-local" {...register('settlementDate')} className="input w-full" />
                                </div>
                                <div>
                                    <label className="label-sm">كود المخبز / التاجر</label>
                                    <input type="text" {...register('merchantCode')} className="input w-full" placeholder="مثلاً: 4897..." />
                                    {errors.merchantCode && <p className="error-text">{errors.merchantCode.message}</p>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div>
                                    <label className="label-sm">اسم المخبز / التاجر</label>
                                    <input type="text" {...register('merchantName')} className="input w-full" placeholder="ادخل الاسم هنا" />
                                    {errors.merchantName && <p className="error-text">{errors.merchantName.message}</p>}
                                </div>
                                <div>
                                    <label className="label-sm">نوع الخدمة</label>
                                    <select {...register('subService')} className="input w-full">
                                        <option value="">-- اختار نوع الخدمة --</option>
                                        <option value="سداد قطع الغيار و مصاريف الصيانة">سداد قطع الغيار و مصاريف الصيانة</option>
                                        <option value="سداد قيمة مبيعات الماكينات">سداد قيمة مبيعات الماكينات</option>
                                        <option value="سداد اقساط المرابحة">سداد اقساط المرابحة</option>
                                        <option value="سداد مقدم قسط">سداد مقدم قسط</option>
                                        <option value="سداد قيمة شريحة بيانات">سداد قيمة شريحة بيانات</option>
                                        <option value="سداد فروق التصنيع">سداد فروق التصنيع</option>
                                        <option value="الغرامات (المخابز و التجار)">الغرامات (المخابز و التجار)</option>
                                    </select>
                                    {errors.subService && <p className="error-text">{errors.subService.message}</p>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-t pt-6">
                                <div>
                                    <label className="label-sm">المبلغ المسدد</label>
                                    <div className="relative">
                                        <input type="number" step="0.01" {...register('settledAmount', { valueAsNumber: true })} className="input text-2xl font-black text-primary w-full pl-12" />
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">ج.م</span>
                                    </div>
                                    <div className="flex justify-between mt-1 px-1">
                                        <span className="text-[10px] text-gray-400">الربح (1.15%): <b className="text-red-400">{feesValue.toLocaleString()} ج.م</b></span>
                                        <span className="text-[10px] text-gray-400">الإجمالي (شامل الربح): <b className="text-emerald-500">{(Number(settledAmountValue) + Number(feesValue) || 0).toLocaleString()} ج.م</b></span>
                                    </div>
                                    {errors.settledAmount && <p className="error-text">{errors.settledAmount.message}</p>}
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="label-sm">رقم الباتش</label>
                                        <input type="text" {...register('batchNumber')} className="input w-full" />
                                    </div>
                                    <div>
                                        <label className="label-sm">رقم الموافقة</label>
                                        <input type="text" {...register('approvalNumber')} className="input w-full" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="label-sm">أول 6 أرقام (BIN)</label>
                                        <input type="text" maxLength={6} {...register('cardBin')} className="input font-mono text-center tracking-widest text-lg w-full" placeholder="XXXXXX" />
                                    </div>
                                    <div>
                                        <label className="label-sm">آخر 4 أرقام</label>
                                        <input type="text" maxLength={4} {...register('last4Digits')} className="input font-mono text-center tracking-widest text-lg w-full" placeholder="XXXX" />
                                    </div>
                                    {errors.last4Digits && <p className="error-text col-span-2">{errors.last4Digits.message}</p>}
                                </div>
                                <div className="flex items-end">
                                    <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-4 text-lg font-black shadow-lg shadow-primary/20">
                                        {isSubmitting ? 'جاري الحفظ...' : 'حفظ الإيصال + إضافة جديد'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>

                    {/* Right: Recent Stats/Info */}
                    <div className="lg:col-span-4 space-y-6 order-1 lg:order-2">
                        <div className="bg-gray-900 text-white p-6 rounded-2xl shadow-xl">
                            <h3 className="font-bold mb-4 opacity-70">آخر الإيصالات المضافة</h3>
                            <div className="space-y-4">
                                {recentSettlements.map((s, i) => (
                                    <div key={i} className="flex justify-between items-center border-b border-white/10 pb-3 last:border-0">
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-1.5">
                                                {getImageUrl(s) && (
                                                    <button
                                                        onClick={() => window.open(getImageUrl(s), '_blank')}
                                                        className="p-1.5 bg-white/5 hover:bg-white/10 rounded text-primary-light transition-colors"
                                                        title="معاينة الصورة"
                                                    >
                                                        <Image className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleEmailSingle(s)}
                                                    className="p-1.5 bg-white/5 hover:bg-white/10 rounded text-primary-light transition-colors"
                                                    title="إرسال بريد"
                                                >
                                                    <Mail className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold truncate max-w-[120px]">{s.merchantName || 'تاجر غير مسمى'}</p>
                                                <p className="text-[10px] opacity-50">{new Date(s.settlementDate).toLocaleString('ar-EG')}</p>
                                            </div>
                                        </div>
                                        <p className="font-black text-primary-light whitespace-nowrap">{Number(s.settledAmount).toLocaleString()} ج.م</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="bg-primary/5 border border-primary/20 p-6 rounded-2xl">
                            <p className="text-sm text-primary font-bold mb-1">تعليمات:</p>
                            <p className="text-xs text-gray-600 leading-relaxed">
                                يمكنك استخدام المسح الضوئي (OCR) لإيصالات بنك مصر ليقوم النظام بملء التاريخ والباتش والموافقة والمبالغ تلقائياً.
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                /* Tab 2: Settle / Report View */
                <div className="space-y-4">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 lg:p-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                            <div>
                                <h2 className="text-xl font-bold">تسوية الباتشات</h2>
                                <p className="text-sm text-gray-500">المعاملات مجمعة حسب رقم الباتش</p>
                            </div>
                            <div className="flex gap-2 text-xs">
                                <span className="flex items-center gap-1 text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full">
                                    <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                                    معلقة
                                </span>
                                <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full">
                                    <span className="w-2 h-2 rounded-full bg-green-400"></span>
                                    تمت التسوية
                                </span>
                            </div>
                        </div>

                        {batches.length === 0 ? (
                            <p className="text-center text-gray-400 py-10">لا توجد معاملات بعد</p>
                        ) : (
                            <div className="space-y-4">
                                {batches.map((batch) => (
                                    <div
                                        key={batch.batchNumber}
                                        className={`border rounded-xl overflow-hidden ${batch.isSettled ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}
                                    >
                                        <div className={`p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${batch.isSettled ? 'bg-green-100' : 'bg-gray-50'}`}>
                                            <div className="flex items-center gap-3">
                                                <div className={`p-2 rounded-lg ${batch.isSettled ? 'bg-green-200 text-green-700' : 'bg-white border border-gray-200 text-primary'}`}>
                                                    <Package className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-lg">باتش #{batch.batchNumber}</p>
                                                    <p className="text-xs text-gray-500">
                                                        {batch.transactions.length} معاملة | {new Date(batch.settlementDate).toLocaleDateString('ar-EG')}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full lg:w-auto">
                                                <p className="text-xl font-black text-primary text-left sm:text-right">
                                                    {batch.totalAmount.toLocaleString()} ج.م
                                                </p>

                                                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto">
                                                    {batch.isSettled ? (
                                                        <span className="col-span-2 sm:w-auto bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                                                            <CheckCircle2 className="w-4 h-4" />
                                                            تمت التسوية
                                                        </span>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => handleDownloadPDF(batch.batchNumber)}
                                                                className="btn-secondary px-3 py-2 text-sm flex items-center justify-center gap-1"
                                                                title="تحميل تقرير PDF"
                                                            >
                                                                <Download className="w-4 h-4" />
                                                                <span className="sm:hidden">PDF</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDownloadExcel(batch.batchNumber)}
                                                                className="btn-secondary px-3 py-2 text-sm flex items-center justify-center gap-1 text-green-700 bg-green-50 hover:bg-green-100 border-green-200"
                                                                title="تحميل تقرير Excel"
                                                            >
                                                                <FileSpreadsheet className="w-4 h-4" />
                                                                <span className="sm:hidden">Excel</span>
                                                            </button>
                                                            <button
                                                                onClick={() => handleEmailPDF(batch)}
                                                                className="btn-secondary px-3 py-2 text-sm flex items-center justify-center gap-1"
                                                                title="إرسال التقرير بالبريد"
                                                            >
                                                                <Mail className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleSettleBatch(batch.batchNumber)}
                                                                disabled={settling === batch.batchNumber}
                                                                className="col-span-2 sm:w-auto btn-primary px-4 py-2 text-sm flex items-center justify-center gap-2"
                                                                title="تنفيذ التسوية النهائية"
                                                            >
                                                                {settling === batch.batchNumber ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                                                تسوية
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="divide-y divide-gray-100 bg-white">
                                            {batch.transactions.map((t: any, idx: number) => (
                                                <div key={t.id} className="p-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-gray-50 transition-colors">
                                                    <div className="flex items-start gap-3">
                                                        <span className="text-gray-400 text-sm mt-0.5 w-6">{idx + 1}</span>
                                                        {getImageUrl(t) && (
                                                            <button
                                                                onClick={() => window.open(getImageUrl(t), '_blank')}
                                                                className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-primary transition-colors"
                                                                title="معاينة صورة الإيصال"
                                                            >
                                                                <Image className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <div>
                                                            <p className="font-bold text-sm text-gray-800">{t.merchantName || t.merchantCode}</p>
                                                            <p className="text-xs text-gray-500 line-clamp-1">{t.subService}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-6 text-sm bg-gray-50 sm:bg-transparent p-2 sm:p-0 rounded-lg">
                                                        <span className="text-gray-500 text-xs">#{t.approvalNumber}</span>
                                                        <span className="text-gray-500 font-mono text-xs">**** {t.last4Digits}</span>
                                                        <span className="font-bold text-primary">{Number(t.settledAmount).toLocaleString()}</span>
                                                        <button
                                                            onClick={() => handleEmailSingle(t)}
                                                            className="text-gray-400 hover:text-primary transition-colors p-1"
                                                            title="إرسال بريد"
                                                        >
                                                            <Mail className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => window.open(`/settlement/${t.id}/print`, '_blank')}
                                                            className="text-gray-400 hover:text-blue-600 transition-colors p-1"
                                                            title="طباعة الإيصال"
                                                        >
                                                            <Printer className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
