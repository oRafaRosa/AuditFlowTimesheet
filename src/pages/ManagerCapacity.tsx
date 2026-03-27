import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { Filter, Loader2, Users, CalendarClock, TrendingUp, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { store } from '../services/store';
import { CalendarException, Holiday, Project, TimesheetEntry, User, UserArea, formatHours, formatPercentage } from '../types';
import { buildCalendarMaps, isExpectedWorkingDay } from '../utils/workCalendar';
import { formatDateForDisplay, formatLocalDate, parseDateOnly } from '../utils/date';

interface CapacityRow {
  userId: string;
  userName: string;
  requiresTimesheet?: boolean;
  area?: UserArea;
  areaLabel: string;
  managerId?: string;
  managerName: string;
  admissionDate: string;
  terminationDate?: string;
  availableYearHours: number;
  remainingYearHours: number;
  elapsedToDateHours: number;
  consumedToDateHours: number;
  missingTimesheetHours: number;
  overLoggedHours: number;
  utilizationPct: number;
  activeInYear: boolean;
}

type CapacitySortColumn =
  | 'userName'
  | 'areaLabel'
  | 'managerName'
  | 'admissionDate'
  | 'terminationDate'
  | 'availableYearHours'
  | 'remainingYearHours'
  | 'consumedToDateHours'
  | 'utilizationPct';

type AreaFilterValue = UserArea | '';

const NO_MANAGER_FILTER = 'SEM_GESTOR';

const HOURS_PER_DAY = 8.8;

const AREA_LABEL: Record<UserArea, string> = {
  AUDITORIA_INTERNA: 'Auditoria Interna',
  CONTROLES_INTERNOS: 'Controles Internos',
  COMPLIANCE: 'Compliance',
  CANAL_DENUNCIAS: 'Canal de Denúncias',
  GESTAO_RISCOS_DIGITAIS: 'Gestao de Riscos Digitais',
  OUTROS: 'Outros'
};

const BRAND_BLUE = '#0033C6';
const BRAND_BLUE_DARK = '#00248a';
const BRAND_BLUE_SOFT = '#dbe7ff';

const toDateKey = (d: Date) => formatLocalDate(d);

const maxDate = (a: Date, b: Date): Date => (a.getTime() >= b.getTime() ? a : b);
const minDate = (a: Date, b: Date): Date => (a.getTime() <= b.getTime() ? a : b);

const getUtilizationTone = (utilization: number) => {
  if (utilization >= 85) {
    return {
      badge: 'bg-red-100 text-red-700',
      bar: '#dc2626'
    };
  }

  if (utilization >= 70) {
    return {
      badge: 'bg-amber-100 text-amber-700',
      bar: '#d97706'
    };
  }

  return {
    badge: 'bg-brand-50 text-brand-700',
    bar: BRAND_BLUE
  };
};

const countWorkingDays = (start: Date, end: Date, holidays: Holiday[], exceptions: CalendarException[]): number => {
  if (start.getTime() > end.getTime()) return 0;

  const maps = buildCalendarMaps(holidays, exceptions);
  let total = 0;

  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const dateStr = toDateKey(cursor);
    if (isExpectedWorkingDay(dateStr, maps)) {
      total += 1;
    }
  }

  return total;
};

