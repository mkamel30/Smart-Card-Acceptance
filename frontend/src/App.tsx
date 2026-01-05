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

const queryClient = new QueryClient();

// Guard to ensure branch is selected
function RequireBranch({ children }: { children: JSX.Element }) {
    const branchId = localStorage.getItem('selectedBranchId');
    const location = useLocation();

    if (!branchId) {
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

                    {/* Protected Routes */}
                    <Route path="*" element={
                        <RequireBranch>
                            <Layout>
                                <Routes>
                                    <Route path="/" element={<Dashboard />} />
                                    <Route path="/batches" element={<Batches />} />
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
