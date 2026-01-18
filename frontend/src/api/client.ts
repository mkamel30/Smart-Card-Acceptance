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
            const token = localStorage.getItem('token');

            // Only force login if they WERE logged in (had a token)
            if (token) {
                console.error('Session expired or unauthorized');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login';
            } else {
                // If they are a guest and get a 401, maybe just go back to branch selection
                console.warn('Unauthorized guest access');
                // Optional: window.location.href = '/select-branch';
            }
        }
        return Promise.reject(error);
    }
);

export default api;
