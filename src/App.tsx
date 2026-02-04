import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Layout } from './components/Layout';
import { UserDashboard } from './pages/UserDashboard';
import { UserReports } from './pages/UserReports'; // Import
import { ManagerDashboard } from './pages/ManagerDashboard';
import { ManagerProjectBudget } from './pages/ManagerProjectBudget';
import { ManagerReports } from './pages/ManagerReports';
import { AdminDashboard } from './pages/AdminDashboard';
import { HelpCenter } from './pages/HelpCenter'; 
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
          path="/manager/budget" 
          element={
            <ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']}>
              <ManagerProjectBudget />
            </ProtectedRoute>
          } 
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