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
        if (error.response?.status === 401) {
            // Prevent infinite loop if already on login page
            if (!window.location.pathname.includes('/')) {
                // do nothing? No, we should redirect.
            }

            // Clear session only if it seems invalid
            // We can't use React Router hook here easily without more setup, so use window.location
            // But verify we are not already redirecting

            console.error('Session expired or unauthorized');
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            // Force reload to clear context
            window.location.href = '/';
        }
        return Promise.reject(error);
    }
);

export default api;
