import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api/client';
import { Building2, Plus, ShieldCheck, Loader2 } from 'lucide-react';

interface Branch {
    id: string;
    name: string;
    code?: string;
}

export default function SelectBranch() {
    const navigate = useNavigate();
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Admin Mode
    const [showAdmin, setShowAdmin] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [newBranchName, setNewBranchName] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        fetchBranches();
    }, []);

    const fetchBranches = async () => {
        try {
            const res = await api.get('/branches');
            setBranches(res.data);
        } catch (err) {
            setError('فشل تحميل الفروع');
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (branch: Branch) => {
        // Save to LocalStorage
        localStorage.setItem('selectedBranchId', branch.id);
        localStorage.setItem('selectedBranchName', branch.name);

        // Force reload to apply API interceptors or just navigate
        // Better to reload to ensure all states are clean
        window.location.href = '/';
    };

    const handleAdminLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        try {
            await api.post('/branches', { name: newBranchName }, {
                headers: { 'x-admin-password': adminPassword }
            });
            alert('تم إضافة الفرع بنجاح');
            setNewBranchName('');
            setAdminPassword('');
            setShowAdmin(false);
            fetchBranches();
        } catch (err: any) {
            alert(err.response?.data?.error || 'فشل إضافة الفرع - تأكد من كلمة المرور');
        } finally {
            setCreating(false);
        }
    };

    if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Building2 className="w-8 h-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-black text-gray-900">نظام تسوية البطاقات</h1>
                    <p className="text-gray-500 mt-2">يرجى اختيار الفرع للمتابعة</p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6 text-center text-sm font-bold">
                        {error}
                        <button onClick={fetchBranches} className="block mx-auto mt-2 text-primary underline">محاولة مرة أخرى</button>
                    </div>
                )}

                <div className="space-y-3">
                    {branches.map(branch => (
                        <button
                            key={branch.id}
                            onClick={() => handleSelect(branch)}
                            className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:border-primary hover:bg-primary/5 transition-all group"
                        >
                            <span className="font-bold text-lg text-gray-700 group-hover:text-primary">{branch.name}</span>
                            <div className="w-8 h-8 rounded-full bg-gray-100 group-hover:bg-primary group-hover:text-white flex items-center justify-center transition-colors">
                                <Plus className="w-4 h-4 rotate-45 group-hover:rotate-0 transition-transform" />
                            </div>
                        </button>
                    ))}

                    {branches.length === 0 && !loading && !error && (
                        <p className="text-center text-gray-400 py-4">لا توجد فروع متاحة</p>
                    )}
                </div>

                <div className="mt-8 pt-6 border-t border-gray-100">
                    {!showAdmin ? (
                        <button
                            onClick={() => setShowAdmin(true)}
                            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mx-auto"
                        >
                            <ShieldCheck className="w-3 h-3" />
                            إدارة الفروع (Admin)
                        </button>
                    ) : (
                        <form onSubmit={handleAdminLogin} className="space-y-4 animate-in fade-in slide-in-from-top-2">
                            <h3 className="font-bold text-center text-gray-800">إضافة فرع جديد</h3>
                            <input
                                type="password"
                                placeholder="كلمة المرور (Admin)"
                                className="w-full p-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                                value={adminPassword}
                                onChange={e => setAdminPassword(e.target.value)}
                                autoFocus
                            />
                            <input
                                type="text"
                                placeholder="اسم الفرع الجديد"
                                className="w-full p-3 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                                value={newBranchName}
                                onChange={e => setNewBranchName(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAdmin(false)}
                                    className="flex-1 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg"
                                >
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="flex-1 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                                >
                                    {creating ? 'جاري الإضافة...' : 'إضافة'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
