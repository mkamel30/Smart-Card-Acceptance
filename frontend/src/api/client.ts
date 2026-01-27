import axios, { type InternalAxiosRequestConfig } from 'axios';

const getBaseUrl = () => {
    const envUrl = import.meta.env.VITE_API_URL;
    if (!envUrl) return '/api';
    return envUrl.endsWith('/api') ? envUrl : `${envUrl}/api`;
};

const api = axios.create({
    baseURL: getBaseUrl(),
    headers: {
        'Content-Type': 'application/json',
    },
});

// Auto-inject branchId to all GET requests
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const branchId = localStorage.getItem('selectedBranchId');
    if (branchId && config.method === 'get') {
        config.params = { ...config.params, branchId };
    }

    const adminPassword = localStorage.getItem('adminPassword');
    if (adminPassword) {
        config.headers['x-admin-password'] = adminPassword;
    }

    const token = localStorage.getItem('token');
    if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
    }

    return config;
});

// Handle 401 Unauthorized globally
api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Special case: If the request is for settlement and has a manual password attempt, don't redirect
        // We can detect this if the error is handled by the caller, but axios interceptors run first.
        // However, we can check if the current page is one where we want manual control.

        if (error.response?.status === 401) {
            const token = localStorage.getItem('token');
            const isSettlementPage = window.location.pathname.includes('/settlement');

            // Only force login if they WERE logged in (had a token) AND it's not a page where we want manual auth handling
            if (token && !isSettlementPage) {
                console.error('Session expired or unauthorized');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
            } else {
                console.warn('Unauthorized access', isSettlementPage ? '- handling manually' : '- guest');
                // Don't auto-redirect here, let the component handle the 401 (e.g., prompt for password)
            }
        }
        return Promise.reject(error);
    }
);

export default api;
