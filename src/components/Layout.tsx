import React, { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom'; 
import { store } from '../services/store';
import { NotificationService } from '../services/notifications';
import { formatHours } from '../types';
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
  Loader2,
  FileBarChart,
  Bell,
  BookOpen,
  ExternalLink,
  TableProperties,
  TrendingUp
} from 'lucide-react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const user = store.getCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  
  // estado da troca de senha
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwdData, setPwdData] = useState({ newPassword: '', confirmPassword: '' });
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // estado das notificações
  const [notifications, setNotifications] = useState<string[]>([]);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [showNotificationsBlocked, setShowNotificationsBlocked] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<'default' | 'denied' | 'granted' | 'unsupported'>('default');

  // abre o modal sozinho se detectou senha padrão
  React.useEffect(() => {
    if (user?.isDefaultPassword) {
        setShowPasswordModal(true);
    }
  }, [user?.isDefaultPassword]);

    // checa se o user bloqueou notificação e avisa (pop-up incisivo)
    useEffect(() => {
      if (!user) return;
      if (!('Notification' in window)) {
        setNotificationPermission('unsupported');
        return;
      }

      const permission = Notification.permission;
      setNotificationPermission(permission);

      const shouldPrompt = permission !== 'granted';
        const lastPrompt = localStorage.getItem('last_notif_prompt');
        const now = Date.now();

        if (shouldPrompt && (!lastPrompt || (now - Number(lastPrompt) > 24 * 60 * 60 * 1000))) {
          setShowNotificationsBlocked(true);
          localStorage.setItem('last_notif_prompt', String(now));
        }
    }, [user?.id]);

  // --- lógica de notificação ---
  useEffect(() => {
      if (!user) return;

      // 1. pede permissão quando monta
      NotificationService.requestPermission();

        const checkNotifications = async () => {
          const alerts: string[] = [];
          const today = new Date();
          let entriesCache: any[] | null = null;
          
          // a. gestor: aprovações pendentes
          if (user.role === 'MANAGER' || user.role === 'ADMIN') {
              const pending = await store.getPendingApprovals(user.id);
              if (pending.length > 0) {
                  const msg = `Você tem ${pending.length} timesheets aguardando aprovação.`;
                  alerts.push(msg);
                  // manda push só se não tiver mandado recentemente
                const lastNotify = localStorage.getItem('last_approval_reminder');
                  const now = Date.now();
                if (!lastNotify || (now - Number(lastNotify) > 60 * 60 * 1000)) {
                      NotificationService.send('Aprovação Pendente', msg, 'approval_tag');
                  localStorage.setItem('last_approval_reminder', String(now));
                  }
              }
          }

          // b. usuário: timesheet rejeitado
          const currentYear = today.getFullYear();
          const currentMonth = today.getMonth();
          const status = await store.getPeriodStatus(user.id, currentYear, currentMonth);
          
          if (status.status === 'REJECTED') {
              const msg = `Atenção: Seu timesheet de ${currentMonth + 1}/${currentYear} foi devolvido. Verifique o motivo.`;
              alerts.push(msg);
              
              const lastNotify = localStorage.getItem('last_rejected_reminder');
              const now = Date.now();
              if (!lastNotify || (now - Number(lastNotify) > 60 * 60 * 1000)) {
                  NotificationService.send('Timesheet Devolvido', msg, 'rejected_tag');
                localStorage.setItem('last_rejected_reminder', String(now));
              }
          }

          // c. usuário: lembrete diário (depois das 16h)
          const dayOfWeek = today.getDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          
          if (!isWeekend && today.getHours() >= 16) {
              const entries = entriesCache ?? await store.getEntries(user.id);
              entriesCache = entries;
              // usa data utc pra bater com o jeito que salva no banco
              const todayStr = today.toISOString().split('T')[0];
              
              const todayHours = entries
                .filter(e => e.date === todayStr)
                .reduce((acc, curr) => acc + curr.hours, 0);

              if (todayHours < 8.8) {
                  const msg = `Você lançou apenas ${formatHours(todayHours)}h hoje. A meta diária é 8.8h.`;
                  alerts.push(msg);
                  
                  // controla frequência da notificação (a cada 4h)
                  const lastReminded = localStorage.getItem('last_daily_reminder');
                  const now = Date.now();
                  
                  if (!lastReminded || (now - Number(lastReminded) > 4 * 60 * 60 * 1000)) {
                       NotificationService.send('Lembrete de Timesheet', msg, 'daily_tag');
                       localStorage.setItem('last_daily_reminder', String(now));
                  }
              }
          }

          // d. usuário: pendências de lançamentos (dias úteis sem horas)
          if (user.role === 'USER') {
              const entries = entriesCache ?? await store.getEntries(user.id);
              entriesCache = entries;
              const currentWeekStart = new Date(today);
              currentWeekStart.setDate(today.getDate() - today.getDay() + 1); // segunda da semana atual
              
              const weekDates: string[] = [];
              for (let i = 0; i < 5; i++) { // de segunda a sexta
                  const date = new Date(currentWeekStart);
                  date.setDate(currentWeekStart.getDate() + i);
                  weekDates.push(date.toISOString().split('T')[0]);
              }
              
              const missingDays: string[] = [];
              weekDates.forEach(dateStr => {
                  const dayEntries = entries.filter(e => e.date === dateStr);
                  const totalHours = dayEntries.reduce((acc, curr) => acc + curr.hours, 0);
                  if (totalHours === 0) {
                      const date = new Date(dateStr + 'T00:00:00');
                      const dayName = date.toLocaleDateString('pt-BR', { weekday: 'long' });
                      missingDays.push(dayName);
                  }
              });
              
              if (missingDays.length > 0) {
                  const msg = `Você ainda não lançou horas para: ${missingDays.join(', ')}. Lembre-se de registrar seu trabalho!`;
                  alerts.push(msg);
                  
                  // notificação push a cada 6 horas pra não virar spam
                  const lastPendingNotify = localStorage.getItem('last_pending_reminder');
                  const now = Date.now();
                  
                  if (!lastPendingNotify || (now - Number(lastPendingNotify) > 6 * 60 * 60 * 1000)) {
                      NotificationService.send('Pendências de Lançamento', msg, 'pending_tag');
                      localStorage.setItem('last_pending_reminder', String(now));
                  }
              }

                  const monthStr = String(currentMonth + 1).padStart(2, '0');
                  const monthPrefix = `${currentYear}-${monthStr}-`;
                  const monthHours = entries
                  .filter(e => e.date && e.date.startsWith(monthPrefix))
                  .reduce((acc, curr) => acc + curr.hours, 0);
                  const expectedToDate = await store.getExpectedHoursToDate(currentYear, currentMonth);
                  const pendingHours = expectedToDate - monthHours;

                  if (pendingHours > 20) {
                    const msg = `Você está com ${formatHours(pendingHours)}h pendentes no mês. Regularize seus lançamentos.`;
                    alerts.push(msg);

                    const lastPendingHoursNotify = localStorage.getItem('last_pending_hours_reminder');
                    const now = Date.now();

                    if (!lastPendingHoursNotify || (now - Number(lastPendingHoursNotify) > 60 * 60 * 1000)) {
                      NotificationService.send('Pendência Alta de Horas', msg, 'pending_hours_tag');
                      localStorage.setItem('last_pending_hours_reminder', String(now));
                    }
                  }
          }

          setNotifications(alerts);
      };

      checkNotifications();
      
      // polling a cada 5 minutos
      const interval = setInterval(checkNotifications, 1000 * 60 * 5); 

      return () => clearInterval(interval);
  }, [user?.id, user?.role]); // dependência ajustada pra evitar loop inútil

  if (!user) return <>{children}</>;

  const handleLogout = () => {
    store.logout();
    navigate('/');
    window.location.reload();
  };

  const handleEnableNotifications = async () => {
      const granted = await NotificationService.requestPermission();
      if (!('Notification' in window)) return;
      const permission = Notification.permission;
      setNotificationPermission(permission);
      if (granted || permission === 'granted') {
          setShowNotificationsBlocked(false);
      }
  };

    const handleDismissNotificationsPrompt = () => {
      localStorage.setItem('last_notif_prompt', String(Date.now()));
      setShowNotificationsBlocked(false);
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
          setTimeout(() => {
             if (user.isDefaultPassword) {
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
     if (size === 'small') {
         return (
             <div className="flex items-center select-none justify-center overflow-hidden h-10">
                <img 
                    src="https://i.postimg.cc/bv4S9DFS/logo.png" 
                    alt="AuditFlow" 
                    className="h-[200%] w-auto max-w-none object-cover object-center"
                />
             </div>
         );
     }

     return (
       <div className="flex items-center select-none justify-center w-full">
          <img 
            src="https://i.postimg.cc/bv4S9DFS/logo.png" 
            alt="AuditFlow" 
            className="w-[200px] h-[100px] object-cover object-center"
          />
       </div>
     );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* sidebar desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 fixed h-full z-10">
        <div className="py-4 flex items-center justify-center">
            <BrandLogo />
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
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
              <NavItem to="/manager/budget" icon={TrendingUp} label="Orçado vs Realizado" />
              <NavItem to="/manager/reports" icon={FileBarChart} label="Relatórios" />
            </>
          )}

          <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4">Meu Espaço</div>
          <NavItem to="/dashboard" icon={LayoutDashboard} label="Meu Dashboard" />
          <NavItem to="/timesheet" icon={Clock} label="Meus Lançamentos" />
          <NavItem to="/reports" icon={TableProperties} label="Relatórios Detalhados" />

          <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4">Nossos Apps</div>
          <a
            href="https://orafarosa.github.io/AuditFlowSampling/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            <ExternalLink size={20} />
            AuditFlow Sampling
          </a>
          <a
            href="https://orafarosa.github.io/AuditFlow-RiskMap/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            <ExternalLink size={20} />
            AuditFlow RiskMap
          </a>
          
          <div className="mt-4 border-t border-gray-100 pt-4">
              <NavItem to="/help" icon={BookOpen} label="Ajuda & Sobre" />
          </div>
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

      {/* header mobile */}
      <div className="md:hidden fixed top-0 w-full bg-white border-b border-gray-200 z-20 px-4 py-3 flex items-center justify-between shadow-sm">
         <div className="flex items-center gap-2">
             <BrandLogo size="small" />
         </div>
         <div className="flex items-center gap-4">
             <div className="relative">
                 <button onClick={() => setShowNotificationPanel(!showNotificationPanel)} className="p-2 text-slate-600 relative">
                     <Bell size={20} />
                     {notifications.length > 0 && (
                         <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white"></span>
                     )}
                 </button>
             </div>
             <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-slate-600">
                <Menu size={24} />
             </button>
         </div>
      </div>

      {/* barra topo desktop */}
      <div className="hidden md:block fixed top-6 right-8 z-20">
          <div className="relative">
              <button 
                onClick={() => setShowNotificationPanel(!showNotificationPanel)} 
                className={`p-2 rounded-full transition-colors ${showNotificationPanel ? 'bg-brand-50 text-brand-600' : 'bg-white text-slate-500 hover:text-slate-700 shadow-sm border border-gray-100'}`}
              >
                  <Bell size={20} />
                  {notifications.length > 0 && (
                      <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>
                  )}
              </button>
              
              {showNotificationPanel && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50">
                      <div className="p-3 bg-gray-50 border-b border-gray-100 font-semibold text-sm text-slate-700">
                          Notificações
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                          {notifications.length === 0 ? (
                              <div className="p-4 text-center text-slate-400 text-sm">Nenhuma notificação nova.</div>
                          ) : (
                              notifications.map((note, idx) => (
                                  <div key={idx} className="p-3 border-b border-gray-50 hover:bg-slate-50 text-sm text-slate-600 last:border-0">
                                      {note}
                                  </div>
                              ))
                          )}
                      </div>
                  </div>
              )}
          </div>
      </div>

      {/* painel de notificação mobile */}
      {showNotificationPanel && (
          <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setShowNotificationPanel(false)}>
               <div className="absolute top-16 right-4 left-4 bg-white rounded-xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="p-3 bg-gray-50 border-b border-gray-100 font-semibold text-sm">Notificações</div>
                    <div className="max-h-60 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-4 text-center text-slate-400 text-sm">Nenhuma notificação nova.</div>
                        ) : (
                            notifications.map((note, idx) => (
                                <div key={idx} className="p-3 border-b border-gray-50 text-sm text-slate-600">
                                    {note}
                                </div>
                            ))
                        )}
                    </div>
               </div>
          </div>
      )}

          {/* pop-up incisivo pra liberar notificação */}
          {showNotificationsBlocked && !showPasswordModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="p-5 border-b border-amber-100 bg-amber-50">
                  <h3 className="text-lg font-bold text-amber-900">⚠️ notificações desativadas</h3>
                  <p className="text-sm text-amber-800 mt-1">
                    pra não esquecer prazos e pendências, ativa as notificações aqui. evita dor de cabeça depois.
                  </p>
                </div>
                <div className="p-5 space-y-3">
                  {notificationPermission === 'denied' && (
                    <div className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-3">
                      seu navegador bloqueou as notificações. libera nas configurações do site e volta aqui pra tentar de novo.
                    </div>
                  )}
                  {notificationPermission === 'default' && (
                    <div className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-3">
                      clica em “ativar notificações” pra liberar agora.
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                        onClick={handleDismissNotificationsPrompt}
                      className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      agora não
                    </button>
                    <button
                      onClick={handleEnableNotifications}
                      className="flex-1 px-4 py-2 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700"
                    >
                      ativar notificações
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

      {/* conteúdo principal */}
      <main className={`flex-1 md:ml-64 p-4 md:p-8 pt-20 md:pt-8 overflow-y-auto min-h-screen ${user.isDefaultPassword ? 'filter blur-sm pointer-events-none select-none overflow-hidden h-screen' : ''}`}>
        {children}
      </main>

      {/* modal de troca de senha */}
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