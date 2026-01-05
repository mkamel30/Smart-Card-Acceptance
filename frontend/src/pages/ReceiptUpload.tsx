import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useParams, useNavigate } from 'react-router-dom';
import { Upload, X, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import api from '@/api/client';
import { useReceipt } from '@/hooks/useReceipt';

export default function ReceiptUpload() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    // Use Client-Side OCR Hook
    const { processReceipt, data: extractedData, loading: processing, progress } = useReceipt() as any; // Cast if setData is not exposed (I need to check hook)

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const droppedFile = acceptedFiles[0];
        if (droppedFile) {
            setFile(droppedFile);
            setPreview(URL.createObjectURL(droppedFile));
            // Start OCR immediately upon drop
            processReceipt(droppedFile);
        }
    }, [processReceipt]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': [] },
        multiple: false,
    });

    const handleUpload = async () => {
        if (!file || !id) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('receipt', file);

        // Send the extracted data to the backend to skip server-side OCR
        if (extractedData) {
            formData.append('ocrData', JSON.stringify(extractedData));
        }

        try {
            await api.post(`/receipts/${id}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            navigate('/'); // Or navigate to next step
        } catch (error) {
            alert('فشل حفظ الوصول');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 text-right" dir="rtl">
            <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-2xl font-bold mb-2">تحميل الوصول</h2>
                <p className="text-gray-500 mb-6">سيتم معالجة الوصول تلقائياً على جهازك لسرعة أكبر</p>

                {!preview ? (
                    <div
                        {...getRootProps()}
                        className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer transition-colors ${isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary'
                            }`}
                    >
                        <input {...getInputProps()} />
                        <Upload className="w-12 h-12 text-gray-400 mb-4" />
                        <p className="text-lg font-medium">اسحب صورة الوصول هنا</p>
                        <p className="text-sm text-gray-500">أو اضغط لاختيار ملف من جهازك</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="relative rounded-xl overflow-hidden border border-gray-200">
                            <button
                                onClick={() => { setFile(null); setPreview(null); }}
                                className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 z-10"
                            >
                                <X className="w-4 h-4" />
                            </button>
                            <img src={preview} alt="Preview" className="w-full h-auto max-h-96 object-contain bg-gray-50" />
                        </div>

                        {/* Processing State */}
                        {processing && (
                            <div className="bg-blue-50 border border-blue-200 p-6 rounded-xl text-center space-y-3">
                                <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                                <h3 className="font-bold text-blue-800">جاري قراءة البيانات...</h3>
                                <div className="w-full bg-blue-200 rounded-full h-2.5">
                                    <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                                </div>
                                <p className="text-sm text-blue-600">{progress}% مكتمل</p>
                            </div>
                        )}

                        {/* Success State */}
                        {extractedData && !processing && (
                            <div className="bg-green-50 border border-green-200 p-6 rounded-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <h3 className="font-bold text-green-800 mb-4 flex items-center gap-2 text-lg">
                                    <CheckCircle2 className="w-6 h-6" />
                                    تم القراءة بنجاح
                                </h3>

                                <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                                    <div className="space-y-1">
                                        <span className="text-gray-500 block">كود التاجر / المخبز:</span>
                                        <p className="font-bold text-gray-900 bg-white/50 p-2 rounded border border-green-100">{extractedData.merchantCode || '---'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-gray-500 block">رقم الموافقة (Approval):</span>
                                        <p className="font-bold text-gray-900 bg-white/50 p-2 rounded border border-green-100">{extractedData.approvalNumber || '---'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-gray-500 block">رقم الباتش (Batch):</span>
                                        <p className="font-bold text-gray-900 bg-white/50 p-2 rounded border border-green-100">{extractedData.batchNumber || '---'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-gray-500 block">المبلغ المستخرج:</span>
                                        <p className="font-bold text-green-700 bg-white/50 p-2 rounded border border-green-100">
                                            {extractedData.totalAmount?.toLocaleString() || '---'} ج.م
                                        </p>
                                    </div>
                                    <div className="col-span-2 space-y-1">
                                        <span className="text-gray-500 block">الرقم المرجعي (RRN):</span>
                                        <p className="font-mono text-gray-700 bg-white/50 p-2 rounded border border-green-100">{extractedData.rrn || '---'}</p>
                                    </div>
                                </div>

                                <div className="mt-8 space-y-3">
                                    <button
                                        onClick={handleUpload}
                                        disabled={uploading}
                                        className="w-full py-4 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 shadow-lg shadow-green-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {uploading ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                جاري الحفظ...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 className="w-5 h-5" />
                                                تأكيد وحفظ الوصول
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Error State or Retry */}
                        {!processing && !extractedData && file && (
                            <button
                                onClick={() => processReceipt(file)}
                                className="w-full py-3 text-primary bg-primary/5 hover:bg-primary/10 rounded-lg flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-4 h-4" />
                                إعادة المحاولة
                            </button>
                        )}
                    </div>
                )}
            </div>

            <button onClick={() => navigate('/')} className="text-primary hover:underline text-sm font-medium">
                تخطي هذه الخطوة والعودة للوحة التحكم
            </button>
        </div>
    );
}
