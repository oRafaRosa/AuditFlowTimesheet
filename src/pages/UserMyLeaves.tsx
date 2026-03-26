import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { store } from '../services/store';
import { CalendarException, Holiday, LeaveType, TeamLeave, User } from '../types';
import { formatDateForDisplay } from '../utils/date';

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const LOAD_TIMEOUT_MS = 12000;

interface YearDayCell {
  dateKey: string;
  month: number;
  day: number;
  weekday: number;
}

const normalizeCode = (value: string) => value.trim().toUpperCase();

const parseDateOnly = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
};

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const countLeaveDaysWithinYear = (leave: TeamLeave, year: number) => {
  const periodStart = parseDateOnly(leave.startDate);
  const periodEnd = parseDateOnly(leave.endDate);
  const yearStart = new Date(year, 0, 1, 12, 0, 0, 0);
  const yearEnd = new Date(year, 11, 31, 12, 0, 0, 0);

  const start = periodStart.getTime() < yearStart.getTime() ? yearStart : periodStart;
  const end = periodEnd.getTime() > yearEnd.getTime() ? yearEnd : periodEnd;

  if (end.getTime() < start.getTime()) return 0;

  const oneDayMs = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / oneDayMs) + 1;
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), timeoutMs);
    })
  ]);
};

const formatLeavePeriodLabel = (leave: TeamLeave) => {
  if (leave.startDate === leave.endDate) return formatDateForDisplay(leave.startDate);
  return `${formatDateForDisplay(leave.startDate)} a ${formatDateForDisplay(leave.endDate)}`;
};

