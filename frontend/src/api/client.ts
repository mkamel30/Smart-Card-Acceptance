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

export default api;
