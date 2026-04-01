import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { User, TimesheetEntry, Project, HOURS_PER_DAY, TimesheetPeriod, formatHours, Holiday, CalendarException, FrequentEntryTemplate, AppNotice, TeamLeave } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Clock, Calendar, CheckCircle, AlertTriangle, Plus, Trash2, Lock, XCircle, Search, Filter, AlertOctagon, Copy, Edit, ChevronDown, ChevronUp, Sparkles, Bookmark, Bell } from 'lucide-react';
import { MyStatusWidget } from '../components/MyStatusWidget';
import { GamificationSnapshot } from '../components/GamificationSnapshot';
import { DashboardLoadingState } from '../components/DashboardLoadingState';
import { BirthdayBalloons } from '../components/BirthdayBalloons';
import { BirthdaySidebarCard } from '../components/BirthdaySidebarCard';
import { formatDateForDisplay, formatLocalDate, normalizeDateValue, parseDateOnly } from '../utils/date';
import { buildCalendarMaps, listPendingDaysForMonth, PendingDay, isExpectedWorkingDay, CalendarMaps } from '../utils/workCalendar';
import { getMonthlyBirthdays, getUpcomingBirthdays, isBirthdayToday } from '../utils/birthdays';

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

type ConsistencyDayStatus = 'no-entry' | 'on-track' | 'missing' | 'excess';

interface ConsistencyDayCell {
  key: string;
  date: string;
  dayLabel: number;
  holidayName: string | null;
  holidayKind: 'holiday' | 'offday' | null;
  isHoliday: boolean;
  loggedHours: number;
  expectedHours: number;
  deltaHours: number;
  status: ConsistencyDayStatus;
  isFutureDay: boolean;
  isPaymentDay: boolean;
}

