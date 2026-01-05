import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FilePlus, ScrollText } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: any[]) {
    return twMerge(clsx(inputs));
}

export default function Layout({ children }: { children: React.ReactNode }) {
    const location = useLocation();

    const navItems = [
        { name: 'لوحة التحكم', path: '/', icon: LayoutDashboard },
        { name: 'تسوية جديدة', path: '/settlement/new', icon: FilePlus },
        { name: 'سجل الباتشات', path: '/batches', icon: ScrollText },
    ];

    return (
        <div className="flex min-h-screen bg-gray-50 font-sans" dir="rtl">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-l border-gray-200">
                <div className="h-16 flex items-center px-6 border-b border-gray-200">
                    <img src="/logo.png" alt="Logo" className="w-10 h-10 ml-2 object-contain" />
                    <span className="text-xl font-bold">نظام التسويات</span>
                </div>
                <nav className="p-4 space-y-2">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={cn(
                                    "flex items-center px-4 py-2 rounded-lg transition-colors",
                                    isActive
                                        ? "bg-primary text-white"
                                        : "text-gray-600 hover:bg-gray-100"
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
            <main className="flex-1">
                <header className="h-16 bg-white border-b border-gray-200 flex items-center px-8">
                    <h1 className="text-xl font-semibold">
                        {navItems.find(i => i.path === location.pathname)?.name || 'النظام'}
                    </h1>
                </header>
                <div className="p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
