import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Auto-inject branchId to all GET requests
api.interceptors.request.use((config) => {
    const branchId = localStorage.getItem('selectedBranchId');
    if (branchId && config.method === 'get') {
        config.params = { ...config.params, branchId };
    }
    return config;
});

export default api;
