
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api/client';
import { useAuth } from '@/context/AdminContext';
import { ShieldCheck, User, Lock, Loader2, ArrowRight } from 'lucide-react';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const { login } = useAuth();

    // TEMPORARY: Create admin user
    useEffect(() => {
        api.post('/auth/setup-admin', {})
            .then(res => console.log('Setup result:', res.data))
            .catch(err => console.error('Setup failed:', err));
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await api.post('/auth/login', { username, password });
            login(res.data.token, res.data.user);

            // Auto-set branch context if applicable
            const user = res.data.user;
            if (user.role === 'BRANCH_MANAGER' && user.branches && user.branches.length === 1) {
                localStorage.setItem('selectedBranchId', user.branches[0].id);
                localStorage.setItem('selectedBranchName', user.branches[0].name);
            } else if (user.role === 'ADMIN') {
                localStorage.setItem('selectedBranchName', 'الإدارة العامة');
            }

            navigate('/branch-dashboard');
        } catch (err: any) {
            setError(err.response?.data?.error || 'فشل تسجيل الدخول');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4" dir="rtl">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10 border border-gray-100">
                <div className="text-center mb-10">
                    <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-6 transform rotate-3 hover:rotate-0 transition-transform">
                        <ShieldCheck className="w-10 h-10 text-primary" />
                    </div>
                    <h1 className="text-3xl font-black text-gray-900">تسجيل الدخول</h1>
                    <p className="text-gray-500 mt-3 font-medium">نظام قبول البطاقات الذكية</p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-600 p-4 rounded-2xl mb-6 text-center text-sm font-bold border border-red-100 animate-shake">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700 mr-1 flex items-center gap-1">
                            <User className="w-4 h-4" /> اسم المستخدم
                        </label>
                        <input
                            type="text"
                            className="w-full p-4 rounded-2xl border border-gray-200 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all font-medium"
                            placeholder="username"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700 mr-1 flex items-center gap-1">
                            <Lock className="w-4 h-4" /> كلمة المرور
                        </label>
                        <input
                            type="password"
                            className="w-full p-4 rounded-2xl border border-gray-200 focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all font-medium"
                            placeholder="••••••••"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gray-900 text-white p-4 rounded-2xl font-bold hover:bg-black disabled:opacity-50 transition-all flex items-center justify-center gap-2 group mt-4 shadow-lg active:scale-95"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <span>دخول للنظام</span>
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-[-4px] transition-transform" />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 text-center">
                    <button
                        onClick={() => navigate('/select-branch')}
                        className="text-sm text-gray-400 hover:text-primary transition-colors font-medium border-b border-transparent hover:border-primary"
                    >
                        العودة لاختيار الفرع
                    </button>
                </div>
            </div>
        </div>
    );
}