export const UserMyLeaves: React.FC = () => {
  const currentUserId = store.getCurrentUser()?.id || '';
  const currentYear = new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [resolvedUser, setResolvedUser] = useState<User | null>(store.getCurrentUser());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [exceptions, setExceptions] = useState<CalendarException[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaves, setLeaves] = useState<TeamLeave[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadError, setLoadError] = useState('');
  const calendarScrollRef = useRef<HTMLDivElement | null>(null);
  const hasAutoFocusedMonthRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    const watchdog = window.setTimeout(() => {
      if (!isMounted) return;
      setLoadError('Não consegui carregar sua programação agora. Tente novamente em instantes.');
      setLoading(false);
    }, LOAD_TIMEOUT_MS);

    const loadData = async () => {
      if (!isMounted) return;

      setLoading(true);
      setLoadError('');

      try {
        const currentUser = store.getCurrentUser();
        const syncedUser = currentUser || await withTimeout(store.syncCurrentUserFromDatabase(), LOAD_TIMEOUT_MS);

        if (!syncedUser) {
          setResolvedUser(null);
          setLeaves([]);
          setLeaveTypes([]);
          setHolidays([]);
          setExceptions([]);
          setLoadError('Não foi possível identificar seu usuário agora. Recarregue para tentar novamente.');
          return;
        }

        const [scopedLeaves, allLeaveTypes, allHolidays, allExceptions] = await withTimeout(
          Promise.all([
            store.getTeamLeaves({ userIds: [syncedUser.id], year: selectedYear }),
            store.getLeaveTypes(),
            store.getHolidays(),
            store.getExceptions()
          ]),
          LOAD_TIMEOUT_MS
        );

        if (!isMounted) return;

        setResolvedUser(syncedUser);
        setLeaves(scopedLeaves);
        setLeaveTypes(allLeaveTypes.filter((type) => type.active !== false));
        setHolidays(allHolidays);
        setExceptions(allExceptions);
      } catch (error) {
        if (!isMounted) return;
        console.warn('Erro ao carregar programação de férias/folgas do usuário:', error);
        setLeaves([]);
        setLeaveTypes([]);
        setHolidays([]);
        setExceptions([]);
        setLoadError('Não consegui carregar sua programação agora. Tente novamente em instantes.');
      } finally {
        if (!isMounted) return;
        window.clearTimeout(watchdog);
        setLoading(false);
      }
    };

    loadData();

    return () => {
      isMounted = false;
      window.clearTimeout(watchdog);
    };
  }, [currentUserId, selectedYear, reloadKey]);

  const monthSegments = useMemo(() => {
    return MONTH_LABELS.map((label, month) => ({
      label,
      month,
      days: new Date(selectedYear, month + 1, 0).getDate()
    }));
  }, [selectedYear]);

  const yearDays = useMemo(() => {
    const days: YearDayCell[] = [];

    for (let month = 0; month < 12; month += 1) {
      const totalDays = new Date(selectedYear, month + 1, 0).getDate();
      for (let day = 1; day <= totalDays; day += 1) {
        const date = new Date(selectedYear, month, day, 12, 0, 0, 0);
        days.push({
          dateKey: toDateKey(date),
          month,
          day,
          weekday: date.getDay()
        });
      }
    }

    return days;
  }, [selectedYear]);

  useEffect(() => {
    const container = calendarScrollRef.current;
    if (!container || yearDays.length === 0) return;

    const today = new Date();
    const targetMonth = selectedYear === today.getFullYear() ? today.getMonth() : 0;
    const monthStart = yearDays.find((item) => item.month === targetMonth && item.day === 1);
    if (!monthStart) return;

    const targetCell = container.querySelector<HTMLElement>(`[data-date-key="${monthStart.dateKey}"]`);
    if (!targetCell) return;

    const desiredLeft = Math.max(0, targetCell.offsetLeft - 260);
    const isFirstFocus = !hasAutoFocusedMonthRef.current;
    hasAutoFocusedMonthRef.current = true;

    container.scrollTo({
      left: desiredLeft,
      behavior: isFirstFocus ? 'auto' : 'smooth'
    });
  }, [selectedYear, yearDays]);

  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();
    holidays.forEach((holiday) => map.set(holiday.date, holiday.name));
    exceptions
      .filter((exception) => exception.type === 'OFFDAY')
      .forEach((exception) => map.set(exception.date, exception.name || 'Feriado / Folga'));
    return map;
  }, [holidays, exceptions]);

  const leaveTypeMap = useMemo(() => {
    const map = new Map<string, LeaveType>();
    leaveTypes.forEach((item) => map.set(normalizeCode(item.code), item));
    return map;
  }, [leaveTypes]);

  const leaveTypeCodeSet = useMemo(() => {
    return new Set(leaveTypes.map((item) => normalizeCode(item.code)));
  }, [leaveTypes]);

  const userDayMap = useMemo(() => {
    const dayMap = new Map<string, TeamLeave>();

    leaves.forEach((leave) => {
      if (!leaveTypeCodeSet.has(normalizeCode(leave.leaveTypeCode))) return;

      let cursor = parseDateOnly(leave.startDate);
      const end = parseDateOnly(leave.endDate);

      while (cursor.getTime() <= end.getTime()) {
        const key = toDateKey(cursor);
        if (key.startsWith(`${selectedYear}-`)) {
          dayMap.set(key, leave);
        }
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 12, 0, 0, 0);
      }
    });

    return dayMap;
  }, [leaves, leaveTypeCodeSet, selectedYear]);

  const birthdayDateKey = useMemo(() => {
    if (!resolvedUser?.birthdayDate) return undefined;

    const birthday = parseDateOnly(resolvedUser.birthdayDate);
    const month = birthday.getMonth();
    const baseDay = birthday.getDate();
    const maxDayInMonth = new Date(selectedYear, month + 1, 0).getDate();
    const adjustedDay = Math.min(baseDay, maxDayInMonth);

    return `${selectedYear}-${String(month + 1).padStart(2, '0')}-${String(adjustedDay).padStart(2, '0')}`;
  }, [resolvedUser, selectedYear]);

  const leaveSummary = useMemo(() => {
    const summaryMap = new Map<string, { code: string; name: string; color?: string; totalDays: number; totalEvents: number }>();

    leaves.forEach((leave) => {
      const normalizedCode = normalizeCode(leave.leaveTypeCode);
      const leaveType = leaveTypeMap.get(normalizedCode);
      const existing = summaryMap.get(normalizedCode);
      const leaveDays = countLeaveDaysWithinYear(leave, selectedYear);

      if (existing) {
        existing.totalDays += leaveDays;
        existing.totalEvents += 1;
        return;
      }

      summaryMap.set(normalizedCode, {
        code: normalizedCode,
        name: leaveType?.name || leave.leaveTypeCode,
        color: leaveType?.color,
        totalDays: leaveDays,
        totalEvents: 1
      });
    });

    return Array.from(summaryMap.values()).sort((a, b) => b.totalDays - a.totalDays || a.name.localeCompare(b.name));
  }, [leaves, leaveTypeMap, selectedYear]);

  const sortedLeaves = useMemo(() => {
    return [...leaves].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [leaves]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center text-slate-500">
        Carregando sua programação de férias e folgas...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Minhas Férias e Folgas</h1>
          <p className="text-sm text-slate-500 mt-1">Consulta do seu planejamento anual com o mesmo calendário usado pela gestão.</p>
        </div>
        <div className="w-full md:w-auto">
          <label className="text-xs font-bold text-slate-500 block mb-1">Ano</label>
          <input
            type="number"
            className="w-full md:w-36 border border-gray-300 p-2 rounded-lg text-sm"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value) || currentYear)}
          />
        </div>
      </div>

      {loadError && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">{loadError}</p>
          <button
            type="button"
            onClick={() => setReloadKey((prev) => prev + 1)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h3 className="font-semibold text-slate-700">Programação de férias e folgas</h3>
            <p className="text-xs text-slate-500">Feriados cadastrados no sistema aparecem em amarelo no calendário.</p>
          </div>

          <div ref={calendarScrollRef} className="overflow-auto">
            <table className="min-w-[2200px] text-[11px] border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-100">
                  <th className="sticky left-0 z-30 bg-amber-100 border border-slate-300 px-2 py-2 w-[240px] min-w-[240px]">Colaborador</th>
                  {monthSegments.map((segment) => (
                    <th key={segment.month} colSpan={segment.days} className="border border-slate-300 px-2 py-2 text-center font-bold">
                      {segment.label}-{String(selectedYear).slice(-2)}
                    </th>
                  ))}
                </tr>
                <tr className="bg-white">
                  <th className="sticky left-0 z-20 bg-white border border-slate-300 px-2 py-1">&nbsp;</th>
                  {yearDays.map((item) => (
                    <th
                      key={`week-${item.dateKey}`}
                      data-date-key={item.dateKey}
                      className="border border-slate-300 w-7 min-w-7 h-7 font-normal text-slate-500"
                    >
                      <div className="leading-none text-[9px]">{WEEKDAY_LABELS[item.weekday]}</div>
                      <div className="leading-none mt-0.5">{item.day}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white">
                  <td className="sticky left-0 z-10 border border-slate-300 px-2 py-1 w-[240px] min-w-[240px] bg-white">
                    <div className="font-medium text-slate-800 leading-tight">{resolvedUser?.name || 'Colaborador'}</div>
                    <div className="text-[10px] text-slate-500">{resolvedUser?.email || 'Usuário atual'}</div>
                  </td>
                  {yearDays.map((item) => {
                    const leave = userDayMap.get(item.dateKey);
                    const leaveType = leave ? leaveTypeMap.get(normalizeCode(leave.leaveTypeCode)) : undefined;
                    const holidayName = holidayMap.get(item.dateKey);
                    const isHoliday = !!holidayName;
                    const isBirthday = birthdayDateKey === item.dateKey;
                    const isWeekend = item.weekday === 0 || item.weekday === 6;

                    let backgroundColor = '#ffffff';
                    let title = '';

                    if (isWeekend) backgroundColor = '#f8fafc';
                    if (isHoliday) {
                      backgroundColor = '#fde68a';
                      title = holidayName;
                    }

                    if (leave && leaveType) {
                      backgroundColor = leaveType.color || '#2563eb';
                      title = `${leaveType.name} • ${formatLeavePeriodLabel(leave)}`;
                    }

                    if (isBirthday) {
                      title = title ? `${title} • Aniversário` : 'Aniversário';
                    }

                    return (
                      <td
                        key={item.dateKey}
                        className="border border-slate-300 w-7 min-w-7 h-7 relative"
                        style={{ backgroundColor }}
                        title={title || undefined}
                      >
                        {isBirthday && (
                          <span
                            className="absolute top-0.5 right-0.5 inline-flex items-center justify-center w-3 h-3 rounded-full bg-rose-500 text-white text-[9px] leading-none font-bold shadow-sm"
                            aria-label="Aniversário"
                          >
                            *
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-100 bg-white">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              {leaveTypes.map((type) => (
                <span key={type.code} className="inline-flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-sm border border-slate-300" style={{ backgroundColor: type.color }} />
                  {type.name}
                </span>
              ))}
              <span className="inline-flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-sm border border-slate-300 bg-yellow-200" />
                Feriado
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-rose-500 text-white text-[9px] leading-none font-bold">*</span>
                Aniversário
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays size={16} className="text-brand-600" />
              <h3 className="font-bold text-slate-800">Minha programação</h3>
            </div>

            {sortedLeaves.length === 0 ? (
              <p className="text-sm text-slate-600 leading-relaxed">
                Ainda não há férias ou folgas programadas para você neste ano. Quando possível, alinhe com seu gestor;
                ele já tem acesso para incluir sua programação no AuditFlow.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-800">{resolvedUser?.name || 'Colaborador'}</p>
                  <p className="text-xs text-slate-500">{resolvedUser?.email || 'Usuário atual'}</p>
                  <p className="text-xs text-slate-600 mt-1">Visualização apenas.</p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Resumo do período</p>

                  {leaveSummary.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {leaveSummary.map((item) => (
                        <div key={item.code} className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="inline-block w-2.5 h-2.5 rounded-sm border border-slate-300" style={{ backgroundColor: item.color || '#94a3b8' }} />
                            <span className="text-slate-700 truncate">{item.name}</span>
                          </div>
                          <span className="text-slate-600 font-semibold whitespace-nowrap">{item.totalDays} dia(s) • {item.totalEvents} registro(s)</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-400">Sem férias ou folgas cadastradas para este ano.</p>
                  )}
                </div>

                <div className="space-y-2 max-h-[330px] overflow-y-auto pr-1">
                  {sortedLeaves.map((leave) => {
                    const leaveType = leaveTypeMap.get(normalizeCode(leave.leaveTypeCode));

                    return (
                      <div key={leave.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                        <div>
                          <p className="font-semibold text-slate-800">{leaveType?.name || leave.leaveTypeCode}</p>
                          <p className="text-slate-600 mt-1">{formatLeavePeriodLabel(leave)}</p>
                          {leave.notes && <p className="text-slate-500 mt-1">{leave.notes}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
