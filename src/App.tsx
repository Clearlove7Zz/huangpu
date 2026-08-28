import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import AppLayout from './layouts/AppLayout';
import Login from './pages/Login';
import AiAssistant from './pages/AiAssistant';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import DecisionSystem from './pages/DecisionSystem';
import ProgressSystem from './pages/ProgressSystem';
import DesignControl from './pages/DesignControl';
import Documents from './pages/Documents';
import WorkMgmt from './pages/WorkMgmt';
import CostSystem from './pages/CostSystem';
import Material from './pages/Material';
import SupplierSystem from './pages/SupplierSystem';
import Coordination from './pages/Coordination';
import Cashflow from './pages/Cashflow';
import RiskSystem from './pages/RiskSystem';
import SafetyLog from './pages/SafetyLog';
import Reports from './pages/Reports';
import SyncLog from './pages/SyncLog';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (user.nav && !user.nav.includes(location.pathname.slice(1))) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="ai" element={<AiAssistant />} />
          <Route path="project" element={<ProjectDetail />} />
          <Route path="decision-system" element={<DecisionSystem />} />
          <Route path="progress-system" element={<ProgressSystem />} />
          <Route path="design-control" element={<DesignControl />} />
          <Route path="documents" element={<Documents />} />
          <Route path="work-mgmt" element={<WorkMgmt />} />
          <Route path="cost-system" element={<CostSystem />} />
          <Route path="material" element={<Material />} />
          <Route path="supplier-system" element={<SupplierSystem />} />
          <Route path="coordination" element={<Coordination />} />
          <Route path="cashflow" element={<Cashflow />} />
          <Route path="risk-system" element={<RiskSystem />} />
          <Route path="safety-log" element={<SafetyLog />} />
          <Route path="reports" element={<Reports />} />
          <Route path="sync" element={<SyncLog />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
