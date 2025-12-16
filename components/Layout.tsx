import React, { useState } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom'; 
import { store } from '../services/store';
import { 
  LayoutDashboard, 
  Users, 
  Briefcase, 
  Clock, 
  LogOut, 
  Menu,
  ShieldCheck,
  PieChart,
  Settings,
  Lock,
  Loader2
} from 'lucide-react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const user = store.getCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  
  // Password Change State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwdData, setPwdData] = useState({ newPassword: '', confirmPassword: '' });
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Trigger modal automatically if default password is detected
  React.useEffect(() => {
    if (user?.isDefaultPassword) {
        setShowPasswordModal(true);
    }
  }, [user?.isDefaultPassword]);

  if (!user) return <>{children}</>;

  const handleLogout = () => {
    store.logout();
    navigate('/');
    window.location.reload();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
      e.preventDefault();
      setPwdError('');
      setPwdSuccess('');
      setLoading(true);

      if (pwdData.newPassword.length < 6) {
          setPwdError('A senha deve ter pelo menos 6 caracteres.');
          setLoading(false);
          return;
      }

      if (pwdData.newPassword !== pwdData.confirmPassword) {
          setPwdError('As senhas não coincidem.');
          setLoading(false);
          return;
      }

      const success = await store.changePassword(user.id, pwdData.newPassword);
      setLoading(false);

      if (success) {
          setPwdSuccess('Senha alterada com sucesso!');
          setPwdData({ newPassword: '', confirmPassword: '' });
          // If it was a forced change, allow closing after a brief delay or manual close
          setTimeout(() => {
             if (user.isDefaultPassword) {
                 // The store updates local storage, but we need to force a re-render or reload to clear the forced flag check effectively in the UI if we were relying solely on props. 
                 // However, store.changePassword updates the local storage, so a reload is the safest way to reset app state perfectly.
                 window.location.reload(); 
             } else {
                 setShowPasswordModal(false);
             }
          }, 1500);
      } else {
          setPwdError('Erro ao alterar senha. Tente novamente.');
      }
  };

  const isActive = (path: string) => location.pathname === path;

  const NavItem = ({ to, icon: Icon, label }: any) => (
    <Link
      to={to}
      className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
        isActive(to)
          ? 'bg-brand-50 text-brand-600'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <Icon size={20} />
      {label}
    </Link>
  );

  const BrandLogo = ({ size = 'normal' }: { size?: 'normal' | 'small' }) => {
     const heightClass = size === 'small' ? 'h-8' : 'h-10';
     return (
       <div className="flex items-center select-none">
          <img 
            src="./logo.png" 
            alt="AuditFlow" 
            className={`h-28 w-auto object-contain`}
            onError={(e) => {
              // Fallback text if image fails to load
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <span className="hidden text-xl font-extrabold text-brand-600 tracking-tight ml-2">AUDITFLOW</span>
       </div>
     );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 fixed h-full z-10">
        <div className="p-0 border-b border-gray-100 flex justify-center">
            <BrandLogo />
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {user.role === 'ADMIN' && (
            <>
              <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Administração</div>
              <NavItem to="/admin" icon={ShieldCheck} label="Painel Admin" />
              <NavItem to="/admin/users" icon={Users} label="Usuários" />
              <NavItem to="/admin/projects" icon={Briefcase} label="Trabalhos" />
            </>
          )}

          {(user.role === 'MANAGER' || user.role === 'ADMIN') && (
            <>
              <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4">Gestão</div>
              <NavItem to="/manager" icon={PieChart} label="Dashboard Equipe" />
            </>
          )}

          <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4">Meu Espaço</div>
          <NavItem to="/dashboard" icon={LayoutDashboard} label="Meu Dashboard" />
          <NavItem to="/timesheet" icon={Clock} label="Meus Lançamentos" />
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 px-4 py-2">
            <img src={user.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full bg-slate-200" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
              <button 
                onClick={() => setShowPasswordModal(true)}
                className="text-xs text-brand-600 hover:text-brand-800 flex items-center gap-1 mt-0.5"
              >
                <Settings size={10} /> Alterar Senha
              </button>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-2 w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 w-full bg-white border-b border-gray-200 z-20 px-4 py-3 flex items-center justify-between">
         <div className="flex items-center gap-2">
             <BrandLogo size="small" />
         </div>
         <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-slate-600">
            <Menu size={24} />
         </button>
      </div>

      {/* Main Content (Blurred if forced password change) */}
      <main className={`flex-1 md:ml-64 p-4 md:p-8 pt-20 md:pt-8 overflow-y-auto min-h-screen ${user.isDefaultPassword ? 'filter blur-sm pointer-events-none select-none overflow-hidden h-screen' : ''}`}>
        {children}
      </main>

      {/* Password Change Modal */}
      {showPasswordModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                  <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-brand-600">
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                          <Lock size={20} />
                          {user.isDefaultPassword ? 'Troca de Senha Obrigatória' : 'Alterar Senha'}
                      </h2>
                      {!user.isDefaultPassword && (
                          <button onClick={() => setShowPasswordModal(false)} className="text-brand-100 hover:text-white">✕</button>
                      )}
                  </div>
                  <div className="p-6">
                      {user.isDefaultPassword && (
                          <div className="bg-amber-50 border-l-4 border-amber-500 p-3 mb-4 rounded text-xs text-amber-800">
                              Por motivos de segurança, você deve alterar sua senha padrão (AuditFlow@2025) antes de continuar.
                          </div>
                      )}

                      <form onSubmit={handleChangePassword} className="space-y-4">
                          <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">Nova Senha</label>
                              <input 
                                type="password" 
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500"
                                placeholder="Mínimo 6 caracteres"
                                value={pwdData.newPassword}
                                onChange={e => setPwdData({...pwdData, newPassword: e.target.value})}
                                required
                              />
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">Confirmar Senha</label>
                              <input 
                                type="password" 
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500"
                                placeholder="Repita a nova senha"
                                value={pwdData.confirmPassword}
                                onChange={e => setPwdData({...pwdData, confirmPassword: e.target.value})}
                                required
                              />
                          </div>
                          
                          {pwdError && <p className="text-red-600 text-sm font-medium">{pwdError}</p>}
                          {pwdSuccess && <p className="text-green-600 text-sm font-medium">{pwdSuccess}</p>}

                          <div className="pt-2">
                              <button 
                                type="submit" 
                                disabled={loading || (!!pwdSuccess && user.isDefaultPassword)}
                                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-2 rounded-lg transition-colors flex justify-center items-center"
                              >
                                  {loading ? <Loader2 className="animate-spin" size={20} /> : 'Salvar Nova Senha'}
                              </button>
                          </div>
                      </form>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
