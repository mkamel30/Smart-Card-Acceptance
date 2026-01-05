
import { createContext, useContext, useState, ReactNode } from 'react';

interface User {
    id: string;
    username: string;
    role: 'ADMIN' | 'BRANCH_MANAGER';
    branches: any[];
}

interface AuthContextType {
    isAdmin: boolean;
    isBranchManager: boolean;
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    legacyLogin: (password: string) => boolean;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(() => {
        const saved = localStorage.getItem('user');
        return saved ? JSON.parse(saved) : null;
    });
    const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
    const [isAdmin, setIsAdmin] = useState(() =>
        localStorage.getItem('isAdmin') === 'true' ||
        (localStorage.getItem('user') && JSON.parse(localStorage.getItem('user')!).role === 'ADMIN')
    );

    const login = (token: string, user: User) => {
        setToken(token);
        setUser(user);
        setIsAdmin(user.role === 'ADMIN');
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('isAdmin', (user.role === 'ADMIN').toString());
    };

    const legacyLogin = (password: string) => {
        if (password === 'TITI') {
            setIsAdmin(true);
            localStorage.setItem('isAdmin', 'true');
            localStorage.setItem('adminPassword', password);
            return true;
        }
        return false;
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        setIsAdmin(false);
        localStorage.clear();
        window.location.href = '/select-branch';
    };

    const isBranchManager = user?.role === 'BRANCH_MANAGER';

    return (
        <AuthContext.Provider value={{
            isAdmin,
            isBranchManager,
            user,
            token,
            login,
            legacyLogin,
            logout
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

// Keep useAdmin for legacy code compatibility
export const useAdmin = useAuth;
