import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Layout } from './components/Layout';
import { UserDashboard } from './pages/UserDashboard';
import { UserReports } from './pages/UserReports'; // Import
import { ManagerDashboard } from './pages/ManagerDashboard';
import { ManagerProjectBudget } from './pages/ManagerProjectBudget';
import { ManagerReports } from './pages/ManagerReports';
import { ManagerCapacity } from './pages/ManagerCapacity';
import { ManagerTeamLeaves } from './pages/ManagerTeamLeaves';
import { AdminDashboard } from './pages/AdminDashboard';
import { HelpCenter } from './pages/HelpCenter'; 
import { AchievementsHub } from './pages/AchievementsHub';
import { RiskMatrix } from './pages/RiskMatrix';
import { store } from './services/store';

// Protected Route Wrapper
interface ProtectedRouteProps {
  children?: React.ReactNode;
  allowedRoles?: string[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const user = store.getCurrentUser();
  
  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect based on role if trying to access unauthorized area
    if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
    if (user.role === 'MANAGER') return <Navigate to="/manager" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return <Layout>{children}</Layout>;
};

const ProtectedRiskMatrixRoute = ({ children }: { children?: React.ReactNode }) => {
  const [isCheckingAccess, setIsCheckingAccess] = React.useState(true);
  const [resolvedUser, setResolvedUser] = React.useState(store.getCurrentUser());
  const [resolvedAccess, setResolvedAccess] = React.useState(store.getRiskMatrixAccessForCurrentUser());

  React.useEffect(() => {
    let mounted = true;

    const syncAccess = async () => {
      const syncedUser = await store.syncCurrentUserFromDatabase();
      if (!mounted) return;
      setResolvedUser(syncedUser);
      setResolvedAccess(store.getRiskMatrixAccessForCurrentUser());
      setIsCheckingAccess(false);
    };

    syncAccess();

    return () => {
      mounted = false;
    };
  }, []);

  if (isCheckingAccess) {
    return null;
  }

  const user = resolvedUser;

  if (!user) {
    return <Navigate to="/" replace />;
  }

  const access = resolvedAccess;
  if (access === 'NONE') {
    if (user.role === 'ADMIN') return <Navigate to="/admin/settings" replace />;
    if (user.role === 'MANAGER') return <Navigate to="/manager" replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return <Layout>{children}</Layout>;
};

const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        
        {/* rotas de usuário */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <UserDashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/timesheet" 
          element={
            <ProtectedRoute>
              <UserDashboard /> 
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/reports" 
          element={
            <ProtectedRoute>
              <UserReports /> 
            </ProtectedRoute>
          } 
        />
        <Route
          path="/achievements"
          element={
            <ProtectedRoute>
              <AchievementsHub />
            </ProtectedRoute>
          }
        />
        <Route
          path="/risk-matrix"
          element={
            <ProtectedRiskMatrixRoute>
              <RiskMatrix />
            </ProtectedRiskMatrixRoute>
          }
        />

        {/* rota de ajuda comum (todo mundo logado) */}
        <Route 
          path="/help" 
          element={
            <ProtectedRoute>
              <HelpCenter />
            </ProtectedRoute>
          } 
        />

        {/* rotas de gestor */}
        <Route 
          path="/manager" 
          element={
            <ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']}>
              <ManagerDashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/manager/reports" 
          element={
            <ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']}>
              <ManagerReports />
            </ProtectedRoute>
          } 
        />
        <Route
          path="/manager/reports/capacity"
          element={
            <ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']}>
              <ManagerCapacity />
            </ProtectedRoute>
          }
        />
        <Route
          path="/manager/team-leaves"
          element={
            <ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']}>
              <ManagerTeamLeaves />
            </ProtectedRoute>
          }
        />
        <Route 
          path="/manager/budget" 
          element={
            <ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']}>
              <ManagerProjectBudget />
            </ProtectedRoute>
          } 
        />
        <Route
          path="/manager/capacity"
          element={<Navigate to="/manager/reports/capacity" replace />}
        />

        {/* rotas de admin */}
        <Route 
          path="/admin/*" 
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminDashboard />
            </ProtectedRoute>
          } 
        />
        
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
