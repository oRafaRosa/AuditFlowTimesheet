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
  Cell,
  Legend
} from 'recharts';
import { Filter, Loader2, Users, CalendarClock, Clock3, TrendingUp, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { store } from '../services/store';
import { CalendarException, Holiday, TimesheetEntry, User, UserArea, formatHours, formatPercentage } from '../types';
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
const BRAND_RED = '#E71A3B';
const CHART_COLORS = [BRAND_BLUE, '#3558D4', '#5F7AE1', '#7F95E8', '#AAB8EE', '#CBD4F4'];

const toDateKey = (d: Date) => formatLocalDate(d);

const truncateLabel = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
};

const maxDate = (a: Date, b: Date): Date => (a.getTime() >= b.getTime() ? a : b);
const minDate = (a: Date, b: Date): Date => (a.getTime() <= b.getTime() ? a : b);

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
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [exceptions, setExceptions] = useState<CalendarException[]>([]);

  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [selectedArea, setSelectedArea] = useState<UserArea | ''>('');
  const [nameFilter, setNameFilter] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [includeWithoutTimesheet, setIncludeWithoutTimesheet] = useState(false);
  const [sortColumn, setSortColumn] = useState<CapacitySortColumn>('utilizationPct');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const currentUser = store.getCurrentUser();

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const [allUsers, allEntries, allHolidays, allExceptions] = await Promise.all([
        store.getUsers(),
        store.getEntries(),
        store.getHolidays(),
        store.getExceptions()
      ]);

      setUsers(allUsers);
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
    return scopedUsers.filter((u) => (u.role === 'MANAGER' || u.role === 'ADMIN') && (u.isActive !== false || includeInactive));
  }, [scopedUsers, includeInactive]);

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
        if (includeInactive || u.isActive !== false) return true;
        if (!u.terminationDate) return false;

        return parseDateOnly(u.terminationDate).getFullYear() === selectedYear;
      })
      .filter((u) => includeWithoutTimesheet || u.requiresTimesheet !== false)
      .filter((u) => !selectedManagerId || u.id === selectedManagerId || u.managerId === selectedManagerId)
      .filter((u) => !selectedArea || u.area === selectedArea)
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
    includeInactive,
    includeWithoutTimesheet,
    managerMap,
    sortColumn,
    sortDirection
  ]);

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

    const utilization = totalAvailableYear > 0
      ? (totalConsumedToDate / totalAvailableYear) * 100
      : 0;

    return {
      totalAvailableYear,
      totalRemainingYear,
      totalConsumedToDate,
      utilization
    };
  }, [rows]);

  const byTeamChart = useMemo(() => {
    const grouped = new Map<string, { team: string; consumed: number; available: number; remaining: number; members: number }>();

    rows.forEach((row) => {
      const key = row.managerId || 'SEM_GESTOR';
      const current = grouped.get(key) || {
        team: row.managerName,
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
      .sort((a, b) => b.consumed - a.consumed)
      .slice(0, 8)
      .map((item) => ({
        ...item,
        shortTeam: truncateLabel(item.team, 22)
      }));
  }, [rows]);

  const byAreaChart = useMemo(() => {
    const grouped = new Map<string, { area: string; consumed: number; available: number }>();

    rows.forEach((row) => {
      const key = row.area || 'SEM_AREA';
      const current = grouped.get(key) || { area: row.areaLabel, consumed: 0, available: 0 };
      current.consumed += row.consumedToDateHours;
      current.available += row.availableYearHours;
      grouped.set(key, current);
    });

    return [...grouped.values()].map((item) => ({
      ...item,
      utilization: item.available > 0 ? (item.consumed / item.available) * 100 : 0
    }));
  }, [rows]);

  const topPeopleChart = useMemo(() => {
    return rows
      .slice(0, 10)
      .map((row) => ({
        name: row.userName,
        shortName: truncateLabel(row.userName, 26),
        consumed: row.consumedToDateHours,
        remaining: row.remainingYearHours,
        utilization: row.utilizationPct
      }));
  }, [rows]);

  const committeeHighlights = useMemo(() => {
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
      <section className="rounded-2xl overflow-hidden border border-[#d6dcf5] bg-[#F0EFEA] p-5 md:p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[#0033C6] font-bold">Capacity</p>
            <h1 className="text-2xl md:text-3xl font-bold mt-2 text-slate-900">Capacidade da Equipe - {selectedYear}</h1>
            <p className="text-sm text-slate-600 mt-2 max-w-3xl">
              Visao consolidada de horas disponiveis e consumidas para apresentacoes gerenciais e comites,
              considerando admissao, desligamento, feriados e dias uteis.
            </p>
          </div>
          <div className="rounded-xl border border-[#d6dcf5] bg-white px-4 py-3 text-xs text-slate-600">
            Atualizado em {new Date().toLocaleDateString('pt-BR')} as {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
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
              className="w-full border border-gray-300 rounded-lg p-2 text-sm"
              value={selectedYear}
              min={2020}
              max={2100}
              onChange={(e) => setSelectedYear(Number(e.target.value) || new Date().getFullYear())}
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-bold mb-1">Equipe (Gestor)</label>
            <select
              className="w-full border border-gray-300 rounded-lg p-2 text-sm"
              value={selectedManagerId}
              onChange={(e) => setSelectedManagerId(e.target.value)}
            >
              <option value="">Todas</option>
              {managerOptions.map((manager) => (
                <option key={manager.id} value={manager.id}>{manager.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-bold mb-1">Area</label>
            <select
              className="w-full border border-gray-300 rounded-lg p-2 text-sm"
              value={selectedArea}
              onChange={(e) => setSelectedArea((e.target.value || '') as UserArea | '')}
            >
              <option value="">Todas</option>
              {Object.entries(AREA_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div className="xl:col-span-2">
            <label className="block text-xs text-slate-500 font-bold mb-1">Pessoa</label>
            <input
              className="w-full border border-gray-300 rounded-lg p-2 text-sm"
              placeholder="Filtrar por nome"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
            />
          </div>

          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                className="rounded text-brand-600"
              />
              Incluir inativos
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={includeWithoutTimesheet}
                onChange={(e) => setIncludeWithoutTimesheet(e.target.checked)}
                className="rounded text-brand-600"
              />
              Incluir sem timesheet
            </label>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 font-bold uppercase">Horas disponiveis no ano</p>
          <p className="text-2xl font-bold text-[#0033C6] mt-2">{formatHours(summary.totalAvailableYear)}</p>
          <p className="text-xs text-slate-500 mt-1">Base total de capacity anual</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 font-bold uppercase">Horas de hoje ate 31/12</p>
          <p className="text-2xl font-bold text-[#0033C6] mt-2">{formatHours(summary.totalRemainingYear)}</p>
          <p className="text-xs text-slate-500 mt-1">Disponibilidade restante do ano</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 font-bold uppercase">Horas consumidas ate hoje</p>
          <p className="text-2xl font-bold text-[#3558D4] mt-2">{formatHours(summary.totalConsumedToDate)}</p>
          <p className="text-xs text-slate-500 mt-1">Lancamentos acumulados no ano</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <p className="text-xs text-slate-500 font-bold uppercase">Taxa de consumo</p>
          <p className="text-2xl font-bold text-[#3558D4] mt-2">{formatPercentage(summary.utilization)}%</p>
          <p className="text-xs text-slate-500 mt-1">Consumido / disponivel do ano</p>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users size={18} className="text-brand-600" />
            <h2 className="font-semibold text-slate-800">Capacity por Equipe</h2>
          </div>
          <div className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byTeamChart} layout="vertical" margin={{ top: 8, right: 16, left: 24, bottom: 8 }} barCategoryGap={12}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="shortTeam" width={170} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value: any) => `${formatHours(Number(value))}h`} />
                <Legend />
                <Bar dataKey="consumed" name="Consumido" fill={BRAND_BLUE_DARK} radius={[6, 6, 0, 0]} />
                <Bar dataKey="remaining" name="Restante" fill={BRAND_BLUE} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
                  <Cell fill="#9FB1F1" />
                </Pie>
                <Tooltip formatter={(value: any) => `${formatHours(Number(value))}h`} />
                <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-[#f5f7ff] border border-[#d9e1ff] px-3 py-3">
                <p className="text-[11px] font-bold uppercase text-slate-500">Consumido</p>
                <p className="mt-1 text-lg font-bold text-[#00248a]">{formatHours(summary.totalConsumedToDate)}h</p>
              </div>
              <div className="rounded-lg bg-[#f5f7ff] border border-[#d9e1ff] px-3 py-3">
                <p className="text-[11px] font-bold uppercase text-slate-500">Restante</p>
                <p className="mt-1 text-lg font-bold text-[#0033C6]">{formatHours(summary.totalRemainingYear)}h</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock3 size={18} className="text-brand-600" />
            <h2 className="font-semibold text-slate-800">Top Colaboradores por Consumo</h2>
          </div>
          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topPeopleChart} layout="vertical" margin={{ top: 8, right: 16, left: 24, bottom: 8 }} barCategoryGap={10}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="shortName" width={170} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value: any) => `${formatHours(Number(value))}h`} />
                <Legend />
                <Bar dataKey="consumed" name="Consumido" fill={BRAND_BLUE_DARK} radius={[6, 6, 0, 0]} />
                <Bar dataKey="remaining" name="Disponivel ate 31/12" fill={BRAND_BLUE} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-brand-600" />
            <h2 className="font-semibold text-slate-800">Consumo por Area</h2>
          </div>
          <div className="space-y-3">
            {byAreaChart.length === 0 && <p className="text-sm text-slate-400">Sem dados para o filtro atual.</p>}
            {byAreaChart.map((item, idx) => (
              <div key={item.area} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">{item.area}</p>
                  <span className="text-xs font-bold" style={{ color: CHART_COLORS[idx % CHART_COLORS.length] }}>
                    {formatPercentage(item.utilization)}%
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{formatHours(item.consumed)}h de {formatHours(item.available)}h</p>
                <div className="w-full bg-slate-100 rounded-full h-2 mt-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${Math.min(item.utilization, 100)}%`,
                      backgroundColor: CHART_COLORS[idx % CHART_COLORS.length]
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
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
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      row.utilizationPct >= 85
                        ? 'bg-red-100 text-red-700'
                        : row.utilizationPct >= 70
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
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

      <section className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={18} className="text-amber-600" />
          <h2 className="font-semibold text-slate-800">Highlights para Apresentacao em Comite</h2>
        </div>
        {committeeHighlights.length === 0 ? (
          <p className="text-sm text-slate-500">Sem alertas de consumo acima de 85% para o recorte atual.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {committeeHighlights.map((row) => (
              <div key={row.userId} className="rounded-lg border border-[#f2b7c1] bg-[#fff6f7] p-3">
                <p className="text-sm font-semibold text-[#b3132f]">{row.userName}</p>
                <p className="text-xs text-[#b3132f] mt-1">{row.areaLabel} • {row.managerName}</p>
                <p className="text-xs text-[#b3132f] mt-2">
                  {formatHours(row.consumedToDateHours)}h consumidas de {formatHours(row.availableYearHours)}h
                </p>
                <p className="text-xs font-bold text-[#b3132f] mt-1">{formatPercentage(row.utilizationPct)}% de consumo</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
