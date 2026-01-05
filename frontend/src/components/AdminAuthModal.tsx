import { useState } from 'react';
import { Lock } from 'lucide-react';
import { useAdmin } from '../context/AdminContext';

interface AdminAuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AdminAuthModal({ isOpen, onClose }: AdminAuthModalProps) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);
    const { legacyLogin } = useAdmin();

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (legacyLogin(password)) {
            onClose();
            setPassword('');
            setError(false);
        } else {
            setError(true);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="bg-primary/5 p-6 text-center border-b border-gray-100">
                    <div className="bg-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-gray-100">
                        <Lock className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="font-bold text-gray-900 text-lg">وضع المشرف</h3>
                    <p className="text-gray-500 text-sm">أدخل كلمة المرور للتعديل</p>
                </div>

                <form onSubmit={handleSubmit} className="p-6">
                    {error && (
                        <div className="mb-4 bg-red-50 text-red-600 text-sm p-3 rounded-lg text-center">
                            كلمة المرور غير صحيحة
                        </div>
                    )}

                    <input
                        type="password"
                        value={password}
                        onChange={(e) => {
                            setPassword(e.target.value);
                            setError(false);
                        }}
                        placeholder="كلمة المرور"
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-center tracking-widest"
                        autoFocus
                    />

                    <div className="flex gap-3 mt-6">
                        <button
                            type="submit"
                            className="flex-1 bg-primary text-white py-2 rounded-lg font-bold hover:bg-primary/90 transition-colors"
                        >
                            دخول
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
