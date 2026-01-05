import { createContext, useContext, useState, ReactNode } from 'react';

interface AdminContextType {
    isAdmin: boolean;
    adminPassword: string | null;
    login: (password: string) => boolean;
    logout: () => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
    const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('isAdmin') === 'true');
    const [adminPassword, setAdminPassword] = useState<string | null>(() => localStorage.getItem('adminPassword'));

    const login = (password: string) => {
        if (password === 'TITI') {
            setIsAdmin(true);
            setAdminPassword(password);
            localStorage.setItem('isAdmin', 'true');
            localStorage.setItem('adminPassword', password);
            return true;
        }
        return false;
    };

    const logout = () => {
        setIsAdmin(false);
        setAdminPassword(null);
        localStorage.removeItem('isAdmin');
        localStorage.removeItem('adminPassword');
    };

    return (
        <AdminContext.Provider value={{ isAdmin, adminPassword, login, logout }}>
            {children}
        </AdminContext.Provider>
    );
}

export function useAdmin() {
    const context = useContext(AdminContext);
    if (context === undefined) {
        throw new Error('useAdmin must be used within an AdminProvider');
    }
    return context;
}
