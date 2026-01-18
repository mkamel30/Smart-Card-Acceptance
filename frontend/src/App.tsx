import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import SettlementForm from './pages/SettlementForm';
import ReceiptUpload from './pages/ReceiptUpload';
import BatchReport from './pages/BatchReport';
import TransactionReceipt from './pages/TransactionReceipt';
import Batches from './pages/Batches';
import SelectBranch from './pages/SelectBranch';
import BranchDashboard from './pages/BranchDashboard';
import BranchStats from './pages/BranchStats';
import Login from './pages/Login';

const queryClient = new QueryClient();

// Guard to ensure branch is selected
function RequireBranch({ children }: { children: JSX.Element }) {
    const branchId = localStorage.getItem('selectedBranchId');
    const token = localStorage.getItem('token');
    const location = useLocation();

    if (!branchId && !token) {
        return <Navigate to="/select-branch" state={{ from: location }} replace />;
    }

    return children;
}

// Logout on Refresh Logic - Global Check
function App() {
    useEffect(() => {
        // Only run this check once per full page load
        if (sessionStorage.getItem('refresh_handled')) return;

        const perf = window.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
        if (perf && perf.type === 'reload') {
            const token = localStorage.getItem('token');
            const hasBranch = !!localStorage.getItem('selectedBranchId');

            if (token) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                localStorage.removeItem('selectedBranchId');
                window.location.href = '/login';
            } else if (hasBranch) {
                localStorage.removeItem('selectedBranchId');
                localStorage.removeItem('selectedBranchName');
                window.location.href = '/select-branch';
            }
        }
        sessionStorage.setItem('refresh_handled', 'true');

        // Clear the flag on navigate away or just keep it for the session
    }, []);

    return (
        <QueryClientProvider client={queryClient}>
            <Router>
                <Routes>
                    {/* Public Route */}
                    <Route path="/select-branch" element={<SelectBranch />} />
                    <Route path="/login" element={<Login />} />

                    {/* Protected Routes */}
                    <Route path="*" element={
                        <RequireBranch>
                            <Layout>
                                <Routes>
                                    <Route path="/" element={<Dashboard />} />
                                    <Route path="/stats" element={<BranchStats />} />
                                    <Route path="/batches" element={<Batches />} />
                                    <Route path="/branch-dashboard" element={<BranchDashboard />} />
                                    <Route path="/settlement/new" element={<SettlementForm />} />
                                    <Route path="/settlement/:id/receipt" element={<ReceiptUpload />} />
                                    <Route path="/report/batch/:batchNumber" element={<BatchReport />} />
                                    <Route path="/settlement/:id/print" element={<TransactionReceipt />} />
                                </Routes>
                            </Layout>
                        </RequireBranch>
                    } />
                </Routes>
            </Router>
        </QueryClientProvider>
    );
}

export default App;