export const ManagerCapacity: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [exceptions, setExceptions] = useState<CalendarException[]>([]);

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [selectedArea, setSelectedArea] = useState<AreaFilterValue>('');
  const [nameFilter, setNameFilter] = useState('');
  const [showTimesheetGapDetails, setShowTimesheetGapDetails] = useState(false);
  const [sortColumn, setSortColumn] = useState<CapacitySortColumn>('utilizationPct');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const currentUser = store.getCurrentUser();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [allUsers, allProjects, allEntries, allHolidays, allExceptions] = await Promise.all([
        store.getUsers(),
        store.getProjects(),
        store.getEntries(),
        store.getHolidays(),
        store.getExceptions()
      ]);

      setUsers(allUsers);
      setProjects(allProjects);
      setEntries(allEntries);
      setHolidays(allHolidays);
      setExceptions(allExceptions);
      setLoading(false);
    };

    loadData();
  }, []);

  const scopedUsers = useMemo(() => {
    if (!currentUser) return [] as User[];

    if (currentUser.role === 'ADMIN') {
      return users;
    }

    const managedIds = new Set<string>([currentUser.id]);
    let changed = true;

    while (changed) {
      changed = false;
      users.forEach((user) => {
        if (user.managerId && managedIds.has(user.managerId) && !managedIds.has(user.id)) {
          managedIds.add(user.id);
          changed = true;
        }
      });
    }

    return users.filter((user) => managedIds.has(user.id));
  }, [users, currentUser]);

  const managerMap = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  const managerOptions = useMemo(() => {
    return scopedUsers.filter((u) => u.role === 'MANAGER' || u.role === 'ADMIN');
  }, [scopedUsers]);

  const selectedManagerScopeIds = useMemo(() => {
    if (!selectedManagerId || selectedManagerId === NO_MANAGER_FILTER) return new Set<string>();

    const scope = new Set<string>([selectedManagerId]);
    let changed = true;

    while (changed) {
      changed = false;

      scopedUsers.forEach((user) => {
        if (user.managerId && scope.has(user.managerId) && !scope.has(user.id)) {
          scope.add(user.id);
          changed = true;
        }
      });
    }

    // Se o gestor selecionado recebeu delegação, exclui do filtro os gestores titulares
    // que delegaram para ele e toda a subárvore desses gestores.
    const delegatedRoots = new Set(
      scopedUsers
        .filter((user) => user.id !== selectedManagerId)
        .filter((user) => user.delegatedManagerId === selectedManagerId)
        .map((user) => user.id)
    );

    if (delegatedRoots.size > 0) {
      const blockedIds = new Set<string>(delegatedRoots);
      let blockedChanged = true;

      while (blockedChanged) {
        blockedChanged = false;

        scopedUsers.forEach((user) => {
          if (user.managerId && blockedIds.has(user.managerId) && !blockedIds.has(user.id)) {
            blockedIds.add(user.id);
            blockedChanged = true;
          }
        });
      }

      blockedIds.forEach((id) => scope.delete(id));
    }

    return scope;
  }, [selectedManagerId, scopedUsers]);

  const visibleProjects = useMemo(() => {
    if (!currentUser) return [] as Project[];

    if (currentUser.role === 'ADMIN') return projects;

    return projects.filter((project) => !project.allowedManagerIds?.length || project.allowedManagerIds.includes(currentUser.id));
  }, [projects, currentUser]);

  const scopedProjects = useMemo(() => {
    return visibleProjects
      .filter((project) => project.active)
      .filter((project) => {
        if (!selectedManagerId) return true;
        if (selectedManagerId === NO_MANAGER_FILTER) return !project.allowedManagerIds?.length;
        return !project.allowedManagerIds?.length || project.allowedManagerIds.some((managerId) => selectedManagerScopeIds.has(managerId));
      })
      .filter((project) => {
        if (!selectedArea) return true;
        return project.area === selectedArea;
      });
  }, [visibleProjects, selectedManagerId, selectedArea, selectedManagerScopeIds]);

  const rows = useMemo(() => {
    const today = parseDateOnly(formatLocalDate());
    const yearStart = new Date(selectedYear, 0, 1, 12);
    const yearEnd = new Date(selectedYear, 11, 31, 12);

    const entriesByUser = new Map<string, TimesheetEntry[]>();
    entries.forEach((entry) => {
      const list = entriesByUser.get(entry.userId) || [];
      list.push(entry);
      entriesByUser.set(entry.userId, list);
    });

    const filteredRows = scopedUsers
      .filter((u) => {
        // Só exclui quem está marcado como "sem timesheet".
        return u.requiresTimesheet !== false;
      })
      .filter((u) => {
        if (u.isActive !== false) return true;
        if (!u.terminationDate) return false;

        return parseDateOnly(u.terminationDate).getFullYear() === selectedYear;
      })
      .filter((u) => {
        if (!selectedManagerId) return true;
        if (selectedManagerId === NO_MANAGER_FILTER) return !u.managerId;
        return selectedManagerScopeIds.has(u.id);
      })
      .filter((u) => {
        if (!selectedArea) return true;
        return u.area === selectedArea;
      })
      .filter((u) => !nameFilter.trim() || u.name.toLowerCase().includes(nameFilter.toLowerCase().trim()))
      .map((u) => {
        const admissionDate = u.admissionDate || '2020-01-01';
        const terminationDate = u.terminationDate;
        const area = u.area;

        const hireDate = parseDateOnly(admissionDate);
        const endContractDate = terminationDate ? parseDateOnly(terminationDate) : yearEnd;

        const effectiveStart = maxDate(yearStart, hireDate);
        const effectiveEnd = minDate(yearEnd, endContractDate);

        const activeInYear = effectiveStart.getTime() <= effectiveEnd.getTime();

        const availableYearWorkingDays = activeInYear
          ? countWorkingDays(effectiveStart, effectiveEnd, holidays, exceptions)
          : 0;

        const availableYearHours = availableYearWorkingDays * HOURS_PER_DAY;

        const consumedWindowEnd = minDate(today, effectiveEnd);
        const consumedStartKey = toDateKey(effectiveStart);
        const consumedEndKey = toDateKey(consumedWindowEnd);

        const userEntries = entriesByUser.get(u.id) || [];
        const consumedToDateHours = activeInYear
          ? Math.round(userEntries
              .filter((entry) => entry.date >= consumedStartKey && entry.date <= consumedEndKey)
              .reduce((sum, entry) => sum + entry.hours, 0) * 100) / 100
          : 0;

        const remainingStart = maxDate(today, effectiveStart);
        const remainingWorkingDays = activeInYear
          ? countWorkingDays(remainingStart, effectiveEnd, holidays, exceptions)
          : 0;

        const remainingYearHours = remainingWorkingDays * HOURS_PER_DAY;

        const elapsedToDateHours = activeInYear
          ? Math.max(availableYearHours - remainingYearHours, 0)
          : 0;

        const missingTimesheetHours = Math.max(elapsedToDateHours - consumedToDateHours, 0);
        const overLoggedHours = Math.max(consumedToDateHours - elapsedToDateHours, 0);

        const managerId = u.managerId || undefined;
        const managerName = managerId ? managerMap.get(managerId)?.name || 'Sem Gestor' : 'Sem Gestor';

        const utilizationPct = availableYearHours > 0
          ? Math.min((consumedToDateHours / availableYearHours) * 100, 999)
          : 0;

        return {
          userId: u.id,
          userName: u.name,
          requiresTimesheet: u.requiresTimesheet,
          area,
          areaLabel: area ? AREA_LABEL[area] : '-',
          managerId,
          managerName,
          admissionDate,
          terminationDate,
          availableYearHours,
          remainingYearHours,
          elapsedToDateHours,
          consumedToDateHours,
          missingTimesheetHours,
          overLoggedHours,
          utilizationPct,
          activeInYear
        } as CapacityRow;
      })
      .filter((row) => row.activeInYear)
      .sort((a, b) => b.utilizationPct - a.utilizationPct);

    return filteredRows.sort((a, b) => {
      const directionFactor = sortDirection === 'asc' ? 1 : -1;

      if (sortColumn === 'terminationDate') {
        const valueA = a.terminationDate || '';
        const valueB = b.terminationDate || '';
        return valueA.localeCompare(valueB, 'pt-BR') * directionFactor;
      }

      if (sortColumn === 'admissionDate' || sortColumn === 'userName' || sortColumn === 'areaLabel' || sortColumn === 'managerName') {
        return String(a[sortColumn]).localeCompare(String(b[sortColumn]), 'pt-BR') * directionFactor;
      }

      return ((a[sortColumn] as number) - (b[sortColumn] as number)) * directionFactor;
    });
  }, [
    scopedUsers,
    entries,
    holidays,
    exceptions,
    selectedYear,
    selectedManagerId,
    selectedManagerScopeIds,
    selectedArea,
    nameFilter,
    managerMap,
    sortColumn,
    sortDirection
  ]);

  const applyChartFilters = ({ managerId = '', area = '', clearName = true }: { managerId?: string; area?: AreaFilterValue; clearName?: boolean }) => {
    setSelectedManagerId(managerId);
    setSelectedArea(area);
    if (clearName) setNameFilter('');
  };

  const openManagerReportByUser = (userId: string) => {
    navigate(`/manager/reports?userId=${userId}`);
  };

  const clearAllFilters = () => {
    setSelectedYear(currentYear);
    setSelectedManagerId('');
    setSelectedArea('');
    setNameFilter('');
    setShowTimesheetGapDetails(false);
  };

  const handleSort = (column: CapacitySortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortColumn(column);
    setSortDirection(column === 'userName' || column === 'areaLabel' || column === 'managerName' || column === 'admissionDate' || column === 'terminationDate' ? 'asc' : 'desc');
  };

  const SortIcon = ({ column }: { column: CapacitySortColumn }) => {
    if (sortColumn !== column) return <ArrowUpDown size={14} className="text-slate-400" />;
    return sortDirection === 'asc'
      ? <ArrowUp size={14} className="text-[#0033C6]" />
      : <ArrowDown size={14} className="text-[#0033C6]" />;
  };

  const summary = useMemo(() => {
    const totalAvailableYear = rows.reduce((sum, row) => sum + row.availableYearHours, 0);
    const totalRemainingYear = rows.reduce((sum, row) => sum + row.remainingYearHours, 0);
    const totalConsumedToDate = rows.reduce((sum, row) => sum + row.consumedToDateHours, 0);
    const totalElapsedYear = Math.max(totalAvailableYear - totalRemainingYear, 0);
    const totalMissingTimesheetHours = rows.reduce((sum, row) => sum + row.missingTimesheetHours, 0);
    const totalOverLoggedHours = rows.reduce((sum, row) => sum + row.overLoggedHours, 0);

    const utilization = totalAvailableYear > 0
      ? (totalConsumedToDate / totalAvailableYear) * 100
      : 0;

    return {
      totalAvailableYear,
      totalRemainingYear,
      totalConsumedToDate,
      totalElapsedYear,
      totalMissingTimesheetHours,
      totalOverLoggedHours,
      utilization
    };
  }, [rows]);

  const budgetSummary = useMemo(() => {
    const totalBudgetedHours = scopedProjects.reduce((sum, project) => sum + project.budgetedHours, 0);

    return {
      totalBudgetedHours,
      budgetVsCapacityPct: summary.totalAvailableYear > 0 ? (totalBudgetedHours / summary.totalAvailableYear) * 100 : 0,
      consumedVsBudgetPct: totalBudgetedHours > 0 ? (summary.totalConsumedToDate / totalBudgetedHours) * 100 : 0
    };
  }, [scopedProjects, summary.totalAvailableYear, summary.totalConsumedToDate]);

  const byTeamChart = useMemo(() => {
    const grouped = new Map<string, { team: string; managerFilter: string; consumed: number; available: number; remaining: number; members: number }>();

    rows.forEach((row) => {
      const key = row.managerId || NO_MANAGER_FILTER;
      const current = grouped.get(key) || {
        team: row.managerName,
        managerFilter: key,
        consumed: 0,
        available: 0,
        remaining: 0,
        members: 0
      };

      current.consumed += row.consumedToDateHours;
      current.available += row.availableYearHours;
      current.remaining += row.remainingYearHours;
      current.members += 1;
      grouped.set(key, current);
    });

    return [...grouped.values()]
      .map((item) => ({
        ...item,
        utilization: item.available > 0 ? (item.consumed / item.available) * 100 : 0
      }))
      .sort((a, b) => b.consumed - a.consumed)
      .slice(0, 6);
  }, [rows]);

  const byAreaChart = useMemo(() => {
    const grouped = new Map<string, { area: string; areaFilter: AreaFilterValue; consumed: number; available: number; budgeted: number }>();

    rows.forEach((row) => {
      if (!row.area) return;

      const key = row.area;
      const current = grouped.get(key) || { area: row.areaLabel, areaFilter: key as AreaFilterValue, consumed: 0, available: 0, budgeted: 0 };
      current.consumed += row.consumedToDateHours;
      current.available += row.availableYearHours;
      grouped.set(key, current);
    });

    scopedProjects.forEach((project) => {
      if (!project.area) return;

      const key = project.area;
      const current = grouped.get(key) || {
        area: AREA_LABEL[project.area],
        areaFilter: key as AreaFilterValue,
        consumed: 0,
        available: 0,
        budgeted: 0
      };
      current.budgeted += project.budgetedHours;
      grouped.set(key, current);
    });

    return [...grouped.values()]
      .map((item) => ({
        ...item,
        utilization: item.available > 0 ? (item.consumed / item.available) * 100 : 0
      }))
      .sort((a, b) => Math.max(b.available, b.budgeted) - Math.max(a.available, a.budgeted));
  }, [rows, scopedProjects]);

  const highConsumptionHighlights = useMemo(() => {
    return rows
      .filter((row) => row.utilizationPct >= 85)
      .slice(0, 8);
  }, [rows]);

  const timesheetGapHighlights = useMemo(() => {
    return rows
      .filter((row) => row.requiresTimesheet !== false)
      .filter((row) => row.missingTimesheetHours > 0.1)
      .sort((a, b) => b.missingTimesheetHours - a.missingTimesheetHours)
      .slice(0, 12);
  }, [rows]);

  const timesheetGapSummary = useMemo(() => {
    const eligibleRows = rows.filter((row) => row.requiresTimesheet !== false);

    const elapsedHours = eligibleRows.reduce((sum, row) => sum + row.elapsedToDateHours, 0);
    const consumedHours = eligibleRows.reduce((sum, row) => sum + row.consumedToDateHours, 0);
    const missingHours = eligibleRows.reduce((sum, row) => sum + row.missingTimesheetHours, 0);
    const overLoggedHours = eligibleRows.reduce((sum, row) => sum + row.overLoggedHours, 0);

    return {
      elapsedHours,
      consumedHours,
      missingHours,
      overLoggedHours
    };
  }, [rows]);

  const allocationByArea = useMemo(() => {
    return byAreaChart.map((item) => {
      const allocatable = item.available - item.budgeted;
      return {
        ...item,
        allocatable,
        budgetPressurePct: item.available > 0 ? (item.budgeted / item.available) * 100 : 0
      };
    });
  }, [byAreaChart]);

  const allocationSummary = useMemo(() => {
    const totalAllocatableHours = summary.totalAvailableYear - budgetSummary.totalBudgetedHours;
    const overAllocatedAreas = allocationByArea.filter((item) => item.allocatable < 0).length;

    return {
      totalAllocatableHours,
      overAllocatedAreas
    };
  }, [summary.totalAvailableYear, budgetSummary.totalBudgetedHours, allocationByArea]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin text-brand-600" size={44} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Capacity da Equipe</h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Visão consolidada de horas disponíveis e consumidas em {selectedYear}, considerando admissão,
            desligamento, feriados e dias úteis.
          </p>
        </div>
        <div className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
          Atualizado em {new Date().toLocaleDateString('pt-BR')} as {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </section>

      <section className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-slate-700">
          <div className="flex items-center gap-2 font-semibold">
            <Filter size={16} />
            Filtros Analíticos
          </div>
          <button
            type="button"
            onClick={clearAllFilters}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50"
            title="Limpa todos os filtros aplicados e volta para o padrão."
          >
            Limpar todos os filtros
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-slate-500 font-bold mb-1">Ano</label>
            <input
              type="number"
              className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              value={selectedYear}
              min={2020}
              max={2100}
              onChange={(e) => setSelectedYear(Number(e.target.value) || new Date().getFullYear())}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-bold mb-1">Equipe (Gestor)</label>
            <select
              className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              value={selectedManagerId}
              onChange={(e) => setSelectedManagerId(e.target.value)}
            >
              <option value="">Todas</option>
              <option value={NO_MANAGER_FILTER}>Sem Gestor</option>
              {managerOptions.map((manager) => (
                <option key={manager.id} value={manager.id}>{manager.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-bold mb-1">Área</label>
            <select
              className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              value={selectedArea}
              onChange={(e) => setSelectedArea((e.target.value || '') as AreaFilterValue)}
            >
              <option value="">Todas</option>
              {Object.entries(AREA_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="xl:col-span-2">
            <label className="block text-xs text-slate-500 font-bold mb-1">Colaborador</label>
            <input
              className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Filtrar por nome"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 font-bold uppercase">Horas disponíveis no ano</p>
          <p className="mt-2 text-2xl font-bold text-slate-800">{formatHours(summary.totalAvailableYear)}</p>
          <p className="text-xs text-slate-500 mt-1">Base total de capacidade anual</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 font-bold uppercase">Horas de hoje até 31/12</p>
          <p className="mt-2 text-2xl font-bold text-slate-800">{formatHours(summary.totalRemainingYear)}</p>
          <p className="text-xs text-slate-500 mt-1">Disponibilidade restante do ano</p>
        </div>

        <button
          type="button"
          onClick={() => setShowTimesheetGapDetails((prev) => !prev)}
          className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 text-left transition-colors hover:border-brand-200 hover:bg-brand-50/30"
          title="Clique para ver quem pode estar sem apontamento correto de timesheet."
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-slate-500 font-bold uppercase">Horas consumidas até hoje</p>
            <span className="relative group inline-flex shrink-0">
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-bold leading-none text-slate-500"
                aria-label="Informacoes do calculo"
              >
                !
              </span>
              <span className="pointer-events-none absolute right-0 top-6 z-20 hidden w-72 rounded-lg border border-slate-200 bg-white p-3 text-[11px] font-medium leading-relaxed text-slate-600 shadow-lg group-hover:block">
                <p>Com base nas horas apontadas no timesheet.</p>
                <p className="mt-2">{formatHours(timesheetGapSummary.elapsedHours)}h uteis ja decorridas ate hoje no ano (somente quem exige timesheet).</p>
                <p className="mt-2">Gap estimado de apontamento: {formatHours(timesheetGapSummary.missingHours)}h.</p>
              </span>
            </span>
          </div>
          <p className="mt-2 text-2xl font-bold text-brand-700">{formatHours(summary.totalConsumedToDate)}</p>
          <p className="text-xs text-slate-500 mt-1">Com base nas horas apontadas no timesheet</p>
        </button>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 font-bold uppercase">Taxa de consumo</p>
          <p className="mt-2 text-2xl font-bold text-brand-700">{formatPercentage(summary.utilization)}%</p>
          <p className="text-xs text-slate-500 mt-1">Consumido / disponível no ano</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 font-bold uppercase">Horas orçadas em projetos</p>
          <p className="mt-2 text-2xl font-bold text-slate-800">{formatHours(budgetSummary.totalBudgetedHours)}</p>
          <p className="text-xs text-slate-500 mt-1">{formatPercentage(budgetSummary.budgetVsCapacityPct)}% do capacity visível no recorte</p>
        </div>
      </section>

      {showTimesheetGapDetails && (
        <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold text-slate-800">Diferenças de Timesheet (Decorrido vs Consumido)</h2>
            <p className="text-sm text-slate-500">
              Esta análise compara horas úteis já decorridas no ano com horas registradas no timesheet para identificar provável falta de apontamento.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-[11px] font-bold uppercase text-amber-700">Gap total sem apontamento</p>
              <p className="mt-1 text-lg font-bold text-amber-700">{formatHours(timesheetGapSummary.missingHours)}h</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-bold uppercase text-slate-600">Horas decorridas no recorte</p>
              <p className="mt-1 text-lg font-bold text-slate-800">{formatHours(timesheetGapSummary.elapsedHours)}h</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-bold uppercase text-slate-600">Apontamento acima do decorrido</p>
              <p className="mt-1 text-lg font-bold text-slate-800">{formatHours(timesheetGapSummary.overLoggedHours)}h</p>
            </div>
          </div>

          {timesheetGapHighlights.length === 0 ? (
            <p className="text-sm text-slate-500">Não foram encontrados gaps relevantes de apontamento para os filtros atuais.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Colaborador</th>
                    <th className="py-2 pr-3">Área</th>
                    <th className="py-2 pr-3">Equipe</th>
                    <th className="py-2 pr-3 text-right">Decorrido</th>
                    <th className="py-2 pr-3 text-right">Consumido</th>
                    <th className="py-2 pr-0 text-right">Gap sem apontar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {timesheetGapHighlights.map((row) => (
                    <tr key={row.userId} className="hover:bg-slate-50">
                      <td className="py-2 pr-3 font-medium text-slate-800">
                        <button
                          type="button"
                          onClick={() => openManagerReportByUser(row.userId)}
                          className="text-left text-brand-700 hover:text-brand-800 hover:underline"
                          title="Abrir Relatórios Gerenciais filtrado para este colaborador"
                        >
                          {row.userName}
                        </button>
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{row.areaLabel}</td>
                      <td className="py-2 pr-3 text-slate-600">{row.managerName}</td>
                      <td className="py-2 pr-3 text-right text-slate-600">{formatHours(row.elapsedToDateHours)}h</td>
                      <td className="py-2 pr-3 text-right text-slate-600">{formatHours(row.consumedToDateHours)}h</td>
                      <td className="py-2 pr-0 text-right font-semibold text-amber-700">{formatHours(row.missingTimesheetHours)}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-brand-600" />
            <h2 className="font-semibold text-slate-800">Capacity por Equipe</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {byTeamChart.map((item) => {
              const tone = getUtilizationTone(item.utilization);

              return (
              <button
                key={item.team}
                type="button"
                onClick={() => applyChartFilters({ managerId: item.managerFilter })}
                className="rounded-xl border border-slate-200 p-4 text-left transition-colors hover:border-brand-200 hover:bg-brand-50/40"
                title="Clique para filtrar a tela por esta equipe."
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">{item.team}</h3>
                    <p className="mt-1 text-xs text-slate-500">{item.members} colaborador(es) no recorte</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone.badge}`}>
                    {formatPercentage(item.utilization)}%
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-bold uppercase text-slate-500">Capacity</p>
                    <p className="mt-1 font-semibold text-slate-900">{formatHours(item.available)}h</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-bold uppercase text-slate-500">Consumido</p>
                    <p className="mt-1 font-semibold text-slate-900">{formatHours(item.consumed)}h</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-bold uppercase text-slate-500">Restante</p>
                    <p className="mt-1 font-semibold text-slate-900">{formatHours(item.remaining)}h</p>
                  </div>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(item.utilization, 100)}%`, backgroundColor: tone.bar }} />
                </div>
              </button>
            )})}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarClock size={18} className="text-brand-600" />
            <h2 className="font-semibold text-slate-800">Visão Geral</h2>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Consumido', value: summary.totalConsumedToDate },
                      { name: 'Restante', value: summary.totalRemainingYear }
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={54}
                    outerRadius={78}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    <Cell fill={BRAND_BLUE_DARK} />
                    <Cell fill={BRAND_BLUE_SOFT} />
                  </Pie>
                  <Tooltip formatter={(value: any) => `${formatHours(Number(value))}h`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-bold uppercase text-slate-500">Consumido</p>
                <p className="mt-1 text-lg font-bold text-slate-800">{formatHours(summary.totalConsumedToDate)}h</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-[11px] font-bold uppercase text-slate-500">Restante</p>
                <p className="mt-1 text-lg font-bold text-slate-800">{formatHours(summary.totalRemainingYear)}h</p>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <span>Taxa de consumo atual</span>
                <strong className="text-slate-900">{formatPercentage(summary.utilization)}%</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-slate-800">Disponibilidade para Alocação em Projetos</h2>
            <p className="text-sm text-slate-500">Comparativo entre capacidade anual disponível e horas orçadas em projetos no recorte atual.</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase text-slate-500">Saldo total para alocar</p>
            <p className={`text-2xl font-bold ${allocationSummary.totalAllocatableHours >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {formatHours(allocationSummary.totalAllocatableHours)}h
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-bold uppercase text-slate-500">Capacidade anual visível</p>
            <p className="mt-1 text-lg font-bold text-slate-800">{formatHours(summary.totalAvailableYear)}h</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-bold uppercase text-slate-500">Horas orçadas em projetos</p>
            <p className="mt-1 text-lg font-bold text-slate-800">{formatHours(budgetSummary.totalBudgetedHours)}h</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-bold uppercase text-slate-500">Orçado / Capacidade</p>
            <p className="mt-1 text-lg font-bold text-slate-800">{formatPercentage(budgetSummary.budgetVsCapacityPct)}%</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-bold uppercase text-slate-500">Áreas com déficit</p>
            <p className="mt-1 text-lg font-bold text-slate-800">{allocationSummary.overAllocatedAreas}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2 pr-3">Área</th>
                <th className="py-2 pr-3 text-right">Capacidade</th>
                <th className="py-2 pr-3 text-right">Orçado</th>
                <th className="py-2 pr-3 text-right">Saldo alocável</th>
                <th className="py-2 pr-0 text-right">Alocado em projetos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allocationByArea.map((row) => (
                <tr key={row.area} className="hover:bg-slate-50">
                  <td className="py-2 pr-3 font-medium text-slate-800">{row.area}</td>
                  <td className="py-2 pr-3 text-right text-slate-600">{formatHours(row.available)}h</td>
                  <td className="py-2 pr-3 text-right text-slate-600">{formatHours(row.budgeted)}h</td>
                  <td className={`py-2 pr-3 text-right font-semibold ${row.allocatable >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {formatHours(row.allocatable)}h
                  </td>
                  <td className="py-2 pr-0 text-right text-slate-600">{formatPercentage(row.budgetPressurePct)}%</td>
                </tr>
              ))}
              {allocationByArea.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">Sem dados de área para o recorte atual.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-brand-600" />
            <h2 className="font-semibold text-slate-800">Capacidade vs Consumo vs Orçado por Área</h2>
          </div>
          <div className="h-[380px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byAreaChart} layout="vertical" margin={{ top: 8, right: 16, left: 24, bottom: 8 }} barCategoryGap={14}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="area" width={160} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value: any) => `${formatHours(Number(value))}h`} />
                <Bar dataKey="available" name="Capacity" fill={BRAND_BLUE_SOFT} radius={[0, 6, 6, 0]} onClick={(data: any) => applyChartFilters({ area: data?.areaFilter })} />
                <Bar dataKey="consumed" name="Consumido" fill={BRAND_BLUE_DARK} radius={[0, 6, 6, 0]} onClick={(data: any) => applyChartFilters({ area: data?.areaFilter })} />
                <Bar dataKey="budgeted" name="Orçado" fill="#64748b" radius={[0, 6, 6, 0]} onClick={(data: any) => applyChartFilters({ area: data?.areaFilter })} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-xs text-slate-500">Clique em uma barra para filtrar automaticamente a tela pela área selecionada e comparar capacidade, consumo e orçamento cadastrado.</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-amber-600" />
            <h2 className="font-semibold text-slate-800">Alertas de Consumo</h2>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600 mb-4">
            <div className="flex items-center justify-between gap-3">
              <span>Consumo sobre orçamento visível</span>
              <strong className="text-slate-900">{formatPercentage(budgetSummary.consumedVsBudgetPct)}%</strong>
            </div>
          </div>
          {highConsumptionHighlights.length === 0 ? (
            <p className="text-sm text-slate-500">Sem alertas de consumo acima de 85% para o recorte atual.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {highConsumptionHighlights.map((row) => (
                <button
                  key={row.userId}
                  type="button"
                  onClick={() => {
                    setSelectedManagerId(row.managerId || NO_MANAGER_FILTER);
                    setSelectedArea((row.area || '') as AreaFilterValue);
                    setNameFilter(row.userName);
                  }}
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-left transition-colors hover:border-red-300 hover:bg-red-100"
                  title="Clique para filtrar a tela por este colaborador."
                >
                  <p className="text-sm font-semibold text-red-700">{row.userName}</p>
                  <p className="mt-1 text-xs text-red-700">{row.areaLabel} • {row.managerName}</p>
                  <p className="mt-2 text-xs text-red-700">
                    {formatHours(row.consumedToDateHours)}h consumidas de {formatHours(row.availableYearHours)}h
                  </p>
                  <p className="mt-1 text-xs font-bold text-red-700">{formatPercentage(row.utilizationPct)}% de consumo</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-800">Visão por Colaborador</h2>
          <span className="text-xs text-slate-500">{rows.length} colaborador(es) no recorte</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white border-b border-slate-200 text-slate-500 font-semibold">
              <tr>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors" onClick={() => handleSort('userName')} title="Nome do colaborador considerado no recorte atual de capacity.">
                    Colaborador
                    <SortIcon column="userName" />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors" onClick={() => handleSort('areaLabel')} title="Área organizacional cadastrada para o colaborador.">
                    Área
                    <SortIcon column="areaLabel" />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors" onClick={() => handleSort('managerName')} title="Equipe do colaborador com base no gestor responsável.">
                    Equipe
                    <SortIcon column="managerName" />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors" onClick={() => handleSort('admissionDate')} title="Data de admissão usada para iniciar o cálculo das horas disponíveis dentro do ano selecionado.">
                    Admissão
                    <SortIcon column="admissionDate" />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors" onClick={() => handleSort('terminationDate')} title="Data de desligamento usada para encerrar o cálculo quando o colaborador saiu durante o ano selecionado.">
                    Desligamento
                    <SortIcon column="terminationDate" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right">
                  <button type="button" className="inline-flex items-center justify-end gap-2 hover:text-slate-700 transition-colors w-full" onClick={() => handleSort('availableYearHours')} title="Total de horas úteis disponíveis no ano, considerando admissão, desligamento, feriados e exceções do calendário.">
                    Disponível no ano
                    <SortIcon column="availableYearHours" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right">
                  <button type="button" className="inline-flex items-center justify-end gap-2 hover:text-slate-700 transition-colors w-full" onClick={() => handleSort('remainingYearHours')} title="Total de horas disponíveis de hoje até 31/12, calculado com base nos colaboradores ativos no período restante do ano.">
                    Disponível até 31/12
                    <SortIcon column="remainingYearHours" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right">
                  <button type="button" className="inline-flex items-center justify-end gap-2 hover:text-slate-700 transition-colors w-full" onClick={() => handleSort('consumedToDateHours')} title="Horas já lançadas pelo colaborador do início do recorte até a data de hoje.">
                    Consumido até hoje
                    <SortIcon column="consumedToDateHours" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right">
                  <button type="button" className="inline-flex items-center justify-end gap-2 hover:text-slate-700 transition-colors w-full" onClick={() => handleSort('utilizationPct')} title="Percentual consumido em relação à disponibilidade total do ano para o colaborador.">
                    % Consumo
                    <SortIcon column="utilizationPct" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.userId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{row.userName}</td>
                  <td className="px-4 py-3 text-slate-600">{row.areaLabel}</td>
                  <td className="px-4 py-3 text-slate-600">{row.managerName}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDateForDisplay(row.admissionDate)}</td>
                  <td className="px-4 py-3 text-slate-600">{row.terminationDate ? formatDateForDisplay(row.terminationDate) : '-'}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatHours(row.availableYearHours)}h</td>
                  <td className="px-4 py-3 text-right">{formatHours(row.remainingYearHours)}h</td>
                  <td className="px-4 py-3 text-right">{formatHours(row.consumedToDateHours)}h</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${getUtilizationTone(row.utilizationPct).badge}`}>
                      {formatPercentage(row.utilizationPct)}%
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                    Nenhum colaborador encontrado para os filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
