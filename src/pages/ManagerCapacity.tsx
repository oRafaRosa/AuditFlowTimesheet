import React, { useEffect, useMemo, useState } from 'react';
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
  area?: UserArea;
  areaLabel: string;
  managerId?: string;
  managerName: string;
  admissionDate: string;
  terminationDate?: string;
  availableYearHours: number;
  remainingYearHours: number;
  consumedToDateHours: number;
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

type AreaFilterValue = UserArea | '' | 'SEM_AREA';

const NO_MANAGER_FILTER = 'SEM_GESTOR';

const HOURS_PER_DAY = 8.8;

const AREA_LABEL: Record<UserArea, string> = {
  AUDITORIA_INTERNA: 'Auditoria Interna',
  CONTROLES_INTERNOS: 'Controles Internos',
  COMPLIANCE: 'Compliance',
  CANAL_DENUNCIAS: 'Canal de Denuncias',
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
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [exceptions, setExceptions] = useState<CalendarException[]>([]);

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [selectedArea, setSelectedArea] = useState<AreaFilterValue>('');
  const [nameFilter, setNameFilter] = useState('');
  const [includeWithoutTimesheet, setIncludeWithoutTimesheet] = useState(false);
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
        return !project.allowedManagerIds?.length || project.allowedManagerIds.includes(selectedManagerId);
      })
      .filter((project) => {
        if (!selectedArea) return true;
        if (selectedArea === 'SEM_AREA') return !project.area;
        return project.area === selectedArea;
      });
  }, [visibleProjects, selectedManagerId, selectedArea]);

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
        const isLeadershipWithoutTimesheet = (u.role === 'MANAGER' || u.role === 'ADMIN') && u.requiresTimesheet === false;
        return !isLeadershipWithoutTimesheet;
      })
      .filter((u) => {
        if (u.isActive !== false) return true;
        if (!u.terminationDate) return false;

        return parseDateOnly(u.terminationDate).getFullYear() === selectedYear;
      })
      .filter((u) => includeWithoutTimesheet || u.requiresTimesheet !== false)
      .filter((u) => {
        if (!selectedManagerId) return true;
        if (selectedManagerId === NO_MANAGER_FILTER) return !u.managerId;
        return u.id === selectedManagerId || u.managerId === selectedManagerId;
      })
      .filter((u) => {
        if (!selectedArea) return true;
        if (selectedArea === 'SEM_AREA') return !u.area;
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
          ? userEntries
              .filter((entry) => entry.date >= consumedStartKey && entry.date <= consumedEndKey)
              .reduce((sum, entry) => sum + entry.hours, 0)
          : 0;

        const remainingStart = maxDate(today, effectiveStart);
        const remainingWorkingDays = activeInYear
          ? countWorkingDays(remainingStart, effectiveEnd, holidays, exceptions)
          : 0;

        const remainingYearHours = remainingWorkingDays * HOURS_PER_DAY;

        const managerId = u.managerId || undefined;
        const managerName = managerId ? managerMap.get(managerId)?.name || 'Sem Gestor' : 'Sem Gestor';

        const utilizationPct = availableYearHours > 0
          ? Math.min((consumedToDateHours / availableYearHours) * 100, 999)
          : 0;

        return {
          userId: u.id,
          userName: u.name,
          area,
          areaLabel: area ? AREA_LABEL[area] : 'Sem area',
          managerId,
          managerName,
          admissionDate,
          terminationDate,
          availableYearHours,
          remainingYearHours,
          consumedToDateHours,
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
    selectedArea,
    nameFilter,
    includeWithoutTimesheet,
    managerMap,
    sortColumn,
    sortDirection
  ]);

  const applyChartFilters = ({ managerId = '', area = '', clearName = true }: { managerId?: string; area?: AreaFilterValue; clearName?: boolean }) => {
    setSelectedManagerId(managerId);
    setSelectedArea(area);
    if (clearName) setNameFilter('');
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

    const utilization = totalAvailableYear > 0
      ? (totalConsumedToDate / totalAvailableYear) * 100
      : 0;

    return {
      totalAvailableYear,
      totalRemainingYear,
      totalConsumedToDate,
      totalElapsedYear,
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
      const key = row.area || 'SEM_AREA';
      const current = grouped.get(key) || { area: row.areaLabel, areaFilter: key as AreaFilterValue, consumed: 0, available: 0, budgeted: 0 };
      current.consumed += row.consumedToDateHours;
      current.available += row.availableYearHours;
      grouped.set(key, current);
    });

    scopedProjects.forEach((project) => {
      const key = project.area || 'SEM_AREA';
      const current = grouped.get(key) || {
        area: project.area ? AREA_LABEL[project.area] : 'Sem area',
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
            Visao consolidada de horas disponiveis e consumidas em {selectedYear}, considerando admissao,
            desligamento, feriados e dias uteis.
          </p>
        </div>
        <div className="inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
          Atualizado em {new Date().toLocaleDateString('pt-BR')} as {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </section>

      <section className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-2 mb-4 text-slate-700 font-semibold">
          <Filter size={16} />
          Filtros Analiticos
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
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
            <label className="block text-xs text-slate-500 font-bold mb-1">Area</label>
            <select
              className="w-full rounded-lg border border-slate-300 p-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              value={selectedArea}
              onChange={(e) => setSelectedArea((e.target.value || '') as AreaFilterValue)}
            >
              <option value="">Todas</option>
              <option value="SEM_AREA">Sem area</option>
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

          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={includeWithoutTimesheet}
                onChange={(e) => setIncludeWithoutTimesheet(e.target.checked)}
                className="rounded text-brand-600"
              />
              Incluir gestores
            </label>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 font-bold uppercase">Horas disponiveis no ano</p>
          <p className="mt-2 text-2xl font-bold text-slate-800">{formatHours(summary.totalAvailableYear)}</p>
          <p className="text-xs text-slate-500 mt-1">Base total de capacity anual</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 font-bold uppercase">Horas de hoje ate 31/12</p>
          <p className="mt-2 text-2xl font-bold text-slate-800">{formatHours(summary.totalRemainingYear)}</p>
          <p className="text-xs text-slate-500 mt-1">Disponibilidade restante do ano</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 font-bold uppercase">Horas consumidas ate hoje</p>
          <p className="mt-2 text-2xl font-bold text-brand-700">{formatHours(summary.totalConsumedToDate)}</p>
          <p className="text-xs text-slate-500 mt-1">Com base nas horas apontadas no timesheet</p>
          <p className="text-[11px] text-slate-400 mt-2">{formatHours(summary.totalElapsedYear)}h uteis ja decorridas ate hoje no ano</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 font-bold uppercase">Taxa de consumo</p>
          <p className="mt-2 text-2xl font-bold text-brand-700">{formatPercentage(summary.utilization)}%</p>
          <p className="text-xs text-slate-500 mt-1">Consumido / disponivel do ano</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 font-bold uppercase">Horas orçadas em projetos</p>
          <p className="mt-2 text-2xl font-bold text-slate-800">{formatHours(budgetSummary.totalBudgetedHours)}</p>
          <p className="text-xs text-slate-500 mt-1">{formatPercentage(budgetSummary.budgetVsCapacityPct)}% do capacity visível no recorte</p>
        </div>
      </section>

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
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
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
            <h2 className="font-semibold text-slate-800">Visao Geral</h2>
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

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-brand-600" />
            <h2 className="font-semibold text-slate-800">Capacity vs Consumo vs Orçado por Area</h2>
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
          <p className="mt-3 text-xs text-slate-500">Clique em uma barra para filtrar automaticamente a tela pela area selecionada e comparar capacidade, consumo e orçamento cadastrado.</p>
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
                    setSelectedArea((row.area || 'SEM_AREA') as AreaFilterValue);
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
          <h2 className="font-semibold text-slate-800">Visao por Colaborador</h2>
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
                    Area
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
                    Admissao
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
                    Disponivel ano
                    <SortIcon column="availableYearHours" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right">
                  <button type="button" className="inline-flex items-center justify-end gap-2 hover:text-slate-700 transition-colors w-full" onClick={() => handleSort('remainingYearHours')} title="Total de horas disponíveis de hoje até 31/12, calculado com base nos colaboradores ativos no período restante do ano.">
                    Disponivel ate 31/12
                    <SortIcon column="remainingYearHours" />
                  </button>
                </th>
                <th className="px-4 py-3 text-right">
                  <button type="button" className="inline-flex items-center justify-end gap-2 hover:text-slate-700 transition-colors w-full" onClick={() => handleSort('consumedToDateHours')} title="Horas já lançadas pelo colaborador do início do recorte até a data de hoje.">
                    Consumido ate hoje
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
