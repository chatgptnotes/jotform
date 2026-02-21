import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import WorkflowTracker from './pages/WorkflowTracker';
import BottleneckAnalysis from './pages/BottleneckAnalysis';
import ApprovalDetail from './pages/ApprovalDetail';
import Settings from './pages/Settings';
import { useSubmissions } from './hooks/useSubmissions';

export default function App() {
  const data = useSubmissions();

  return (
    <Layout refreshConfig={data.refreshConfig} setRefreshConfig={data.setRefreshConfig} onRefresh={data.refresh}>
      <Routes>
        <Route path="/" element={<Dashboard data={data} />} />
        <Route path="/tracker" element={<WorkflowTracker data={data} />} />
        <Route path="/bottlenecks" element={<BottleneckAnalysis data={data} />} />
        <Route path="/approval/:level" element={<ApprovalDetail data={data} />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  );
}
