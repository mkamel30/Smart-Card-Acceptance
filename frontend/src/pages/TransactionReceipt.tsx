import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api from '@/api/client';
import { Printer, ArrowRight, Loader2, Upload } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';

interface Settlement {
    id: string;
    merchantCode: string;
    merchantName?: string;
    subService: string;
    serviceCategory: string;
    settlementDate: string;
    netAmount: number;
    customerName?: string;
    customerPhone?: string;
    receipt?: {
        imageUrl: string;
    };
}

export default function TransactionReceipt() {
    const { id } = useParams();
    const [settlement, setSettlement] = useState<Settlement | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [branchName, setBranchName] = useState('');
    const componentRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handlePrint = useReactToPrint({
        content: () => componentRef.current,
        documentTitle: `Receipt_${id}`,
    });

    const fetchSettlement = async () => {
        try {
            const res = await api.get(`/settlements/${id}`);
            setSettlement(res.data);
        } catch (error) {
            console.error(error);
            try {
                const res = await api.get('/settlements');
                const found = res.data.data.find((s: any) => s.id === id);
                if (found) setSettlement(found);
            } catch (e) {
                alert('فشل تحميل بيانات المعاملة');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettlement();
    }, [id]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0] || !id) return;

        const file = e.target.files[0];
        const formData = new FormData();
        formData.append('receipt', file);

        setUploading(true);
        try {
            await api.post(`/receipts/${id}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            await fetchSettlement(); // Reload to get new image URL
        } catch (err) {
            alert('فشل رفع الصورة');
        } finally {
            setUploading(false);
        }
    };

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin w-8 h-8" /></div>;
    if (!settlement) return <div className="h-screen flex items-center justify-center">المعاملة غير موجودة</div>;

    // Construct Image URL
    let imageUrl = null;
    if (settlement.receipt?.imageUrl) {
        const cleanPath = settlement.receipt.imageUrl.replace(/\\/g, '/');
        if (cleanPath.startsWith('http')) {
            imageUrl = cleanPath;
        } else {
            // Fixed: Prepend /api to match new server route
            imageUrl = cleanPath.startsWith('/') ? `/api${cleanPath}` : `/api/${cleanPath}`;
        }
    }

    return (
        <div className="min-h-screen bg-gray-100 p-8 print:p-0 print:bg-white font-sans text-right" dir="rtl">
            {/* Toolbar */}
            <div className="max-w-[210mm] mx-auto mb-6 flex justify-between items-center print:hidden">
                <button
                    onClick={() => window.close()}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                >
                    <ArrowRight className="w-5 h-5" />
                    إغلاق
                </button>
                <div className="flex gap-4 items-center">
                    <input
                        type="text"
                        placeholder="أدخل اسم الفرع هنا للطباعة"
                        value={branchName}
                        onChange={(e) => setBranchName(e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg w-64 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <button
                        onClick={handlePrint}
                        className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 font-bold shadow-sm"
                    >
                        <Printer className="w-5 h-5" />
                        طباعة
                    </button>
                </div>
            </div>

            {/* Hidden Input */}
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileUpload}
            />

            {/* Receipt Container */}
            <div ref={componentRef} className="max-w-[210mm] mx-auto bg-white p-[10mm] shadow-xl print:shadow-none print:w-full min-h-[140mm]">

                {/* Header: Logo & Branch */}
                <div className="flex justify-between items-end mb-8">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">الفرع :</span>
                        <div className="border-b-2 border-dotted border-gray-400 min-w-[200px] text-center font-serif text-xl px-2">
                            {branchName}
                        </div>
                    </div>
                    <img src="/logo.png" alt="Company Logo" className="h-16 object-contain" />
                </div>

                {/* Body: Image & Table Grid */}
                <div className="flex border-2 border-black h-[140mm]">

                    {/* Right: Data Table - 55% width approx - FIRST in DOM for RTL (Right Side) */}
                    <div className="w-[55%] flex flex-col border-l-2 border-black">

                        {/* Row 1: Service Type */}
                        <div className="flex border-b border-black h-[12.5%]">
                            <div className="w-32 bg-gray-50 font-bold p-2 border-l border-black flex items-center">نوع الخدمة</div>
                            <div className="flex-1 p-2 flex items-center font-mono text-lg font-semibold">{settlement.subService || settlement.serviceCategory}</div>
                        </div>

                        {/* Row 2: Merchant Code */}
                        <div className="flex border-b border-black h-[12.5%]">
                            <div className="w-32 bg-gray-50 font-bold p-2 border-l border-black flex items-center">كود (المخبز / التاجر)</div>
                            <div className="flex-1 p-2 flex items-center font-mono text-xl">{settlement.merchantCode}</div>
                        </div>

                        {/* Row 3: Net Amount */}
                        <div className="flex border-b border-black h-[12.5%]">
                            <div className="w-32 bg-gray-50 font-bold p-2 border-l border-black flex items-center">صافي مبلغ الخدمة</div>
                            <div className="flex-1 p-2 flex items-center font-bold text-lg">{Number(settlement.netAmount).toLocaleString()} ج.م</div>
                        </div>

                        {/* Row 4: Date */}
                        <div className="flex border-b border-black h-[12.5%]">
                            <div className="w-32 bg-gray-50 font-bold p-2 border-l border-black flex items-center">التاريخ</div>
                            <div className="flex-1 p-2 flex items-center font-mono">{new Date(settlement.settlementDate).toLocaleDateString('ar-EG')}</div>
                        </div>

                        {/* Row 5: Customer Name */}
                        <div className="flex border-b border-black h-[12.5%]">
                            <div className="w-32 bg-gray-50 font-bold p-2 border-l border-black flex items-center">الاسم</div>
                            <div className="flex-1 p-2 flex items-center">{settlement.customerName || settlement.merchantName || ''}</div>
                        </div>

                        {/* Row 6: Phone */}
                        <div className="flex border-b border-black h-[12.5%]">
                            <div className="w-32 bg-gray-50 font-bold p-2 border-l border-black flex items-center">رقم هاتف العميل</div>
                            <div className="flex-1 p-2 flex items-center font-mono">{settlement.customerPhone || ''}</div>
                        </div>

                        {/* Row 7: Signature */}
                        <div className="flex border-b border-black h-[12.5%]">
                            <div className="w-32 bg-gray-50 font-bold p-2 border-l border-black flex items-center">التوقيع</div>
                            <div className="flex-1 p-2"></div>
                        </div>

                        {/* Row 8: Branch Stamp */}
                        <div className="flex h-[12.5%]">
                            <div className="w-32 bg-gray-50 font-bold p-2 border-l border-black flex items-center">ختم الفرع</div>
                            <div className="flex-1 p-2"></div>
                        </div>

                    </div>

                    {/* Left: Receipt Image Box - 45% width approx - SECOND in DOM for RTL (Left Side) */}
                    <div className="w-[45%] flex flex-col relative group">
                        <div className="text-center font-bold border-b-2 border-black p-2 bg-gray-50 flex justify-between items-center px-4">
                            {/* Browse Button - Visible on Hover or Always if no image, Hidden in Print */}
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="print:hidden text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded hover:bg-blue-100 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <Upload className="w-3 h-3" />
                                تغيير
                            </button>
                            <span>صورة الايصال</span>
                            <div className="w-8"></div> {/* Spacer for centering */}
                        </div>
                        <div
                            className="flex-1 p-2 flex items-center justify-center overflow-hidden bg-gray-50/30 cursor-pointer relative"
                            onClick={() => fileInputRef.current?.click()}
                            title="اضغط لتغيير الصورة"
                        >
                            {uploading ? (
                                <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                                </div>
                            ) : null}

                            {imageUrl ? (
                                <img
                                    src={imageUrl}
                                    alt="Receipt"
                                    className="max-w-full max-h-full object-contain transform -rotate-90 md:rotate-0 print:rotate-0"
                                />
                            ) : (
                                <div className="flex flex-col items-center gap-2 text-gray-400">
                                    <Upload className="w-8 h-8 opacity-20" />
                                    <span className="italic">لا توجد صورة</span>
                                    <span className="text-xs print:hidden underline">اضغط للرفع</span>
                                </div>
                            )}
                        </div>
                    </div>

                </div>

                {/* Footer Note */}
                <div className="mt-8 text-center font-bold text-sm">
                    ملحوظه ، يتم تسليم اصل النموذج مرفقا به اصل الأيصال الي العميل و نسخه ضوئيه يحتفظ الفرع بها للتسوية
                </div>

            </div>
        </div>
    );
}
