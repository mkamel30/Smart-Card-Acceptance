import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FilePlus, ScrollText, Settings, LogOut, Menu, X, Building2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAdmin } from '../context/AdminContext';
import AdminAuthModal from './AdminAuthModal';
import api from '@/api/client';

function cn(...inputs: any[]) {
    return twMerge(clsx(inputs));
}

export default function Layout({ children }: { children: React.ReactNode }) {
    const location = useLocation();
    const { isAdmin, user, logout } = useAdmin();
    const [isAuthModalOpen, setAuthModalOpen] = useState(false);
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const [branchName, setBranchName] = useState('');
    const [clientInfo, setClientInfo] = useState<any>(null);

    const isMultiBranch = isAdmin || (user?.role === 'BRANCH_MANAGER' && user?.branches && user.branches.length > 1);

    useEffect(() => {
        setBranchName(localStorage.getItem('selectedBranchName') || '');
        api.get('/info').then(res => setClientInfo(res.data)).catch(() => { });
    }, [location]);

    const navItems = [
        { name: 'الرئيسية', path: '/', icon: LayoutDashboard },
        { name: isMultiBranch ? 'إدارة الفروع' : 'لوحة المعلومات', path: '/branch-dashboard', icon: LayoutDashboard },
        { name: 'تسوية جديدة', path: '/settlement/new', icon: FilePlus },
        { name: 'سجل الباتشات', path: '/batches', icon: ScrollText },
    ];

    const closeSidebar = () => setSidebarOpen(false);

    return (
        <div className="flex min-h-screen bg-gray-50 font-sans" dir="rtl">
            <AdminAuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setAuthModalOpen(false)}
            />

            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden user-select-none"
                    onClick={closeSidebar}
                />
            )}

            {/* Sidebar */}
            <aside
                className={cn(
                    "fixed top-0 right-0 h-full w-64 bg-white border-l border-gray-200 z-50 transition-transform duration-300 transform lg:translate-x-0 lg:static",
                    isSidebarOpen ? "translate-x-0" : "translate-x-full"
                )}
            >
                <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200">
                    <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
                        <img src="/logo.png" alt="Logo" className="w-10 h-10 ml-2 object-contain" />
                        <span className="text-xl font-bold">نظام التسويات</span>
                    </Link>
                    <button onClick={closeSidebar} className="lg:hidden text-gray-500">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <nav className="p-4 space-y-2 overflow-y-auto h-[calc(100vh-64px)]">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                onClick={closeSidebar}
                                className={cn(
                                    "flex items-center px-4 py-3 rounded-xl transition-all font-medium",
                                    isActive
                                        ? "bg-primary text-white shadow-lg shadow-primary/25"
                                        : "text-gray-600 hover:bg-gray-50 hover:text-primary"
                                )}
                            >
                                <Icon className="ml-3 w-5 h-5" />
                                <span>{item.name}</span>
                            </Link>
                        );
                    })}
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0">
                <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="lg:hidden p-2 -mr-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <h1 className="text-lg lg:text-xl font-bold text-gray-800 truncate">
                            {navItems.find(i => i.path === location.pathname)?.name || 'النظام'}
                        </h1>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4">
                        {clientInfo && (
                            <div className="hidden lg:flex flex-col items-end text-xs text-gray-400 font-mono leading-tight">
                                <span>{clientInfo.ip}</span>
                                {/* Simple regex to show OS/Browser if possible, or just truncate */}
                                <span className="text-[10px] opacity-75 max-w-[100px] truncate" title={clientInfo.userAgent}>
                                    {/* Simplified User Agent */}
                                    {clientInfo.userAgent?.split(')')[0]?.split('(')[1] || 'Web Client'}
                                </span>
                            </div>
                        )}

                        {branchName && (
                            <div className="hidden sm:flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                                <Building2 className="w-4 h-4 text-gray-400" />
                                <span className="text-sm font-bold text-gray-700">{branchName}</span>
                            </div>
                        )}

                        {isAdmin || user ? (
                            <div className="flex items-center gap-3">
                                {user && (
                                    <span className="text-sm font-bold text-gray-600 hidden md:block">
                                        {user.username}
                                    </span>
                                )}
                                <button
                                    onClick={logout}
                                    className="flex items-center gap-2 text-red-600 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg transition-colors text-sm font-bold whitespace-nowrap"
                                >
                                    <LogOut className="w-4 h-4" />
                                    <span className="hidden sm:inline">تسجيل خروج</span>
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setAuthModalOpen(true)}
                                className="text-gray-400 hover:text-primary transition-colors p-2 rounded-full hover:bg-gray-100 relative group"
                                title="إعدادات المشرف"
                            >
                                <Settings className="w-6 h-6 transform group-hover:rotate-45 transition-transform" />
                            </button>
                        )}
                    </div>
                </header>
                <div className="flex-1 p-4 lg:p-8 overflow-x-hidden">
                    {children}
                </div>
            </main>
        </div>
    );
}