export const UserDashboard: React.FC = () => {
  const user = store.getCurrentUser();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [periodStatus, setPeriodStatus] = useState<TimesheetPeriod | null>(null);
  const [previousPeriodStatus, setPreviousPeriodStatus] = useState<TimesheetPeriod | null>(null);
  
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
  const [calendarMapsState, setCalendarMapsState] = useState<CalendarMaps>({
    holidayMap: {},
    offdayMap: {},
    workdayMap: {}
  });
  const [dailyHourLimit, setDailyHourLimit] = useState(10);
  const [pendingDaysByPeriod, setPendingDaysByPeriod] = useState<Record<DashboardPeriodKey, PendingPeriodSummary>>({
    current: { days: [], totalMissingHours: 0 },
    previous: { days: [], totalMissingHours: 0 }
  });
  const [showPendingDetails, setShowPendingDetails] = useState(false);
  const [frequentTemplates, setFrequentTemplates] = useState<FrequentEntryTemplate[]>([]);
  const [notices, setNotices] = useState<AppNotice[]>([]);
  const [upcomingLeaves, setUpcomingLeaves] = useState<TeamLeave[]>([]);
  
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
    const previousDate = new Date(currentYear, currentMonth - 1, 1);
    const previousYear = previousDate.getFullYear();
    const previousMonth = previousDate.getMonth();

    const [allEntries, allProjects, status, previousStatus, holidays, exceptions, configuredDailyHourLimit, directoryUsers] = await Promise.all([
        store.getEntries(user.id),
        store.getProjects(),
        store.getPeriodStatus(user.id, currentYear, currentMonth),
        store.getPeriodStatus(user.id, previousYear, previousMonth),
        store.getHolidays(),
      store.getExceptions(),
      store.getDailyHourLimit(),
      store.getUsers()
    ]);

    setPeriodStatus(status);
    setPreviousPeriodStatus(previousStatus);
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
      const normalizedDate = normalizeDateValue(holiday.date);
      if (!normalizedDate) return;
      markers[normalizedDate] = { name: holiday.name, kind: 'holiday' };
    });
    exceptions
      .filter((exception: CalendarException) => exception.type === 'OFFDAY')
      .forEach((exception: CalendarException) => {
        const normalizedDate = normalizeDateValue(exception.date);
        if (!normalizedDate) return;
        markers[normalizedDate] = { name: exception.name || 'Folga/Ponte', kind: 'offday' };
      });
    setHolidayMarkers(markers);
    setFrequentTemplates(store.getFrequentEntryTemplates(user.id).slice(0, 6));
    setDailyHourLimit(configuredDailyHourLimit);
    setAllUsers(directoryUsers.filter((item) => item.isActive !== false));

    // busca avisos e folgas/férias próximas do próprio usuário
    const [fetchedNotices, userLeaves] = await Promise.all([
      store.getNotices(),
      store.getTeamLeaves({ userIds: [user.id] })
    ]);
    setNotices(fetchedNotices);

    // filtra folgas/férias que começam nos próximos 40 dias
    const todayDate = new Date();
    todayDate.setHours(12, 0, 0, 0);
    const limitDate = new Date(todayDate);
    limitDate.setDate(limitDate.getDate() + 40);
    const todayKey = formatLocalDate(todayDate);
    const limitKey = formatLocalDate(limitDate);
    setUpcomingLeaves(userLeaves.filter((l) => l.startDate >= todayKey && l.startDate <= limitKey));

    // calcula kpis do mês atual e anterior

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
    setCalendarMapsState(calendarMaps);
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

  const handleConsistencyDayClick = (day: ConsistencyDayCell) => {
    if (day.loggedHours <= 0 && !isUserInactive && !isCurrentPeriodLocked) {
      setEditingId(null);
      setFormMode('single');
      setFormData({
        projectId: '',
        date: day.date,
        endDate: day.date,
        hours: HOURS_PER_DAY,
        description: ''
      });
      setIsFormOpen(true);
      return;
    }

    navigate(`/reports?startDate=${day.date}&endDate=${day.date}`);
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
  const isUserInactive = user?.isActive === false;
  const shouldShowSubmissionPendingIndicator =
    user?.requiresTimesheet !== false &&
    !isUserInactive &&
    previousPeriodStatus?.status === 'OPEN';
  const pendingPeriodLabel = indicators.previous.label || 'mês anterior';
  const activeIndicators = indicators[dashboardPeriod];
  const activePendingSummary = pendingDaysByPeriod[dashboardPeriod];
  const expectedLabel = dashboardPeriod === 'current' ? 'Horas Esperadas (Hoje)' : 'Horas Esperadas (Mês)';
  const expectedHelpText = dashboardPeriod === 'current'
    ? 'Baseado em 8.8h/dia útil até hoje'
    : 'Baseado no total de dias úteis do mês fechado';
  const pendingHelpText = dashboardPeriod === 'current'
    ? 'Divergência acumulada até hoje'
    : 'Divergência do mês encerrado';
  const passiveCardClass = 'group bg-white rounded-xl shadow-sm border border-slate-100 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md';
  const monthlyBirthdays = useMemo(() => getMonthlyBirthdays(allUsers), [allUsers]);
  const upcomingBirthdays = useMemo(() => getUpcomingBirthdays(allUsers, 8), [allUsers]);
  const currentMonth = useMemo(() => new Date().getMonth(), []);
  const nextMonthsBirthdays = useMemo(
    () => upcomingBirthdays.filter((person) => person.month !== currentMonth).slice(0, 3),
    [upcomingBirthdays, currentMonth]
  );
  const isUserBirthdayToday = useMemo(() => isBirthdayToday(user?.birthdayDate), [user?.birthdayDate]);
  const consistencyCalendarData = useMemo(() => {
    const year = activeIndicators.year;
    const month = activeIndicators.month;

    if (!year || month < 0) {
      return {
        monthLabel: '',
        weekDays: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'],
        leadingEmptyCells: 0,
        trailingEmptyCells: 0,
        paymentDays: new Set<string>(),
        days: [] as ConsistencyDayCell[]
      };
    }

    const getPaymentDaysForMonth = () => {
      const paymentDays = new Set<string>();
      const lastDay = new Date(year, month + 1, 0).getDate();

      let businessDayCounter = 0;
      for (let day = 1; day <= lastDay; day++) {
        const dateStr = formatLocalDate(new Date(year, month, day, 12));
        if (!isExpectedWorkingDay(dateStr, calendarMapsState)) continue;

        businessDayCounter += 1;
        if (businessDayCounter === 2) {
          paymentDays.add(dateStr);
          break;
        }
      }

      const fifteenthDate = formatLocalDate(new Date(year, month, 15, 12));
      if (isExpectedWorkingDay(fifteenthDate, calendarMapsState)) {
        paymentDays.add(fifteenthDate);
      } else {
        for (let day = 14; day >= 1; day--) {
          const fallbackDate = formatLocalDate(new Date(year, month, day, 12));
          if (isExpectedWorkingDay(fallbackDate, calendarMapsState)) {
            paymentDays.add(fallbackDate);
            break;
          }
        }
      }

      return paymentDays;
    };

    const paymentDays = getPaymentDaysForMonth();

    const monthEntries = entries.filter((entry) => {
      const entryDate = parseDateOnly(entry.date);
      return entryDate.getFullYear() === year && entryDate.getMonth() === month;
    });

    const totalsByDate: Record<string, number> = {};
    monthEntries.forEach((entry) => {
      totalsByDate[entry.date] = Math.round(((totalsByDate[entry.date] || 0) + entry.hours) * 100) / 100;
    });

    const lastDay = new Date(year, month + 1, 0).getDate();
    const firstWeekDay = new Date(year, month, 1).getDay();
    const todayStr = formatLocalDate(new Date());

    const days: ConsistencyDayCell[] = [];
    for (let day = 1; day <= lastDay; day++) {
      const currentDate = new Date(year, month, day, 12);
      const dateStr = formatLocalDate(currentDate);
      const holidayName = calendarMapsState.holidayMap[dateStr] || calendarMapsState.offdayMap[dateStr] || null;
      const holidayKind: 'holiday' | 'offday' | null = calendarMapsState.holidayMap[dateStr]
        ? 'holiday'
        : calendarMapsState.offdayMap[dateStr]
          ? 'offday'
          : null;
      const loggedHours = totalsByDate[dateStr] || 0;
      const expectedHours = isExpectedWorkingDay(dateStr, calendarMapsState) ? HOURS_PER_DAY : 0;
      const deltaHours = Math.round((loggedHours - expectedHours) * 100) / 100;
      const isFutureDay = dashboardPeriod === 'current' && dateStr > todayStr;

      let status: ConsistencyDayStatus = 'no-entry';
      if (loggedHours > 0) {
        if (expectedHours === 0) {
          status = 'excess';
        } else if (Math.abs(deltaHours) <= 0.01) {
          status = 'on-track';
        } else if (deltaHours < 0) {
          status = 'missing';
        } else {
          status = 'excess';
        }
      }

      days.push({
        key: `${year}-${month + 1}-${day}`,
        date: dateStr,
        dayLabel: day,
        holidayName,
        holidayKind,
        isHoliday: Boolean(holidayName),
        loggedHours,
        expectedHours,
        deltaHours,
        status,
        isFutureDay,
        isPaymentDay: paymentDays.has(dateStr)
      });
    }

    const totalCells = firstWeekDay + lastDay;
    const trailingEmptyCells = (7 - (totalCells % 7)) % 7;

    return {
      monthLabel: new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      weekDays: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'],
      leadingEmptyCells: firstWeekDay,
      trailingEmptyCells,
      paymentDays,
      days
    };
  }, [activeIndicators.month, activeIndicators.year, calendarMapsState, dashboardPeriod, entries]);

  const getConsistencyDayStyle = (day: ConsistencyDayCell) => {
    if (day.isHoliday) {
      return 'border-sky-300 bg-sky-100 text-sky-800';
    }

    const { status } = day;
    if (status === 'on-track') {
      return 'border-emerald-200 bg-emerald-100 text-emerald-800';
    }
    if (status === 'missing') {
      return 'border-amber-200 bg-amber-100 text-amber-800';
    }
    if (status === 'excess') {
      return 'border-rose-200 bg-rose-100 text-rose-800';
    }
    return 'border-slate-200 bg-white text-slate-500';
  };

  const getConsistencyTooltip = (day: ConsistencyDayCell) => {
    if (day.isHoliday && day.holidayName) {
      const holidayPrefix = day.holidayKind === 'offday' ? 'Folga/Ponte' : 'Feriado';
      if (day.loggedHours === 0) {
        return `${formatDateForDisplay(day.date)}\n${holidayPrefix}: ${day.holidayName}.`;
      }

      return `${formatDateForDisplay(day.date)}\n${holidayPrefix}: ${day.holidayName}.\nLançado: ${formatHours(day.loggedHours)}h.`;
    }

    if (day.isFutureDay && day.loggedHours === 0) {
      return `${formatDateForDisplay(day.date)}\nDia futuro sem lançamento.`;
    }

    if (day.loggedHours === 0) {
      return `${formatDateForDisplay(day.date)}\nSem registro de horas.`;
    }

    if (day.expectedHours === 0) {
      return `${formatDateForDisplay(day.date)}\nLançado: ${formatHours(day.loggedHours)}h\nSem carga esperada (feriado/folga/fim de semana).`;
    }

    if (Math.abs(day.deltaHours) <= 0.01) {
      return `${formatDateForDisplay(day.date)}\nLançado: ${formatHours(day.loggedHours)}h\nSem pendência.`;
    }

    if (day.deltaHours < 0) {
      return `${formatDateForDisplay(day.date)}\nLançado: ${formatHours(day.loggedHours)}h\nFaltam ${formatHours(Math.abs(day.deltaHours))}h.`;
    }

    return `${formatDateForDisplay(day.date)}\nLançado: ${formatHours(day.loggedHours)}h\nExcesso de ${formatHours(day.deltaHours)}h.`;
  };

    // lógica de filtro das entradas
  const displayEntries = entryFilterDate 
      ? entries.filter(e => e.date === entryFilterDate)
    : entries.slice(0, 20); // mostra as mais recentes

  if (loading && entries.length === 0) {
      return (
        <DashboardLoadingState
          title="Montando seu painel"
          subtitle="Buscando lancamentos, indicadores e pendencias do periodo..."
        />
      );
  }

  return (
    <div className="space-y-6">
      {shouldShowSubmissionPendingIndicator && (
        <button
          type="button"
          onClick={() => navigate('/timesheet')}
          className="relative w-full overflow-hidden rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-left transition-colors hover:bg-amber-100"
        >
          <span className="absolute inset-x-0 top-0 h-1 bg-amber-500" aria-hidden="true" />
          <div className="pt-1 text-xs text-amber-900">
            <span className="font-semibold">Pendência de envio:</span> {pendingPeriodLabel} ainda não foi enviado para aprovação do gestor.
          </div>
        </button>
      )}

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800">Meu Dashboard</h1>
            {isUserBirthdayToday && (
              <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                Feliz aniversário!
                <BirthdayBalloons className="h-7 w-12 shrink-0" />
              </div>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">Visão rápida do seu progresso no mês e pendências de lançamento</p>
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
        <div className={`${passiveCardClass} p-6`}>
            <div className="flex items-center gap-4">
            <div className="p-3 bg-brand-100 text-brand-600 rounded-lg transition-transform duration-300 group-hover:scale-105"><Clock size={24} /></div>
                <div>
                    <p className="text-sm text-slate-500 font-medium">Horas Realizadas</p>
                    <p className="text-2xl font-bold text-slate-900">{formatHours(activeIndicators.totalHours)}h</p>
                </div>
            </div>
            <div className="mt-4 w-full bg-gray-100 rounded-full h-2">
                <div className="bg-brand-600 h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min((activeIndicators.totalHours / (activeIndicators.expectedHours || 1)) * 100, 100)}%` }}></div>
            </div>
        </div>

        <div className={`${passiveCardClass} p-6`}>
            <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg transition-transform duration-300 group-hover:scale-105"><Calendar size={24} /></div>
                <div>
                    <p className="text-sm text-slate-500 font-medium">{expectedLabel}</p>
                    <p className="text-2xl font-bold text-slate-900">{formatHours(activeIndicators.expectedHours)}h</p>
                </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">{expectedHelpText}</p>
        </div>

        <div className={`${passiveCardClass} p-6`}>
            <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg transition-transform duration-300 group-hover:scale-105 ${activeIndicators.pendingHours > 0 ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
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
        </div>
      </div>

    {/* grid principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* coluna esquerda: gráfico + histórico */}
        <div className="lg:col-span-2 space-y-6">

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowPendingDetails(prev => !prev)}
                className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg ${activePendingSummary.days.length > 0 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {activePendingSummary.days.length > 0 ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Dias com pendência</p>
                    <p className="text-base font-bold text-slate-900">
                      {activePendingSummary.days.length > 0
                        ? `${activePendingSummary.days.length} dia(s) • ${formatHours(activePendingSummary.totalMissingHours)}h faltando`
                        : 'Nenhuma pendência no período'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {dashboardPeriod === 'current'
                        ? 'Resumo consolidado. Expanda para ver os detalhes.'
                        : 'Visão útil para revisar meses já encerrados.'}
                    </p>
                  </div>
                </div>
                <div className="text-slate-400">
                  {showPendingDetails ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </button>

              {showPendingDetails && (
                <div className="border-t border-slate-100 px-4 py-3">
                  {activePendingSummary.days.length > 0 ? (
                    <div className="space-y-2">
                      <div className="mb-2.5 flex flex-wrap gap-2">
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
                        <div key={day.date} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50/70 px-3.5 py-2.5">
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

            {/* gráfico */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-80 relative transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
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

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Calendário de Consistência</h3>
              <p className="text-[11px] capitalize text-slate-400">{consistencyCalendarData.monthLabel}</p>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-slate-400">
              {consistencyCalendarData.weekDays.map((day, index) => (
                <div key={`week-${day}-${index}`}>{day}</div>
              ))}
            </div>

            <div className="mt-1.5 grid grid-cols-7 gap-1">
              {Array.from({ length: consistencyCalendarData.leadingEmptyCells }).map((_, index) => (
                <div key={`empty-start-${index}`} className="h-8 rounded-md border border-transparent" />
              ))}

                {consistencyCalendarData.days.map((day) => (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => handleConsistencyDayClick(day)}
                  className={`group relative flex h-8 items-center justify-center rounded-md border text-xs font-semibold transition-colors hover:brightness-95 ${getConsistencyDayStyle(day)}`}
                  title={`${getConsistencyTooltip(day)}\n${day.loggedHours <= 0 && !isUserInactive && !isCurrentPeriodLocked ? 'Clique para lançar horas.' : 'Clique para abrir no relatório.'}`}
                >
                  <span>{day.dayLabel}</span>
                  {day.isPaymentDay && (
                    <span className="absolute bottom-0.5 right-0.5 text-[9px] opacity-70" aria-hidden="true">🎵</span>
                  )}
                  <div className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden w-44 -translate-x-1/2 -translate-y-full rounded-md bg-slate-900 px-2 py-1.5 text-[11px] font-medium leading-snug text-white shadow-xl group-hover:block">
                    {getConsistencyTooltip(day).split('\n').map((line) => (
                      <div key={`${day.key}-${line}`}>{line}</div>
                    ))}
                    {day.isPaymentDay && (
                      <div className="mt-0.5 text-[10px] font-normal text-slate-300">dia do pagode</div>
                    )}
                    <div className="mt-1 border-t border-slate-700 pt-1 text-[10px] text-slate-200">
                      {day.loggedHours <= 0 && !isUserInactive && !isCurrentPeriodLocked
                        ? 'Clique para lançar horas'
                        : 'Clique para abrir no relatório'}
                    </div>
                  </div>
                </button>
              ))}

              {Array.from({ length: consistencyCalendarData.trailingEmptyCells }).map((_, index) => (
                <div key={`empty-end-${index}`} className="h-8 rounded-md border border-transparent" />
              ))}
            </div>
          </div>

          {/* widget de avisos: só aparece se tiver algo */}
          {(notices.length > 0 || upcomingLeaves.length > 0) && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-800">
                <Bell size={15} />
                <span className="text-xs font-bold uppercase tracking-wide">Avisos</span>
              </div>

              {/* férias ou folgas próximas */}
              {upcomingLeaves.map((leave) => {
                const isVacation = leave.leaveTypeCode.toUpperCase() === 'FERIAS';
                const startFmt = formatDateForDisplay(leave.startDate);
                const endFmt = formatDateForDisplay(leave.endDate);
                const periodLabel = leave.startDate === leave.endDate ? startFmt : `${startFmt} a ${endFmt}`;
                return (
                  <div key={leave.id} className="rounded-lg bg-white border border-amber-200 p-3 text-xs">
                    <p className="font-semibold text-slate-800">
                      {isVacation ? '🏖️ Férias se aproximando' : '🗓️ Folga agendada'}
                    </p>
                    <p className="text-slate-600 mt-0.5">{periodLabel}</p>
                    {isVacation && (
                      <p className="text-slate-500 mt-1 leading-snug">
                        Alinhe suas atividades com seus pares e seu gestor.
                      </p>
                    )}
                  </div>
                );
              })}

              {/* avisos gerais do admin */}
              {notices.map((notice) => (
                <div key={notice.id} className="rounded-lg bg-white border border-amber-200 p-3 text-xs">
                  <p className="font-semibold text-slate-800">{notice.title}</p>
                  {notice.description && (
                    <p className="text-slate-600 mt-0.5 leading-snug">{notice.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <BirthdaySidebarCard
            monthlyBirthdays={monthlyBirthdays}
            upcomingBirthdays={nextMonthsBirthdays}
            title="Aniversariantes do Mês"
            subtitle="Resumo rápido do mês"
            showBirthdayBalloons={isUserBirthdayToday}
          />
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
                          <h3 className="text-sm font-semibold text-slate-800">Sugerido pra você</h3>
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
