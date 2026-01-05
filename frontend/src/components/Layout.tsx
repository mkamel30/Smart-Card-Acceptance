import api from '@/api/client';
// ... existing imports ...

// ... inside Layout
const [clientInfo, setClientInfo] = useState<any>(null);

useEffect(() => {
    setBranchName(localStorage.getItem('selectedBranchName') || '');
    api.get('/info').then(res => setClientInfo(res.data)).catch(() => { });
}, [location]);

// ... in Header render ...
{
    clientInfo && (
        <div className="hidden lg:flex flex-col items-end text-xs text-gray-400 font-mono leading-tight">
            <span>{clientInfo.ip}</span>
            {/* Simple regex to show OS/Browser if possible, or just truncate */}
            <span className="text-[10px] opacity-75 max-w-[100px] truncate" title={clientInfo.userAgent}>
                {/* Simplified User Agent */}
                {clientInfo.userAgent?.split(')')[0]?.split('(')[1] || 'Web Client'}
            </span>
        </div>
    )
}

{
    branchName && (
        // ... existing branchName render ...

        { isAdmin || user ? (
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
                    </div >
                </header >
    <div className="flex-1 p-4 lg:p-8 overflow-x-hidden">
        {children}
    </div>
            </main >
        </div >
    );
}
