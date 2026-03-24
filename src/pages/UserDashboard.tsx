import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { TimesheetEntry, Project, HOURS_PER_DAY, TimesheetPeriod, formatHours, Holiday, CalendarException, FrequentEntryTemplate } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Clock, Calendar, CheckCircle, AlertTriangle, Plus, Trash2, Loader2, Lock, XCircle, Search, Filter, AlertOctagon, Copy, Edit, ChevronDown, ChevronUp, Sparkles, Bookmark } from 'lucide-react';
import { MyStatusWidget } from '../components/MyStatusWidget';
import { GamificationSnapshot } from '../components/GamificationSnapshot';
import { formatDateForDisplay, formatLocalDate, parseDateOnly } from '../utils/date';
import { buildCalendarMaps, listPendingDaysForMonth, PendingDay } from '../utils/workCalendar';

type DashboardPeriodKey = 'current' | 'previous';

interface DashboardIndicators {
  label: string;
  year: number;
  month: number;
  totalHours: number;
  expectedHours: number;
  pendingHours: number;
}

interface HolidayMarker {
  name: string;
  kind: 'holiday' | 'offday';
}

interface PendingPeriodSummary {
  days: PendingDay[];
  totalMissingHours: number;
}

export const UserDashboard: React.FC = () => {
  const user = store.getCurrentUser();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [periodStatus, setPeriodStatus] = useState<TimesheetPeriod | null>(null);
  
    // separação de estado:
    // selectableProjects = projetos ativos liberados pra criar novo lançamento
    // allProjectsHistory = todos os projetos (ativos/inativos) pra mostrar nome na tabela
  const [selectableProjects, setSelectableProjects] = useState<Project[]>([]);
  const [allProjectsHistory, setAllProjectsHistory] = useState<Project[]>([]);
  
  const [loading, setLoading] = useState(true);
  
    // filtros
  const [entryFilterDate, setEntryFilterDate] = useState('');

    // estados dos kpis
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriodKey>('current');
  const [indicators, setIndicators] = useState<Record<DashboardPeriodKey, DashboardIndicators>>({
    current: { label: '', year: 0, month: 0, totalHours: 0, expectedHours: 0, pendingHours: 0 },
    previous: { label: '', year: 0, month: 0, totalHours: 0, expectedHours: 0, pendingHours: 0 }
  });
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [holidayMarkers, setHolidayMarkers] = useState<Record<string, HolidayMarker>>({});
  const [dailyHourLimit, setDailyHourLimit] = useState(10);
  const [pendingDaysByPeriod, setPendingDaysByPeriod] = useState<Record<DashboardPeriodKey, PendingPeriodSummary>>({
    current: { days: [], totalMissingHours: 0 },
    previous: { days: [], totalMissingHours: 0 }
  });
  const [showPendingDetails, setShowPendingDetails] = useState(false);
  const [frequentTemplates, setFrequentTemplates] = useState<FrequentEntryTemplate[]>([]);
  
    // dados de alertas (calculado local)
  const [dailyTotals, setDailyTotals] = useState<Record<string, number>>({});

    // estado do form
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'single' | 'bulk'>('single');
    const [editingId, setEditingId] = useState<string | null>(null); // pra saber qual linha tá sendo editada
  const [formData, setFormData] = useState({
    projectId: '',
    date: formatLocalDate(),
    endDate: formatLocalDate(),
    hours: HOURS_PER_DAY,
    description: ''
  });

  useEffect(() => {
    if (user?.id) {
        loadData();
        store.recordUserActivityEvent(user.id, 'DASHBOARD_VIEW');
    }
  }, [user?.id]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    const [allEntries, allProjects, status, holidays, exceptions, configuredDailyHourLimit] = await Promise.all([
        store.getEntries(user.id),
        store.getProjects(),
        store.getPeriodStatus(user.id, currentYear, currentMonth),
        store.getHolidays(),
      store.getExceptions(),
      store.getDailyHourLimit()
    ]);

    setPeriodStatus(status);
    setEntries(allEntries.sort((a, b) => parseDateOnly(b.date).getTime() - parseDateOnly(a.date).getTime()));
    
    // soma do dia pra regra de alerta
    const totals: Record<string, number> = {};
    allEntries.forEach(e => {
        totals[e.date] = (totals[e.date] || 0) + e.hours;
    });
    setDailyTotals(totals);

    // 1. guarda todos os projetos pro histórico (até inativo, pra nome na tabela)
    setAllProjectsHistory(allProjects);

    // 2. filtra projetos pro select (só ativo e permitido)
    const availableProjects = allProjects.filter(p => {
        if (!p.active) return false; // tem que estar ativo
        
        // regra de permissão
        if (!p.allowedManagerIds || p.allowedManagerIds.length === 0) return true;
        if (p.allowedManagerIds.includes(user.id)) return true;
        if (user.managerId && p.allowedManagerIds.includes(user.managerId)) return true;
        return false;
    });

    setSelectableProjects(availableProjects);

    const markers: Record<string, HolidayMarker> = {};
    holidays.forEach((holiday: Holiday) => {
      markers[holiday.date] = { name: holiday.name, kind: 'holiday' };
    });
    exceptions
      .filter((exception: CalendarException) => exception.type === 'OFFDAY')
      .forEach((exception: CalendarException) => {
        markers[exception.date] = { name: exception.name || 'Folga/Ponte', kind: 'offday' };
      });
    setHolidayMarkers(markers);
    setFrequentTemplates(store.getFrequentEntryTemplates(user.id).slice(0, 6));
    setDailyHourLimit(configuredDailyHourLimit);

    // calcula kpis do mês atual e anterior
    const previousDate = new Date(currentYear, currentMonth - 1, 1);
    const previousYear = previousDate.getFullYear();
    const previousMonth = previousDate.getMonth();

    const buildIndicators = async (
      year: number,
      month: number,
      expectedLoader: (year: number, month: number) => Promise<number>
    ): Promise<DashboardIndicators> => {
      const monthEntries = allEntries.filter(e => {
        const d = parseDateOnly(e.date);
        return d.getMonth() === month && d.getFullYear() === year;
      });

      const totalHours = monthEntries.reduce((acc, curr) => acc + curr.hours, 0);
      const expectedHours = await expectedLoader(year, month);
      const monthLabel = new Date(year, month, 1).toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric'
      });

      return {
        label: monthLabel,
        year,
        month,
        totalHours,
        expectedHours,
        pendingHours: expectedHours - totalHours
      };
    };

    const [currentIndicators, previousIndicators] = await Promise.all([
      buildIndicators(currentYear, currentMonth, (year, month) => store.getExpectedHoursToDate(year, month)),
      buildIndicators(previousYear, previousMonth, (year, month) => store.getExpectedHours(year, month))
    ]);

    setIndicators({
      current: currentIndicators,
      previous: previousIndicators
    });

    const calendarMaps = buildCalendarMaps(holidays, exceptions);
    const todayStr = formatLocalDate(today);
    const currentPendingDays = listPendingDaysForMonth({
      entries: allEntries,
      year: currentYear,
      month: currentMonth,
      maps: calendarMaps,
      maxDate: todayStr
    });
    const previousPendingDays = listPendingDaysForMonth({
      entries: allEntries,
      year: previousYear,
      month: previousMonth,
      maps: calendarMaps
    });

    setPendingDaysByPeriod({
      current: {
        days: currentPendingDays,
        totalMissingHours: Math.round(currentPendingDays.reduce((acc, day) => acc + day.missingHours, 0) * 100) / 100
      },
      previous: {
        days: previousPendingDays,
        totalMissingHours: Math.round(previousPendingDays.reduce((acc, day) => acc + day.missingHours, 0) * 100) / 100
      }
    });

    // dados do gráfico (últimos 6 meses)
    const chartData = [];
    for(let i=5; i>=0; i--) {
        const d = new Date(currentYear, currentMonth - i, 1);
        const monthName = d.toLocaleDateString('pt-BR', { month: 'short' });
        const monthEntries = allEntries.filter(e => {
            const entD = parseDateOnly(e.date);
            return entD.getMonth() === d.getMonth() && entD.getFullYear() === d.getFullYear();
        });
        const mTotal = Math.round(monthEntries.reduce((acc, curr) => acc + curr.hours, 0) * 100) / 100;
        const mExpected = Math.round(await store.getExpectedHours(d.getFullYear(), d.getMonth()) * 100) / 100;
        
        // importante: salva ano/mes pra clicar e navegar depois
        chartData.push({ 
            name: monthName, 
            hours: mTotal, 
            expected: mExpected,
            year: d.getFullYear(),
            month: d.getMonth()
        });
    }
    setMonthlyData(chartData);

    setLoading(false);
  };

  const checkPeriodLocked = async (dateStr: string) => {
    if (!user) return true;
    const date = parseDateOnly(dateStr);
    const status = await store.getPeriodStatus(user.id, date.getFullYear(), date.getMonth());
    return status.status === 'SUBMITTED' || status.status === 'APPROVED';
  };

  const handleEditClick = async (entry: TimesheetEntry) => {
      if (isUserInactive) {
          alert("Seu usuário está inativo. Novos lançamentos e edições estão bloqueados.");
          return;
      }

      const isLocked = await checkPeriodLocked(entry.date);
      if (isLocked) {
          alert("Este lançamento pertence a um mês já enviado para aprovação ou aprovado. Não é possível editar.");
          return;
      }

      setEditingId(entry.id);
      setFormData({
          projectId: entry.projectId,
          date: entry.date,
          endDate: entry.date,
          hours: entry.hours,
          description: entry.description
      });
    setFormMode('single'); // edição é sempre single msm
      setIsFormOpen(true);
  };

  const handleDelete = async (id: string, entryDate: string) => {
    if (isUserInactive) {
        alert("Seu usuário está inativo. Novos lançamentos e edições estão bloqueados.");
        return;
    }

    const isLocked = await checkPeriodLocked(entryDate);
    if (isLocked) {
        alert("Este lançamento pertence a um mês já enviado para aprovação ou aprovado. Não é possível excluir.");
        return;
    }
    
    if(window.confirm('Tem certeza que deseja excluir este lançamento?')) {
        await store.deleteEntry(id);
        loadData();
    }
  };

  const handleSubmitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (isUserInactive) {
      alert("Seu usuário está inativo. Novos lançamentos estão bloqueados.");
      return;
    }

    const getHolidaySummary = (): string[] => {
      if (formMode === 'single' || editingId) {
        const marker = holidayMarkers[formData.date];
        return marker ? [`${formData.date} (${marker.name})`] : [];
      }

      const matchedDates: string[] = [];
      const start = parseDateOnly(formData.date);
      const end = parseDateOnly(formData.endDate);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = formatLocalDate(d);
        const marker = holidayMarkers[dateStr];
        if (marker) {
          matchedDates.push(`${dateStr} (${marker.name})`);
        }
      }

      return matchedDates;
    };

    const holidayDates = getHolidaySummary();
    if (holidayDates.length > 0) {
      const message = holidayDates.length === 1
        ? `A data ${holidayDates[0]} está cadastrada como feriado/folga.\n\nDeseja realmente registrar horas nesse dia? O lançamento será tratado como hora extra.`
        : `Existem ${holidayDates.length} datas cadastradas como feriado/folga neste período:\n- ${holidayDates.join('\n- ')}\n\nDeseja realmente registrar horas nesses dias? Os lançamentos serão tratados como hora extra.`;

      if (!window.confirm(message)) {
        return;
      }
    }

    const requestedHours = Number(formData.hours);
    const limitMessage = `O limite de horas trabalhadas por dia é ${formatHours(dailyHourLimit)} horas. Converse com seu gestor para mais informações.`;
    const getHoursAlreadyLogged = (date: string, excludeEntryId?: string) => {
      return Math.round(entries
        .filter((entry) => entry.date === date && (!excludeEntryId || entry.id !== excludeEntryId))
        .reduce((acc, curr) => acc + curr.hours, 0) * 100) / 100;
    };

    if (editingId) {
      const currentDayTotal = getHoursAlreadyLogged(formData.date, editingId) + requestedHours;
      if (currentDayTotal > dailyHourLimit) {
        alert(limitMessage);
        return;
      }
    } else if (formMode === 'single') {
      const currentDayTotal = getHoursAlreadyLogged(formData.date) + requestedHours;
      if (currentDayTotal > dailyHourLimit) {
        alert(limitMessage);
        return;
      }
    } else {
      const start = parseDateOnly(formData.date);
      const end = parseDateOnly(formData.endDate);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        const dateStr = formatLocalDate(d);
        const currentDayTotal = getHoursAlreadyLogged(dateStr) + requestedHours;
        if (currentDayTotal > dailyHourLimit) {
          alert(limitMessage);
          return;
        }
      }
    }

    setLoading(true);

    if (editingId) {
        // modo update
        await store.updateEntry(editingId, {
            projectId: formData.projectId,
            date: formData.date,
            hours: Number(formData.hours),
            description: formData.description
        });
    } else {
        // modo create
        // checa status do mês (na raça) antes de criar
        // o ideal era validar pelo formData.date, mas por ora a ui segura
        const d = parseDateOnly(formData.date);
        const status = await store.getPeriodStatus(user.id, d.getFullYear(), d.getMonth());
        if (status.status === 'SUBMITTED' || status.status === 'APPROVED') {
             alert(`O mês de ${d.getMonth()+1}/${d.getFullYear()} já foi fechado. Não é possível adicionar lançamentos.`);
             setLoading(false);
             return;
        }

        if (formMode === 'single') {
            await store.addEntry({
                userId: user.id,
                projectId: formData.projectId,
                date: formData.date,
                hours: Number(formData.hours),
                description: formData.description
            });
        } else {
            const start = parseDateOnly(formData.date);
            const end = parseDateOnly(formData.endDate);
            
            for(let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dayOfWeek = d.getDay();
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    const dateStr = formatLocalDate(d);
                    await store.addEntry({
                        userId: user.id,
                        projectId: formData.projectId,
                        date: dateStr,
                        hours: Number(formData.hours),
                        description: formData.description
                    });
                }
            }
        }
    }

    const projectName = getProjectName(formData.projectId);
    store.recordFrequentEntryTemplate(user.id, {
      projectId: formData.projectId,
      hours: Number(formData.hours),
      description: formData.description,
      label: `${projectName} • ${formatHours(Number(formData.hours))}h`
    });
    
    setIsFormOpen(false);
    setEditingId(null);
    setFormData({ ...formData, description: '' });
    await loadData();
    setLoading(false);
  };

  const handleCloseForm = () => {
      setIsFormOpen(false);
      setEditingId(null);
      setFormData({ ...formData, description: '' });
  };

  const getProjectName = (id: string) => {
    const proj = allProjectsHistory.find(p => p.id === id);
    if (!proj) return 'Projeto ' + id.substring(0,4);
    return proj.active ? proj.name : `${proj.name} (Inativo)`;
  }

    // clique no gráfico
  const handleChartClick = (data: any) => {
      if (data && data.activePayload && data.activePayload.length > 0) {
          const payload = data.activePayload[0].payload;
          const { year, month } = payload;
          const startDate = new Date(year, month, 1);
          const endDate = new Date(year, month + 1, 0);
          
          const sStr = formatLocalDate(startDate);
          const eStr = formatLocalDate(endDate);

          navigate(`/reports?startDate=${sStr}&endDate=${eStr}`);
      }
  };

  const isDuplicate = (entry: TimesheetEntry) => {
      return entries.filter(e => 
          e.id !== entry.id && 
          e.date === entry.date && 
          e.projectId === entry.projectId && 
          e.hours === entry.hours &&
          e.description === entry.description
      ).length > 0;
  };

    // check visual do botão "novo lançamento" (mês atual)
  const isCurrentPeriodLocked = periodStatus?.status === 'SUBMITTED' || periodStatus?.status === 'APPROVED';
  const activeIndicators = indicators[dashboardPeriod];
  const referenceIndicators = indicators[dashboardPeriod === 'current' ? 'previous' : 'current'];
  const totalHoursDelta = Math.round((activeIndicators.totalHours - referenceIndicators.totalHours) * 10) / 10;
  const expectedHoursDelta = Math.round((activeIndicators.expectedHours - referenceIndicators.expectedHours) * 10) / 10;
  const pendingHoursDelta = Math.round((activeIndicators.pendingHours - referenceIndicators.pendingHours) * 10) / 10;
  const activePendingSummary = pendingDaysByPeriod[dashboardPeriod];
  const expectedLabel = dashboardPeriod === 'current' ? 'Horas Esperadas (Hoje)' : 'Horas Esperadas (Mês)';
  const expectedHelpText = dashboardPeriod === 'current'
    ? 'Baseado em 8.8h/dia útil até hoje'
    : 'Baseado no total de dias úteis do mês fechado';
  const pendingHelpText = dashboardPeriod === 'current'
    ? 'Divergência acumulada até hoje'
    : 'Divergência do mês encerrado';
  const isUserInactive = user?.isActive === false;

    // lógica de filtro das entradas
  const displayEntries = entryFilterDate 
      ? entries.filter(e => e.date === entryFilterDate)
    : entries.slice(0, 20); // mostra as mais recentes

  if (loading && entries.length === 0) {
      return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-brand-600" size={48} /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-white via-slate-50 to-brand-50/40 p-4 md:p-5 shadow-sm">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Meu Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">Visão rápida do seu progresso no mês e pendências de lançamento</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-white/90 px-3 py-1 text-xs font-semibold text-brand-700 shadow-sm">
            <Sparkles size={12} />
            Atualização contínua
          </span>
        </div>
        <div className="flex gap-3">
             {isUserInactive ? (
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-slate-500 rounded-lg font-medium border border-gray-200">
                    <Lock size={18} />
                    Usuário inativo
                </div>
             ) : periodStatus?.status === 'OPEN' || periodStatus?.status === 'REJECTED' ? (
                 <button 
                    onClick={() => {
                        setEditingId(null);
                        setFormMode('single');
                        setFormData({
                            projectId: '',
                            date: formatLocalDate(),
                            endDate: formatLocalDate(),
                            hours: HOURS_PER_DAY,
                            description: ''
                        });
                        setIsFormOpen(true);
                    }}
                    className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-lg shadow-brand-500/20">
                    <Plus size={20} />
                    Novo Lançamento
                </button>
             ) : (
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-slate-500 rounded-lg font-medium border border-gray-200">
                    <Lock size={18} />
                    {periodStatus?.status === 'SUBMITTED' ? 'Aguardando Aprovação' : 'Mês Fechado'}
                </div>
             )}
        </div>
      </div>

      {isUserInactive && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          Seu usuário está inativo. Os lançamentos anteriores continuam visíveis, mas novas inclusões e edições estão bloqueadas.
        </div>
      )}

    {/* cards de kpi */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Indicadores</h2>
          <p className="text-sm text-slate-500 capitalize">{activeIndicators.label || 'Carregando período...'}</p>
        </div>
        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
          <button
            type="button"
            onClick={() => setDashboardPeriod('current')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${dashboardPeriod === 'current' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Mês Atual
          </button>
          <button
            type="button"
            onClick={() => setDashboardPeriod('previous')}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${dashboardPeriod === 'previous' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            Mês Anterior
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-brand-100 text-brand-600 rounded-lg"><Clock size={24} /></div>
                <div>
                    <p className="text-sm text-slate-500 font-medium">Horas Realizadas</p>
                    <p className="text-2xl font-bold text-slate-900">{formatHours(activeIndicators.totalHours)}h</p>
                </div>
            </div>
            <div className="mt-4 w-full bg-gray-100 rounded-full h-2">
            <div className="bg-brand-600 h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min((activeIndicators.totalHours / (activeIndicators.expectedHours || 1)) * 100, 100)}%` }}></div>
            </div>
          <p className={`mt-2 text-xs font-medium ${totalHoursDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {totalHoursDelta >= 0 ? '+' : ''}{formatHours(totalHoursDelta)}h vs {referenceIndicators.label || 'período anterior'}
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg"><Calendar size={24} /></div>
                <div>
                    <p className="text-sm text-slate-500 font-medium">{expectedLabel}</p>
                    <p className="text-2xl font-bold text-slate-900">{formatHours(activeIndicators.expectedHours)}h</p>
                </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">{expectedHelpText}</p>
          <p className={`mt-2 text-xs font-medium ${expectedHoursDelta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {expectedHoursDelta >= 0 ? '+' : ''}{formatHours(expectedHoursDelta)}h vs {referenceIndicators.label || 'período anterior'}
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg ${activeIndicators.pendingHours > 0 ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                    {activeIndicators.pendingHours > 0 ? <AlertTriangle size={24} /> : <CheckCircle size={24} />}
                </div>
                <div>
                    <p className="text-sm text-slate-500 font-medium">Pendência</p>
                    <p className={`text-2xl font-bold ${activeIndicators.pendingHours > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {activeIndicators.pendingHours > 0 ? `${formatHours(activeIndicators.pendingHours)}h Faltantes` : 'Em dia'}
                    </p>
                </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">{pendingHelpText}</p>
            <p className={`mt-2 text-xs font-medium ${pendingHoursDelta <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {pendingHoursDelta >= 0 ? '+' : ''}{formatHours(pendingHoursDelta)}h vs {referenceIndicators.label || 'período anterior'}
            </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowPendingDetails(prev => !prev)}
          className="w-full p-5 flex items-center justify-between gap-4 text-left hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${activePendingSummary.days.length > 0 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
              {activePendingSummary.days.length > 0 ? <AlertTriangle size={22} /> : <CheckCircle size={22} />}
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Dias com pendência</p>
              <p className="text-lg font-bold text-slate-900">
                {activePendingSummary.days.length > 0
                  ? `${activePendingSummary.days.length} dia(s) • ${formatHours(activePendingSummary.totalMissingHours)}h faltando`
                  : 'Nenhuma pendência no período'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {dashboardPeriod === 'current'
                  ? 'Agrupei tudo aqui para manter a visualização mais organizada. Se quiser, é só expandir.'
                  : 'Em meses já encerrados, essa visão facilita a revisão das pendências de lançamento.'}
              </p>
            </div>
          </div>
          <div className="text-slate-400">
            {showPendingDetails ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </button>

        {showPendingDetails && (
          <div className="border-t border-slate-100 px-5 py-4">
            {activePendingSummary.days.length > 0 ? (
              <div className="space-y-2">
                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setEntryFilterDate(activePendingSummary.days[0].date)}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                  >
                    Filtrar primeiro dia pendente
                  </button>
                  {!isUserInactive && !isCurrentPeriodLocked && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setFormMode('single');
                        setFormData({
                          projectId: '',
                          date: activePendingSummary.days[0].date,
                          endDate: activePendingSummary.days[0].date,
                          hours: HOURS_PER_DAY,
                          description: ''
                        });
                        setIsFormOpen(true);
                      }}
                      className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
                    >
                      Lançar horas nesse dia
                    </button>
                  )}
                </div>
                {activePendingSummary.days.map((day) => (
                  <div key={day.date} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50/70 px-4 py-3">
                    <div>
                      <p className="font-medium text-slate-800">{formatDateForDisplay(day.date)}</p>
                      <p className="text-xs text-slate-500">Lançado: {formatHours(day.loggedHours)}h</p>
                    </div>
                    <div className="text-sm font-semibold text-amber-700">
                      Faltam {formatHours(day.missingHours)}h
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Não há pendências neste período. Tudo está em dia.</p>
            )}
          </div>
        )}
      </div>

    {/* grid principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* coluna esquerda: gráfico + histórico */}
        <div className="lg:col-span-2 space-y-6">
            
            {/* gráfico */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-80 relative">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Histórico Semestral</h3>
                <ResponsiveContainer width="100%" height="90%">
                    <BarChart data={monthlyData} onClick={handleChartClick} style={{cursor: 'pointer'}}>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} />
                        <YAxis axisLine={false} tickLine={false} />
                        <Tooltip cursor={{fill: '#F0EFEA'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(value: number) => [`${Math.round(value * 10) / 10}`]} />
                        <Bar dataKey="expected" name="Esperado" fill="#D1D0CB" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="hours" name="Realizado" fill="#0033C6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
                <div className="absolute top-6 right-6 text-xs text-slate-400">
                    Clique nas barras para ver detalhes
                </div>
            </div>

            {/* lançamentos recentes + filtro */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <h3 className="text-lg font-semibold text-slate-800">
                        {entryFilterDate ? 'Registros do Dia' : 'Últimos Lançamentos'}
                    </h3>
                    
                    {/* filtro */}
                    <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                        <Filter size={16} className="text-slate-400 ml-2" />
                        <input 
                            type="date"
                            value={entryFilterDate}
                            onChange={(e) => setEntryFilterDate(e.target.value)}
                            className="bg-transparent border-none text-sm text-slate-600 focus:ring-0 outline-none"
                            placeholder="Filtrar por data"
                        />
                        {entryFilterDate && (
                            <button onClick={() => setEntryFilterDate('')} className="text-slate-400 hover:text-red-500 px-2">
                                <XCircle size={16} />
                            </button>
                        )}
                    </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-gray-50/95 backdrop-blur-sm sticky top-0 z-10 text-xs uppercase font-semibold text-slate-500">
                            <tr>
                                <th className="px-6 py-3">Data</th>
                                <th className="px-6 py-3">Projeto</th>
                                <th className="px-6 py-3">Descrição</th>
                                <th className="px-6 py-3">Horas</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {displayEntries.map(entry => {
                                const dailyTotal = dailyTotals[entry.date] || 0;
                                const isOverLimit = dailyTotal > 8.8;
                                const isDup = isDuplicate(entry);
                                const holidayMarker = holidayMarkers[entry.date];
                                const isHolidayEntry = Boolean(holidayMarker);
                                const hasAlert = isOverLimit || isDup;

                                return (
                                    <tr key={entry.id} className={`transition-colors ${
                                      isHolidayEntry
                                        ? 'bg-rose-50 hover:bg-rose-100'
                                        : hasAlert
                                          ? 'bg-yellow-50 hover:bg-yellow-100'
                                          : 'odd:bg-white even:bg-slate-50/50 hover:bg-gray-50'
                                    }`}>
                                        <td className="px-6 py-3 whitespace-nowrap flex items-center gap-2">
                                            {formatDateForDisplay(entry.date)}
                                            {isHolidayEntry && (
                                                <div className="group relative">
                                                    <Calendar size={16} className="text-rose-500 cursor-help" />
                                                    <span className="hidden group-hover:block absolute left-6 top-0 bg-slate-800 text-white text-xs p-1 rounded z-50 w-40">
                                                        {holidayMarker?.kind === 'holiday' ? 'Feriado' : 'Folga/Ponte'}: {holidayMarker?.name}
                                                    </span>
                                                </div>
                                            )}
                                            {isOverLimit && (
                                                <div className="group relative">
                                                    <AlertOctagon size={16} className="text-amber-500 cursor-help" />
                                                    <span className="hidden group-hover:block absolute left-6 top-0 bg-slate-800 text-white text-xs p-1 rounded z-50 w-32">
                                                        Total do dia: {formatHours(dailyTotal)}h (&gt;8.8)
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-3 font-medium text-slate-800">
                                            <div className="flex items-center gap-2">
                                                {getProjectName(entry.projectId)}
                                                {isDup && (
                                                    <div className="group relative">
                                                        <Copy size={14} className="text-red-400 cursor-help" />
                                                        <span className="hidden group-hover:block absolute left-4 top-0 bg-slate-800 text-white text-xs p-1 rounded z-50 w-32">
                                                            Possível duplicidade detectada
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 truncate max-w-xs" title={entry.description}>{entry.description}</td>
                                        <td className={`px-6 py-3 font-bold ${isOverLimit ? 'text-amber-600' : ''}`}>{entry.hours}h</td>
                                        <td className="px-6 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button onClick={() => handleEditClick(entry)} className="text-brand-600 hover:text-brand-800 transition-colors p-1 rounded hover:bg-brand-50" title="Editar">
                                                    <Edit size={16} />
                                                </button>
                                                <button onClick={() => handleDelete(entry.id, entry.date)} className="text-red-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50" title="Excluir">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {displayEntries.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                                        {entryFilterDate ? 'Nenhum lançamento nesta data.' : 'Nenhum lançamento recente.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* coluna direita: status e histórico */}
        <div className="space-y-6">
            {user && <GamificationSnapshot userId={user.id} />}
            {user && <MyStatusWidget userId={user.id} onUpdate={loadData} />}
        </div>
      </div>

    {/* modal do form (criar / editar) */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-800">{editingId ? 'Editar Lançamento' : 'Novo Lançamento'}</h2>
                    <button onClick={handleCloseForm} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>
            <form onSubmit={handleSubmitEntry} className="p-6 space-y-4 overflow-y-auto">
                    
                    {/* troca de modo (só pra criar) */}
                    {!editingId && (
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button 
                                type="button" 
                                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${formMode === 'single' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                                onClick={() => setFormMode('single')}
                            >
                                Diário
                            </button>
                            <button 
                                type="button" 
                                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${formMode === 'bulk' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                                onClick={() => setFormMode('bulk')}
                            >
                                Lote (Férias/Período)
                            </button>
                        </div>
                    )}

                    {frequentTemplates.length > 0 && (
                        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center gap-2">
                                <Sparkles size={16} className="text-brand-600" />
                                <h3 className="text-sm font-semibold text-slate-800">Combinações frequentes</h3>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                                {frequentTemplates.map((template) => (
                                  <div key={template.id} className="flex items-start gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setFormData({
                                                ...formData,
                                                projectId: template.projectId,
                                                hours: template.hours,
                                                description: template.description
                                            })}
                                      className="flex-1 min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-brand-300 hover:bg-brand-50/40 transition-colors"
                                        >
                                            <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                                                <Bookmark size={14} className="text-brand-600" />
                                        <span className="truncate">{template.label}</span>
                                            </div>
                                      <p className="mt-1 truncate text-xs text-slate-500" title={template.description}>
                                                {template.description}
                                            </p>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!user) return;
                                                store.deleteFrequentEntryTemplate(user.id, template.id);
                                                setFrequentTemplates(store.getFrequentEntryTemplates(user.id).slice(0, 6));
                                            }}
                                            className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-white hover:text-red-500 transition-colors"
                                            title="Remover combinação"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Trabalho / Projeto</label>
                        <select 
                            required
                            value={formData.projectId} 
                            onChange={(e) => setFormData({...formData, projectId: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                        >
                            <option value="">Selecione...</option>
                            {selectableProjects.map(p => (
                                <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Data {formMode === 'bulk' && 'Início'}</label>
                            <input 
                                type="date"
                                required 
                                value={formData.date}
                                onChange={(e) => setFormData({...formData, date: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                            />
                        </div>
                        {formMode === 'bulk' && (
                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Data Fim</label>
                                <input 
                                    type="date"
                                    required 
                                    min={formData.date}
                                    value={formData.endDate}
                                    onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                                />
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Horas/Dia</label>
                            <input 
                                type="number" 
                                step="0.1"
                                max="24"
                                required
                                value={formData.hours}
                                onChange={(e) => setFormData({...formData, hours: Number(e.target.value)})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
                        <textarea 
                            rows={3}
                            required
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                            placeholder="Descreva as atividades realizadas..."
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button 
                            type="button" 
                            onClick={handleCloseForm}
                            className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="px-4 py-2 bg-brand-600 text-white font-bold rounded-lg hover:bg-brand-700 transition-colors shadow-lg shadow-brand-500/20"
                        >
                            {loading ? 'Salvando...' : (editingId ? 'Atualizar' : 'Salvar Lançamento')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};
