import React, { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom'; 
import { store } from '../services/store';
import { NotificationService } from '../services/notifications';
import { EarnedAchievement, formatHours, HOURS_PER_DAY } from '../types';
import { formatDateForDisplay, formatLocalDate, parseDateOnly } from '../utils/date';
import { buildGamificationProfiles } from '../utils/gamification';
import { buildCalendarMaps, isExpectedWorkingDay, listPendingDaysForMonth } from '../utils/workCalendar';
import { GAMIFICATION_ENABLED } from '../config/features';
import { LoadingIndicator } from './LoadingIndicator';
import { 
  LayoutDashboard, 
  Users, 
  Briefcase, 
  Clock, 
  LogOut, 
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
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
  TrendingUp,
  Trophy
} from 'lucide-react';

const getAchievementSnapshotKey = (userId: string) => `grc_achievement_snapshot_${userId}`;
const getTopThreeSnapshotKey = (userId: string) => `grc_top_three_snapshot_${userId}`;

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const user = store.getCurrentUser();
  const location = useLocation();
  const navigate = useNavigate();
  const commitHash = import.meta.env.VITE_APP_COMMIT?.trim() || 'local';
  const shortCommitHash = commitHash.slice(0, 7);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(() => {
    return localStorage.getItem('auditflow_sidebar_collapsed') === 'true';
  });
  
  // estado da troca de senha
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwdData, setPwdData] = useState({ newPassword: '', confirmPassword: '' });
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // permissão de Matriz de Riscos (sincronizada com banco)
  const [riskMatrixAccess, setRiskMatrixAccess] = useState(store.getRiskMatrixAccessForCurrentUser());

  // estado das notificações
  const [notifications, setNotifications] = useState<string[]>([]);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [showNotificationsBlocked, setShowNotificationsBlocked] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<'default' | 'denied' | 'granted' | 'unsupported'>('default');
  const [achievementCelebration, setAchievementCelebration] = useState<{
    achievement: EarnedAchievement;
    extraCount: number;
  } | null>(null);

  // abre o modal sozinho se detectou senha padrão
  React.useEffect(() => {
    if (user?.isDefaultPassword) {
        setShowPasswordModal(true);
    }
  }, [user?.isDefaultPassword]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    localStorage.setItem('auditflow_sidebar_collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    let mounted = true;

    const syncRiskAccess = async () => {
      await store.syncCurrentUserFromDatabase();
      if (!mounted) return;
      setRiskMatrixAccess(store.getRiskMatrixAccessForCurrentUser());
    };

    syncRiskAccess();

    return () => {
      mounted = false;
    };
  }, [user?.id, location.pathname]);

  useEffect(() => {
    if (!user?.id) return;
    store.recordLoginActivity(user.id);
  }, [user?.id]);

    // checa se o user bloqueou notificação e avisa (pop-up incisivo)
    useEffect(() => {
      if (!user) return;
      if (user.isActive === false) return;
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
          const [holidays, exceptions] = await Promise.all([
            store.getHolidays(),
            store.getExceptions()
          ]);
          const calendarMaps = buildCalendarMaps(holidays, exceptions);
          
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
          // só pra quem precisa de fato lançar horas
          const dayOfWeek = today.getDay();
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          
          if (!isWeekend && today.getHours() >= 16 && user.requiresTimesheet !== false) {
              const entries = entriesCache ?? await store.getEntries(user.id);
              entriesCache = entries;
              const todayStr = formatLocalDate(today);
              
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
          // só pra quem precisa de fato lançar horas
          if (user.role === 'USER' && user.requiresTimesheet !== false) {
              const entries = entriesCache ?? await store.getEntries(user.id);
              entriesCache = entries;
              const currentWeekStart = new Date(today);
              currentWeekStart.setDate(today.getDate() - today.getDay() + 1); // segunda da semana atual
              
              const weekDates: string[] = [];
              for (let i = 0; i < 5; i++) { // de segunda a sexta
                  const date = new Date(currentWeekStart);
                  date.setDate(currentWeekStart.getDate() + i);
                  weekDates.push(formatLocalDate(date));
              }
              
              const missingDays: string[] = [];
              weekDates.forEach(dateStr => {
                  const dayEntries = entries.filter(e => e.date === dateStr);
                  const totalHours = dayEntries.reduce((acc, curr) => acc + curr.hours, 0);
                  if (totalHours === 0) {
                      const dayName = formatDateForDisplay(dateStr, 'pt-BR', { weekday: 'long' });
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

                  // aqui é o aviso "ontem ficou pra trás", que costuma pegar bem no dia seguinte cedo
                  const yesterday = new Date(today);
                  yesterday.setDate(today.getDate() - 1);
                  const yesterdayStr = formatLocalDate(yesterday);
                  if (today.getHours() >= 9 && isExpectedWorkingDay(yesterdayStr, calendarMaps)) {
                    const yesterdayHours = entries
                      .filter(e => e.date === yesterdayStr)
                      .reduce((acc, curr) => acc + curr.hours, 0);

                    if (yesterdayHours < HOURS_PER_DAY) {
                      const msg = `Ontem (${formatDateForDisplay(yesterdayStr)}) ficou com ${formatHours(yesterdayHours)}h lançadas. Vale concluir esse dia para evitar acúmulo de pendências.`;
                      alerts.push(msg);

                      const lastYesterdayNotify = localStorage.getItem('last_yesterday_gap_reminder');
                      const now = Date.now();
                      if (!lastYesterdayNotify || (now - Number(lastYesterdayNotify) > 8 * 60 * 60 * 1000)) {
                        NotificationService.send('Dia Útil Incompleto', msg, 'yesterday_gap_tag');
                        localStorage.setItem('last_yesterday_gap_reminder', String(now));
                      }
                    }
                  }

                  const monthStr = String(currentMonth + 1).padStart(2, '0');
                  const monthPrefix = `${currentYear}-${monthStr}-`;
                  const monthHours = entries
                  .filter(e => e.date && e.date.startsWith(monthPrefix))
                  .reduce((acc, curr) => acc + curr.hours, 0);
                  const expectedToDate = await store.getExpectedHoursToDate(currentYear, currentMonth);
                  const pendingHours = expectedToDate - monthHours;
                  const currentPendingDays = listPendingDaysForMonth({
                    entries,
                    year: currentYear,
                    month: currentMonth,
                    maps: calendarMaps,
                    maxDate: formatLocalDate(today)
                  });

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

                  if (currentPendingDays.length >= 3 && today.getHours() >= 11) {
                    const msg = `Você já acumula ${currentPendingDays.length} dia(s) úteis com horas faltando neste mês.`;
                    alerts.push(msg);

                    const lastPendingDaysNotify = localStorage.getItem('last_pending_days_reminder');
                    const now = Date.now();
                    if (!lastPendingDaysNotify || (now - Number(lastPendingDaysNotify) > 6 * 60 * 60 * 1000)) {
                      NotificationService.send('Dias Pendentes no Mês', msg, 'pending_days_tag');
                      localStorage.setItem('last_pending_days_reminder', String(now));
                    }
                  }

                  if (today.getDate() <= 7) {
                    const previousDate = new Date(currentYear, currentMonth - 1, 1);
                    const previousYear = previousDate.getFullYear();
                    const previousMonth = previousDate.getMonth();
                    const previousPeriodStatus = await store.getPeriodStatus(user.id, previousYear, previousMonth);
                    const previousPendingDays = listPendingDaysForMonth({
                      entries,
                      year: previousYear,
                      month: previousMonth,
                      maps: calendarMaps
                    });

                    if (
                      previousPendingDays.length > 0 &&
                      (previousPeriodStatus.status === 'OPEN' || previousPeriodStatus.status === 'REJECTED')
                    ) {
                      const missingHours = previousPendingDays.reduce((acc, day) => acc + day.missingHours, 0);
                      const msg = `O mês anterior ainda está com ${previousPendingDays.length} dia(s) pendentes e ${formatHours(missingHours)}h faltando.`;
                      alerts.push(msg);

                      const lastCarryOverNotify = localStorage.getItem('last_previous_month_reminder');
                      const now = Date.now();
                      if (!lastCarryOverNotify || (now - Number(lastCarryOverNotify) > 8 * 60 * 60 * 1000)) {
                        NotificationService.send('Pendência do Mês Anterior', msg, 'previous_month_tag');
                        localStorage.setItem('last_previous_month_reminder', String(now));
                      }
                    }
                  }
          }

          if (GAMIFICATION_ENABLED) {
            // aqui é a parte divertida: quando entrar conquista nova ou mexer no top 3,
            // a pessoa recebe um cutucão pra ir ver a página de ranking.
            const [users, periods, loginActivities, periodEvents, userActivityEvents] = await Promise.all([
              store.getUsers(),
              store.getTimesheetPeriods(),
              store.getLoginActivity(),
              store.getPeriodEvents(),
              store.getUserActivityEvents()
            ]);

            const allProfiles = buildGamificationProfiles({
              users,
              entries: entriesCache ?? await store.getEntries(user.id),
              periods,
              loginActivities,
              periodEvents,
              userActivityEvents,
              holidays,
              exceptions
            });

            const currentProfile = allProfiles.find((profile) => profile.userId === user.id);
            if (currentProfile) {
              const latestAchievementSnapshot = currentProfile.achievements.reduce<Record<string, number>>((acc, achievement) => {
                if (achievement.earnedCount > 0) {
                  acc[achievement.key] = achievement.earnedCount;
                }
                return acc;
              }, {});

              const achievementSnapshotKey = getAchievementSnapshotKey(user.id);
              const previousAchievementSnapshotRaw = localStorage.getItem(achievementSnapshotKey);

              if (previousAchievementSnapshotRaw) {
                const previousAchievementSnapshot = JSON.parse(previousAchievementSnapshotRaw) as Record<string, number>;
                const newAchievements = currentProfile.achievements.filter((achievement) => {
                  const previousCount = previousAchievementSnapshot[achievement.key] || 0;
                  return achievement.earnedCount > previousCount;
                });

                if (newAchievements.length > 0) {
                  const msg = newAchievements.length === 1
                    ? 'Você acabou de destravar uma conquista nova. Dá uma olhada em Ranking & Conquistas.'
                    : `Você acabou de destravar ${newAchievements.length} conquistas. Dá uma olhada em Ranking & Conquistas.`;
                  alerts.push(msg);
                  setAchievementCelebration({
                    achievement: newAchievements[0],
                    extraCount: Math.max(0, newAchievements.length - 1)
                  });

                  const achievementEventKey = `last_achievement_event_${user.id}`;
                  const lastAchievementNotify = localStorage.getItem(achievementEventKey);
                  const now = Date.now();
                  if (!lastAchievementNotify || (now - Number(lastAchievementNotify) > 60 * 1000)) {
                    NotificationService.send('Nova conquista liberada', msg, `achievement_tag_${user.id}`);
                    localStorage.setItem(achievementEventKey, String(now));
                  }
                }
              }

              localStorage.setItem(achievementSnapshotKey, JSON.stringify(latestAchievementSnapshot));
            }

            const currentRankingYear = today.getFullYear();
            const currentRankingMonth = today.getMonth();
            const currentEntries = entriesCache ?? await store.getEntries(user.id);
            const currentMonthProfiles = buildGamificationProfiles({
              users,
              entries: currentEntries.filter((entry) => {
                const date = parseDateOnly(entry.date);
                return date.getFullYear() === currentRankingYear && date.getMonth() === currentRankingMonth;
              }),
              periods: periods.filter((period) => period.year === currentRankingYear && period.month === currentRankingMonth),
              loginActivities: loginActivities.filter((activity) => {
                const date = parseDateOnly(activity.activityDate);
                return date.getFullYear() === currentRankingYear && date.getMonth() === currentRankingMonth;
              }),
              periodEvents: periodEvents.filter((event) => event.year === currentRankingYear && event.month === currentRankingMonth),
              userActivityEvents: userActivityEvents.filter((event) => {
                const date = parseDateOnly(event.activityDate);
                return date.getFullYear() === currentRankingYear && date.getMonth() === currentRankingMonth;
              }),
              holidays,
              exceptions
            });

            const isInCurrentTopThree = currentMonthProfiles.slice(0, 3).some((profile) => profile.userId === user.id);
            const topThreeSnapshotKey = getTopThreeSnapshotKey(user.id);
            const previousTopThreeStateRaw = localStorage.getItem(topThreeSnapshotKey);

            if (previousTopThreeStateRaw !== null) {
              const previousTopThreeState = previousTopThreeStateRaw === 'true';

              if (!previousTopThreeState && isInCurrentTopThree) {
                const msg = 'Você entrou no top 3 do mês atual. Dá uma olhada em Ranking & Conquistas.';
                alerts.push(msg);

                const topThreeEventKey = `last_top_three_event_${user.id}`;
                const lastTopThreeNotify = localStorage.getItem(topThreeEventKey);
                const now = Date.now();
                if (!lastTopThreeNotify || (now - Number(lastTopThreeNotify) > 60 * 1000)) {
                  NotificationService.send('Top 3 do mês atual', msg, `top_three_tag_${user.id}`);
                  localStorage.setItem(topThreeEventKey, String(now));
                }
              }

              if (previousTopThreeState && !isInCurrentTopThree) {
                const msg = 'Você saiu do top 3 do mês atual. Vale conferir Ranking & Conquistas.';
                alerts.push(msg);

                const topThreeExitEventKey = `last_top_three_exit_event_${user.id}`;
                const lastTopThreeExitNotify = localStorage.getItem(topThreeExitEventKey);
                const now = Date.now();
                if (!lastTopThreeExitNotify || (now - Number(lastTopThreeExitNotify) > 60 * 1000)) {
                  NotificationService.send('Mudança no top 3', msg, `top_three_exit_tag_${user.id}`);
                  localStorage.setItem(topThreeExitEventKey, String(now));
                }
              }
            }

            localStorage.setItem(topThreeSnapshotKey, String(isInCurrentTopThree));
          } else {
            setAchievementCelebration(null);
          }

          setNotifications(alerts);
      };

      checkNotifications();
      
      // polling a cada 5 minutos
      const interval = setInterval(checkNotifications, 1000 * 60 * 5); 

      return () => clearInterval(interval);
  }, [user?.id, user?.role, location.pathname, location.search]); // quando navega, já reavalia conquistas e alertas

  if (!user) return <>{children}</>;

  const unreadCount = notifications.length;

  const notificationPanelBody = (
    <>
      <div className="flex items-center justify-between p-3 bg-slate-50 border-b border-gray-100">
        <div>
          <div className="font-semibold text-sm text-slate-700">Notificações</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {unreadCount === 0 ? 'Nenhum alerta no momento' : `${unreadCount} alerta(s) ativo(s)`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowNotificationPanel(false)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {unreadCount === 0 ? (
          <div className="p-4 text-center text-slate-400 text-sm">Nenhuma notificação nova.</div>
        ) : (
          notifications.map((note, idx) => (
            <div key={idx} className="p-3 border-b border-gray-50 hover:bg-slate-50 text-sm text-slate-600 last:border-0">
              {note}
            </div>
          ))
        )}
      </div>
    </>
  );

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

  const handleDownloadAchievementCard = () => {
    if (!achievementCelebration || !user) return;

    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#0f2f7f');
    gradient.addColorStop(1, '#1d4ed8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(70, 70, 1060, 490);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(1000, 120, 130, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 34px Arial';
    ctx.fillText('AuditFlow', 110, 130);

    ctx.font = '600 22px Arial';
    ctx.fillStyle = '#dbeafe';
    ctx.fillText('Nova conquista desbloqueada', 110, 180);

    ctx.font = '700 58px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(achievementCelebration.achievement.title, 110, 280);

    ctx.font = '400 28px Arial';
    ctx.fillStyle = '#dbeafe';
    ctx.fillText(user.name, 110, 332);

    ctx.font = '400 24px Arial';
    ctx.fillText(achievementCelebration.achievement.description, 110, 400);

    const footerText = achievementCelebration.extraCount > 0
      ? `E ainda vieram mais ${achievementCelebration.extraCount} conquista(s) nessa rodada.`
      : 'Compartilhe no grupo do Teams e espalhe a moral do dia.';

    ctx.fillText(footerText, 110, 445);

    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(110, 492, 470, 58);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 22px Arial';
    ctx.fillText('Pronto para compartilhar no Teams', 136, 530);

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `auditflow-conquista-${achievementCelebration.achievement.key}.png`;
    link.click();
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

  const NavItem = ({ to, icon: Icon, label, locked = false, onClick }: any) => (
    <div className="group relative">
      <Link
        to={to}
        onClick={onClick}
        className={`flex items-center ${isSidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-3 text-sm font-medium rounded-xl transition-all ${
          isActive(to)
            ? 'bg-brand-50 text-brand-700 shadow-sm ring-1 ring-brand-100'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`}
      >
        <Icon size={20} />
        {!isSidebarCollapsed && <span className="flex-1">{label}</span>}
        {!isSidebarCollapsed && locked && <Lock size={16} className="text-slate-400" />}
      </Link>

      {isSidebarCollapsed && (
        <div className="pointer-events-none absolute left-full top-1/2 z-40 ml-3 -translate-y-1/2 rounded-xl border border-brand-100 bg-gradient-to-r from-slate-900 to-brand-900 px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-xl transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100 whitespace-nowrap">
          {label}
          {locked && <span className="ml-2 text-[10px] text-brand-200">(Bloqueado)</span>}
        </div>
      )}
    </div>
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
            className={`${isSidebarCollapsed ? 'w-[72px] h-[72px]' : 'w-[200px] h-[100px]'} object-cover object-center transition-all duration-300`}
          />
       </div>
     );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* sidebar desktop */}
      <aside className={`hidden md:flex flex-col ${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-white border-r border-gray-200 fixed h-full z-10 overflow-hidden transition-all duration-300`}>
        <div className={`py-4 px-3 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            <BrandLogo />
            {!isSidebarCollapsed && (
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(true)}
                className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
                title="Minimizar menu"
                aria-label="Minimizar menu"
              >
                <PanelLeftClose size={16} />
              </button>
            )}
            {isSidebarCollapsed && (
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(false)}
                className="absolute top-4 -right-3 rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm hover:text-slate-700 transition-colors"
                title="Expandir menu"
                aria-label="Expandir menu"
              >
                <PanelLeftOpen size={14} />
              </button>
            )}
        </div>

        <nav className={`flex-1 ${isSidebarCollapsed ? 'p-2' : 'p-4'} space-y-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
          {user.role === 'ADMIN' && (
            <>
              {!isSidebarCollapsed && <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Administração</div>}
              <NavItem to="/admin" icon={ShieldCheck} label="Painel Admin" />
              <NavItem to="/admin/users" icon={Users} label="Usuários" />
              <NavItem to="/admin/projects" icon={Briefcase} label="Trabalhos" />
            </>
          )}

          {(user.role === 'MANAGER' || user.role === 'ADMIN') && (
            <>
              {!isSidebarCollapsed && <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4">Gestão</div>}
              <NavItem to="/manager" icon={PieChart} label="Dashboard Equipe" />
              <NavItem to="/manager/budget" icon={TrendingUp} label="Orçado vs Realizado" />
              <NavItem to="/manager/reports/capacity" icon={Users} label="Capacity" />
              <NavItem to="/manager/reports" icon={FileBarChart} label="Relatórios" />
            </>
          )}

          {!isSidebarCollapsed && <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4">Meu Espaço</div>}
          <NavItem to="/dashboard" icon={LayoutDashboard} label="Meu Dashboard" />
          <NavItem to="/timesheet" icon={Clock} label="Meus Lançamentos" />
          <NavItem to="/reports" icon={TableProperties} label="Relatórios Detalhados" />
          {riskMatrixAccess !== 'NONE' && (
            <NavItem to="/risk-matrix" icon={TrendingUp} label="Matriz de Riscos" />
          )}
          <NavItem to="/achievements" icon={Trophy} label="Ranking & Conquistas" locked={!GAMIFICATION_ENABLED} />

          {!isSidebarCollapsed && <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4">Nossos Apps</div>}
          <a
            href="https://orafarosa.github.io/AuditFlowSampling/"
            target="_blank"
            rel="noopener noreferrer"
            className={`group relative flex items-center ${isSidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-3 text-sm font-medium rounded-xl transition-colors text-slate-600 hover:bg-slate-50 hover:text-slate-900`}
          >
            <ExternalLink size={20} />
            {!isSidebarCollapsed && 'AuditFlow Sampling'}
            {isSidebarCollapsed && (
              <div className="pointer-events-none absolute left-full top-1/2 z-40 ml-3 -translate-y-1/2 rounded-xl border border-brand-100 bg-gradient-to-r from-slate-900 to-brand-900 px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-xl transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100 whitespace-nowrap">
                AuditFlow Sampling
              </div>
            )}
          </a>
          <a
            href="https://orafarosa.github.io/AuditFlow-RiskMap/"
            target="_blank"
            rel="noopener noreferrer"
            className={`group relative flex items-center ${isSidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-3 text-sm font-medium rounded-xl transition-colors text-slate-600 hover:bg-slate-50 hover:text-slate-900`}
          >
            <ExternalLink size={20} />
            {!isSidebarCollapsed && 'AuditFlow RiskMap'}
            {isSidebarCollapsed && (
              <div className="pointer-events-none absolute left-full top-1/2 z-40 ml-3 -translate-y-1/2 rounded-xl border border-brand-100 bg-gradient-to-r from-slate-900 to-brand-900 px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-xl transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100 whitespace-nowrap">
                AuditFlow RiskMap
              </div>
            )}
          </a>
          
          <div className="mt-4 border-t border-gray-100 pt-4">
              <NavItem to="/help" icon={BookOpen} label="Ajuda & Sobre" />
          </div>
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="relative mb-3">
            <button
              type="button"
              onClick={() => setShowNotificationPanel((prev) => !prev)}
              className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4'} rounded-xl border py-3 text-sm font-semibold transition-colors ${
                showNotificationPanel
                  ? 'border-brand-200 bg-brand-50 text-brand-700'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <Bell size={16} />
                {!isSidebarCollapsed && 'Notificações'}
              </span>
              <span className={`min-w-6 rounded-full px-2 py-0.5 text-xs font-bold ${
                unreadCount > 0 ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-600'
              }`}>
                {unreadCount}
              </span>
            </button>

            {showNotificationPanel && (
              <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl z-30">
                {notificationPanelBody}
              </div>
            )}
          </div>

          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3 px-4'} py-2`}>
            <img src={user.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full bg-slate-200" />
            {!isSidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
                <button 
                  onClick={() => setShowPasswordModal(true)}
                  className="text-xs text-brand-600 hover:text-brand-800 flex items-center gap-1 mt-0.5"
                >
                  <Settings size={10} /> Alterar Senha
                </button>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className={`mt-2 w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-2' : 'gap-2 px-4'} py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors`}
          >
            <LogOut size={16} />
            {!isSidebarCollapsed && 'Sair'}
          </button>
        </div>
      </aside>

      {/* header mobile */}
      <div className="md:hidden fixed top-0 w-full bg-white border-b border-gray-200 z-20 px-4 py-3 flex items-center justify-between shadow-sm">
         <div className="flex items-center gap-2">
             <BrandLogo size="small" />
         </div>
         <div className="flex items-center gap-3">
             <div className="relative">
                 <button
                   onClick={() => {
                     setMobileMenuOpen(false);
                     setShowNotificationPanel(!showNotificationPanel);
                   }}
                   className={`relative inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
                     showNotificationPanel
                       ? 'border-brand-200 bg-brand-50 text-brand-700'
                       : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'
                   }`}
                   aria-label="Abrir notificações"
                 >
                     <Bell size={20} />
                     {unreadCount > 0 && (
                         <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-red-500 text-white rounded-full border-2 border-white text-[10px] font-bold flex items-center justify-center">
                           {unreadCount > 9 ? '9+' : unreadCount}
                         </span>
                     )}
                 </button>
             </div>
             <button
               onClick={() => {
                 setShowNotificationPanel(false);
                 setMobileMenuOpen(!mobileMenuOpen);
               }}
               className="p-2 text-slate-600"
             >
                <Menu size={24} />
             </button>
         </div>
      </div>

      {/* menu mobile */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Menu principal">
          <div className="absolute inset-0 bg-black/45" onClick={() => setMobileMenuOpen(false)} />
          <aside className="absolute top-0 right-0 h-full w-[86%] max-w-sm bg-white shadow-2xl flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">Menu</div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-600 rounded-lg hover:bg-slate-100"
                aria-label="Fechar menu"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {user.role === 'ADMIN' && (
                <>
                  <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Administração</div>
                  <NavItem to="/admin" icon={ShieldCheck} label="Painel Admin" onClick={() => setMobileMenuOpen(false)} />
                  <NavItem to="/admin/users" icon={Users} label="Usuários" onClick={() => setMobileMenuOpen(false)} />
                  <NavItem to="/admin/projects" icon={Briefcase} label="Trabalhos" onClick={() => setMobileMenuOpen(false)} />
                </>
              )}

              {(user.role === 'MANAGER' || user.role === 'ADMIN') && (
                <>
                  <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4">Gestão</div>
                  <NavItem to="/manager" icon={PieChart} label="Dashboard Equipe" onClick={() => setMobileMenuOpen(false)} />
                  <NavItem to="/manager/budget" icon={TrendingUp} label="Orçado vs Realizado" onClick={() => setMobileMenuOpen(false)} />
                  <NavItem to="/manager/reports/capacity" icon={Users} label="Capacity" onClick={() => setMobileMenuOpen(false)} />
                  <NavItem to="/manager/reports" icon={FileBarChart} label="Relatórios" onClick={() => setMobileMenuOpen(false)} />
                </>
              )}

              <div className="px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4">Meu Espaço</div>
              <NavItem to="/dashboard" icon={LayoutDashboard} label="Meu Dashboard" onClick={() => setMobileMenuOpen(false)} />
              <NavItem to="/timesheet" icon={Clock} label="Meus Lançamentos" onClick={() => setMobileMenuOpen(false)} />
              <NavItem to="/reports" icon={TableProperties} label="Relatórios Detalhados" onClick={() => setMobileMenuOpen(false)} />
              <NavItem to="/achievements" icon={Trophy} label="Ranking & Conquistas" locked={!GAMIFICATION_ENABLED} onClick={() => setMobileMenuOpen(false)} />

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
                <NavItem to="/help" icon={BookOpen} label="Ajuda & Sobre" onClick={() => setMobileMenuOpen(false)} />
              </div>
            </nav>

            <div className="p-4 border-t border-gray-100">
              <div className="flex items-center gap-3 px-2 py-2">
                <img src={user.avatarUrl} alt="Avatar" className="w-9 h-9 rounded-full bg-slate-200" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{user.name}</p>
                  <button
                    onClick={() => {
                      setShowPasswordModal(true);
                      setMobileMenuOpen(false);
                    }}
                    className="text-xs text-brand-600 hover:text-brand-800 flex items-center gap-1 mt-0.5"
                  >
                    <Settings size={10} /> Alterar Senha
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="mt-2 w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <LogOut size={16} />
                Sair
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* painel de notificação mobile */}
      {showNotificationPanel && (
          <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setShowNotificationPanel(false)}>
             <div className="absolute top-16 right-4 left-4 bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
              {notificationPanelBody}
               </div>
          </div>
      )}

      {achievementCelebration && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden">
            <div className="bg-gradient-to-r from-brand-900 to-brand-700 px-6 py-5 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-100">Conquista desbloqueada</p>
              <h2 className="text-2xl font-bold mt-2">{achievementCelebration.achievement.title}</h2>
              <p className="text-sm text-brand-100 mt-2">
                O AuditFlow registrou essa nova conquista no seu histórico.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className={`rounded-2xl border p-4 ${
                achievementCelebration.achievement.tone === 'negative'
                  ? 'border-red-200 bg-red-50'
                  : 'border-emerald-200 bg-emerald-50'
              }`}>
                <p className="font-bold text-slate-800">{achievementCelebration.achievement.title}</p>
                <p className="text-sm text-slate-600 mt-2">{achievementCelebration.achievement.description}</p>
                {achievementCelebration.achievement.progressText && (
                  <p className="text-xs text-slate-500 mt-3">{achievementCelebration.achievement.progressText}</p>
                )}
              </div>

              {achievementCelebration.extraCount > 0 && (
                <p className="text-sm text-slate-500">
                  Além desta, mais {achievementCelebration.extraCount} conquista(s) também foram liberadas nesta atualização.
                </p>
              )}

              <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
                <p className="text-sm font-semibold text-brand-900">Compartilhe com os colegas no Teams</p>
                <p className="text-sm text-brand-800 mt-1">
                  Se quiser, baixe uma imagem e mande no grupo para celebrar a nova conquista.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleDownloadAchievementCard}
                  className="flex-1 rounded-xl bg-brand-600 text-white px-4 py-3 text-sm font-semibold hover:bg-brand-700 transition-colors"
                >
                  Baixar imagem
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAchievementCelebration(null);
                    navigate('/achievements');
                  }}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Ver ranking
                </button>
              </div>

              <button
                type="button"
                onClick={() => setAchievementCelebration(null)}
                className="w-full text-sm text-slate-500 hover:text-slate-700 transition-colors"
              >
                Fechar por enquanto
              </button>
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
                    Pra não esquecer prazos e pendências, ativa as notificações aqui. Isso evita esquecimentos.
                  </p>
                </div>
                <div className="p-5 space-y-3">
                  {notificationPermission === 'denied' && (
                    <div className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-3">
                      Seu navegador bloqueou as notificações. Libere nas configurações do site e volte aqui para tentar de novo.
                    </div>
                  )}
                  {notificationPermission === 'default' && (
                    <div className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-3">
                      Clique em “ativar notificações” para liberar agora.
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
      <main className={`flex-1 ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'} p-4 md:p-8 pt-20 md:pt-8 overflow-y-auto min-h-screen transition-all duration-300 ${user.isDefaultPassword ? 'filter blur-sm pointer-events-none select-none overflow-hidden h-screen' : ''}`}>
        {children}
      </main>

      <LoadingIndicator />

      <div className="fixed bottom-2 right-3 z-10 pointer-events-none select-none text-[10px] text-slate-400">
        {shortCommitHash}
      </div>

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
