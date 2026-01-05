import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import Login from './pages/Login';

const queryClient = new QueryClient();

// Guard to ensure branch is selected
function RequireBranch({ children }: { children: JSX.Element }) {
    const branchId = localStorage.getItem('selectedBranchId');
    const token = localStorage.getItem('token');
    const location = useLocation();

    // If we have a token (Manager/Admin), we don't strictly need a selectedBranchId for the Dashboard
    // But for other pages we might. For now, let's allow access if token exists OR branchId exists.
    // Actually, Layout checks mostly. 

    if (!branchId && !token) {
        return <Navigate to="/select-branch" state={{ from: location }} replace />;
    }

    return children;
}

function App() {
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
