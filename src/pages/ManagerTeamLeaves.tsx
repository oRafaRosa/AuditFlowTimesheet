import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { store } from '../services/store';
import { CalendarException, Holiday, LeaveType, TeamLeave, User } from '../types';
import { formatDateForDisplay } from '../utils/date';

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

interface YearDayCell {
  dateKey: string;
  month: number;
  day: number;
  weekday: number;
}

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateOnly = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
};

const normalizeCode = (value: string) => value.trim().toUpperCase();

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

export const ManagerTeamLeaves: React.FC = () => {
  const currentUser = store.getCurrentUser();
  const currentYear = new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [users, setUsers] = useState<User[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [exceptions, setExceptions] = useState<CalendarException[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaves, setLeaves] = useState<TeamLeave[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [showVacationAlertDetails, setShowVacationAlertDetails] = useState(true);
  const [showWholeDirectorate, setShowWholeDirectorate] = useState(false);
  const calendarScrollRef = useRef<HTMLDivElement | null>(null);

  const [formData, setFormData] = useState({
    userId: '',
    leaveTypeCode: 'FERIAS',
    startDate: '',
    endDate: '',
    notes: ''
  });

  const loadData = async () => {
    setLoading(true);
    const [allUsers, allHolidays, allLeaveTypes, allExceptions] = await Promise.all([
      store.getUsers(),
      store.getHolidays(),
      store.getLeaveTypes(),
      store.getExceptions()
    ]);

    const activeLeaveTypes = allLeaveTypes.filter((type) => type.active !== false);
    const defaultTypeCode = activeLeaveTypes[0]?.code || 'FERIAS';

    setUsers(allUsers);
    setHolidays(allHolidays);
    setExceptions(allExceptions);
    setLeaveTypes(activeLeaveTypes);
    setFormData((prev) => ({
      ...prev,
      leaveTypeCode: prev.leaveTypeCode || defaultTypeCode
    }));
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const teamUsers = useMemo(() => {
    if (!currentUser) return [] as User[];

    if (currentUser.role === 'ADMIN') {
      return users.filter((user) => user.isActive !== false && user.role !== 'ADMIN');
    }

    if (currentUser.role === 'MANAGER' && showWholeDirectorate) {
      return users.filter((user) => user.isActive !== false && user.role !== 'ADMIN');
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

    return users.filter((user) => managedIds.has(user.id) && user.isActive !== false);
  }, [users, currentUser, showWholeDirectorate]);

  useEffect(() => {
    if (!selectedUserId) return;
    if (teamUsers.some((user) => user.id === selectedUserId)) return;

    setSelectedUserId('');
    setFormData((prev) => ({ ...prev, userId: '' }));
  }, [teamUsers, selectedUserId]);

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

    const containerRect = container.getBoundingClientRect();
    const targetRect = targetCell.getBoundingClientRect();
    const desiredLeft = container.scrollLeft + (targetRect.left - containerRect.left) - 260;

    container.scrollTo({
      left: Math.max(0, desiredLeft),
      behavior: 'smooth'
    });
  }, [selectedYear, yearDays]);

  // Mapa de feriados: inclui tanto a tabela holidays quanto as exceções de calendário tipo OFFDAY
  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();
    holidays.forEach((h) => map.set(h.date, h.name));
    exceptions
      .filter((ex) => ex.type === 'OFFDAY')
      .forEach((ex) => map.set(ex.date, ex.name || 'Feriado / Folga'));
    return map;
  }, [holidays, exceptions]);

  useEffect(() => {
    const loadLeaves = async () => {
      if (teamUsers.length === 0) {
        setLeaves([]);
        return;
      }

      const userIds = teamUsers.map((user) => user.id);
      const scopedLeaves = await store.getTeamLeaves({ userIds, year: selectedYear });
      setLeaves(scopedLeaves);
    };

    loadLeaves();
  }, [teamUsers, selectedYear]);

  const leaveTypeMap = useMemo(() => {
    const map = new Map<string, LeaveType>();
    leaveTypes.forEach((item) => map.set(normalizeCode(item.code), item));
    return map;
  }, [leaveTypes]);

  const leavesByUser = useMemo(() => {
    const map = new Map<string, TeamLeave[]>();

    teamUsers.forEach((user) => map.set(user.id, []));
    leaves.forEach((leave) => {
      const list = map.get(leave.userId) || [];
      list.push(leave);
      map.set(leave.userId, list);
    });

    map.forEach((list, userId) => {
      map.set(userId, [...list].sort((a, b) => a.startDate.localeCompare(b.startDate)));
    });

    return map;
  }, [teamUsers, leaves]);

  const leaveTypeCodeSet = useMemo(() => {
    return new Set(leaveTypes.map((item) => normalizeCode(item.code)));
  }, [leaveTypes]);

  const leavesByUserDay = useMemo(() => {
    const map = new Map<string, Map<string, TeamLeave>>();

    teamUsers.forEach((user) => {
      const dayMap = new Map<string, TeamLeave>();
      const userLeaves = leavesByUser.get(user.id) || [];

      userLeaves.forEach((leave) => {
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

      map.set(user.id, dayMap);
    });

    return map;
  }, [teamUsers, leavesByUser, leaveTypeCodeSet, selectedYear]);

  const usersWithoutVacation = useMemo(() => {
    return teamUsers.filter((user) => {
      const userLeaves = leavesByUser.get(user.id) || [];
      return !userLeaves.some((leave) => normalizeCode(leave.leaveTypeCode) === 'FERIAS');
    });
  }, [teamUsers, leavesByUser]);

  const pendingBirthdayLeave = useMemo(() => {
    return teamUsers
      .filter((user) => !!user.birthdayDate)
      .filter((user) => {
        const birthdayMonth = parseDateOnly(user.birthdayDate as string).getMonth();
        const userLeaves = leavesByUser.get(user.id) || [];

        return !userLeaves.some((leave) => {
          if (normalizeCode(leave.leaveTypeCode) !== 'FOLGA_ANIVERSARIO') return false;
          const start = parseDateOnly(leave.startDate);
          const end = parseDateOnly(leave.endDate);
          let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0, 0);
          while (cursor.getTime() <= end.getTime()) {
            if (cursor.getMonth() === birthdayMonth) return true;
            cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1, 12, 0, 0, 0);
          }
          return false;
        });
      })
      .map((user) => ({
        ...user,
        birthdayMonth: parseDateOnly(user.birthdayDate as string).getMonth()
      }))
      .sort((a, b) => a.birthdayMonth - b.birthdayMonth || a.name.localeCompare(b.name));
  }, [teamUsers, leavesByUser]);

  const pendingBirthdayMonthByUser = useMemo(() => {
    const map = new Map<string, number>();
    pendingBirthdayLeave.forEach((user) => {
      map.set(user.id, user.birthdayMonth);
    });
    return map;
  }, [pendingBirthdayLeave]);

  const selectedUser = useMemo(() => {
    if (!selectedUserId) return null;
    return teamUsers.find((user) => user.id === selectedUserId) || null;
  }, [teamUsers, selectedUserId]);

  const selectedUserBirthdayMonth = useMemo(() => {
    if (!selectedUser?.birthdayDate) return undefined;
    return parseDateOnly(selectedUser.birthdayDate).getMonth();
  }, [selectedUser]);

  const selectedUserLeaves = useMemo(() => {
    if (!selectedUser) return [] as TeamLeave[];
    return [...(leavesByUser.get(selectedUser.id) || [])].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [selectedUser, leavesByUser]);

  const selectedUserLeaveSummary = useMemo(() => {
    const summaryMap = new Map<string, { code: string; name: string; color?: string; totalDays: number; totalEvents: number }>();

    selectedUserLeaves.forEach((leave) => {
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
  }, [selectedUserLeaves, leaveTypeMap, selectedYear]);

  const leaveOptions = useMemo(() => {
    return leaveTypes.filter((item) => item.active !== false);
  }, [leaveTypes]);

  const isSingleDateLeave = useMemo(() => {
    return normalizeCode(formData.leaveTypeCode) !== 'FERIAS';
  }, [formData.leaveTypeCode]);

  const formatLeavePeriodLabel = (leave: TeamLeave) => {
    if (leave.startDate === leave.endDate) return formatDateForDisplay(leave.startDate);
    return `${formatDateForDisplay(leave.startDate)} a ${formatDateForDisplay(leave.endDate)}`;
  };

  const handleAddLeave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!formData.userId || !formData.leaveTypeCode || !formData.startDate) {
      alert('Preencha os campos obrigatórios para cadastrar férias/folga.');
      return;
    }

    const effectiveEndDate = isSingleDateLeave ? formData.startDate : formData.endDate;
    if (!effectiveEndDate) {
      alert('Informe a data final para férias.');
      return;
    }

    if (formData.startDate > effectiveEndDate) {
      alert('A data inicial não pode ser maior que a data final.');
      return;
    }

    setSaving(true);
    const ok = await store.addTeamLeave({
      userId: formData.userId,
      leaveTypeCode: normalizeCode(formData.leaveTypeCode),
      startDate: formData.startDate,
      endDate: effectiveEndDate,
      notes: formData.notes.trim() || undefined
    });
    setSaving(false);

    if (!ok) {
      alert('Não foi possível salvar no banco agora.');
      return;
    }

    const updatedLeaves = await store.getTeamLeaves({ userIds: teamUsers.map((user) => user.id), year: selectedYear });
    setLeaves(updatedLeaves);

    setFormData((prev) => ({
      ...prev,
      startDate: '',
      endDate: '',
      notes: ''
    }));
  };

  const handleDeleteLeave = async (id: string) => {
    const confirmed = window.confirm('Deseja remover este agendamento de folga/férias?');
    if (!confirmed) return;

    const ok = await store.deleteTeamLeave(id);
    if (!ok) {
      alert('Não foi possível remover o registro.');
      return;
    }

    const updatedLeaves = await store.getTeamLeaves({ userIds: teamUsers.map((user) => user.id), year: selectedYear });
    setLeaves(updatedLeaves);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-8 text-center text-slate-500">
        Carregando agenda de férias e folgas...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Férias e Folgas do Time</h1>
          <p className="text-sm text-slate-500 mt-1">Planejamento anual da equipe com destaque para feriados, férias e folgas especiais.</p>
          {currentUser?.role === 'MANAGER' && (
            <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600 select-none">
              <input
                type="checkbox"
                checked={showWholeDirectorate}
                onChange={(e) => setShowWholeDirectorate(e.target.checked)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Ver toda a diretoria (todo mundo)
            </label>
          )}
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

      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle size={18} />
              <h2 className="font-bold">Sem férias cadastradas</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowVacationAlertDetails((prev) => !prev)}
              className="text-xs font-semibold text-red-700 hover:text-red-800 underline"
            >
              {showVacationAlertDetails ? 'Minimizar' : 'Expandir'}
            </button>
          </div>

          <p className="text-sm text-red-700 mt-2">{usersWithoutVacation.length} colaborador(es) sem programação de férias no ano.</p>

          {showVacationAlertDetails ? (
            <>
              <div className="mt-2 text-xs text-red-800">
                {usersWithoutVacation.length === 0 ? 'Nenhuma pendência.' : usersWithoutVacation.map((user) => user.name).join(' • ')}
              </div>
              <p className="mt-2 text-[11px] text-red-700">
                Dica: para pendência de folga de aniversário, use o ícone <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-200 text-amber-800 text-[10px] font-bold align-middle">!</span> ao lado do nome do colaborador.
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-red-700">
              Lista oculta. Use "Expandir" para ver os nomes ou acompanhe as pendências de aniversário pelo ícone ! na grade.
            </p>
          )}
        </div>
      </div>

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
                    <th
                      key={segment.month}
                      colSpan={segment.days}
                      className={`border border-slate-300 px-2 py-2 text-center font-bold ${selectedUserBirthdayMonth === segment.month ? 'bg-amber-100 text-amber-900' : ''}`}
                    >
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
                {teamUsers.map((user) => {
                  const userDayMap = leavesByUserDay.get(user.id) || new Map<string, TeamLeave>();
                  const pendingBirthdayMonth = pendingBirthdayMonthByUser.get(user.id);
                  const isSelected = selectedUserId === user.id;

                  return (
                    <tr key={user.id} className={isSelected ? 'bg-brand-50/30' : 'hover:bg-slate-50/50'}>
                      <td className={`sticky left-0 z-10 border border-slate-300 px-2 py-1 w-[240px] min-w-[240px] ${isSelected ? 'bg-brand-50' : 'bg-white'}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedUserId((prev) => prev === user.id ? '' : user.id);
                            setFormData((prev) => ({ ...prev, userId: user.id }));
                          }}
                          className={`w-full text-left rounded px-1 py-1 transition-colors ${isSelected ? 'bg-brand-100' : 'hover:bg-slate-100'}`}
                        >
                          <div className="font-medium text-slate-800 leading-tight flex items-center gap-1">
                            <span>{user.name}</span>
                            {pendingBirthdayMonth !== undefined && (
                              <span
                                className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-200 text-amber-800 text-[10px] font-bold"
                                title="Este colaborador ainda não tem folga de aniversário cadastrada no mês ideal."
                              >
                                !
                              </span>
                            )}
                          </div>
                        </button>
                        <div className="text-[10px] text-slate-500">{user.email}</div>
                      </td>
                      {yearDays.map((item) => {
                        const leave = userDayMap.get(item.dateKey);
                        const leaveType = leave ? leaveTypeMap.get(normalizeCode(leave.leaveTypeCode)) : undefined;
                        const holidayName = holidayMap.get(item.dateKey);
                        const isHoliday = !!holidayName;
                        const isWeekend = item.weekday === 0 || item.weekday === 6;
                        const highlightBirthdayMonth = isSelected && selectedUserBirthdayMonth === item.month;

                        let backgroundColor = '#ffffff';
                        let title = '';
                        let boxShadow = '';

                        if (isWeekend) backgroundColor = '#f8fafc';
                        if (isHoliday) {
                          backgroundColor = '#fde68a';
                          title = holidayName!;
                        }

                        if (leave && leaveType) {
                          backgroundColor = leaveType.color || '#2563eb';
                          title = `${leaveType.name} • ${formatLeavePeriodLabel(leave)}`;
                        }

                        if (highlightBirthdayMonth) {
                          boxShadow = 'inset 0 0 0 1px rgba(245, 158, 11, 0.65)';
                        }

                        return (
                          <td
                            key={`${user.id}-${item.dateKey}`}
                            className="border border-slate-300 w-7 min-w-7 h-7"
                            style={{ backgroundColor, boxShadow }}
                            title={title || undefined}
                          />
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-100 bg-white">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              {leaveOptions.map((type) => (
                <span key={type.code} className="inline-flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-sm border border-slate-300" style={{ backgroundColor: type.color }} />
                  {type.name}
                </span>
              ))}
              <span className="inline-flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-sm border border-slate-300 bg-yellow-200" />
                Feriado
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-bold text-slate-800 mb-3">Cadastrar férias/folga</h3>
            <form onSubmit={handleAddLeave} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Colaborador</label>
                <select
                  className="w-full border border-gray-300 p-2 rounded-lg text-sm"
                  value={formData.userId}
                  onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                  required
                >
                  <option value="">Selecione</option>
                  {teamUsers.map((user) => (
                    <option key={user.id} value={user.id}>{user.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Tipo</label>
                <select
                  className="w-full border border-gray-300 p-2 rounded-lg text-sm"
                  value={formData.leaveTypeCode}
                  onChange={(e) => setFormData({ ...formData, leaveTypeCode: e.target.value })}
                  required
                >
                  {leaveOptions.map((item) => (
                    <option key={item.code} value={item.code}>{item.name}</option>
                  ))}
                </select>
              </div>

              {isSingleDateLeave ? (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Data</label>
                  <input
                    type="date"
                    className="w-full border border-gray-300 p-2 rounded-lg text-sm"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    required
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Início</label>
                    <input
                      type="date"
                      className="w-full border border-gray-300 p-2 rounded-lg text-sm"
                      value={formData.startDate}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Fim</label>
                    <input
                      type="date"
                      className="w-full border border-gray-300 p-2 rounded-lg text-sm"
                      value={formData.endDate}
                      onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Observação</label>
                <input
                  className="w-full border border-gray-300 p-2 rounded-lg text-sm"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Opcional"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full bg-brand-600 text-white p-2 rounded-lg font-bold hover:bg-brand-700 disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                {saving ? 'Salvando...' : 'Adicionar'}
              </button>
            </form>
          </div>

          <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
            <h3 className="font-bold text-slate-800 mb-3">Detalhes do colaborador</h3>
            {!selectedUser && (
              <p className="text-xs text-slate-500">
                Clique no nome de um colaborador na grade para ver férias/folgas cadastradas e destacar o mês de aniversário.
              </p>
            )}

            {selectedUser && (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-800">{selectedUser.name}</p>
                  <p className="text-xs text-slate-500">{selectedUser.email}</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Mês de aniversário: {selectedUserBirthdayMonth !== undefined ? MONTH_LABELS[selectedUserBirthdayMonth] : 'Não informado'}
                  </p>
                  {pendingBirthdayMonthByUser.has(selectedUser.id) && (
                    <p className="text-xs text-amber-700 mt-1 font-semibold">
                      ! Folga de aniversário ainda não cadastrada no mês ideal.
                    </p>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Resumo do período</p>

                  {selectedUserLeaveSummary.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {selectedUserLeaveSummary.map((item) => (
                        <div key={item.code} className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-sm border border-slate-300"
                              style={{ backgroundColor: item.color || '#94a3b8' }}
                            />
                            <span className="text-slate-700 truncate">{item.name}</span>
                          </div>
                          <span className="text-slate-600 font-semibold whitespace-nowrap">{item.totalDays} dia(s) • {item.totalEvents} registro(s)</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-400">Sem férias/folgas cadastradas para este colaborador neste ano.</p>
                  )}
                </div>

                <div className="space-y-2 max-h-[330px] overflow-y-auto pr-1">
                  {selectedUserLeaves.map((leave) => {
                    const leaveType = leaveTypeMap.get(normalizeCode(leave.leaveTypeCode));

                    return (
                      <div key={leave.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-800">{leaveType?.name || leave.leaveTypeCode}</p>
                            <p className="text-slate-600 mt-1">{formatLeavePeriodLabel(leave)}</p>
                            {leave.notes && <p className="text-slate-500 mt-1">{leave.notes}</p>}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteLeave(leave.id)}
                            className="text-red-500 hover:text-red-700"
                            title="Remover"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {selectedUserLeaves.length === 0 && (
                    <p className="text-xs text-slate-400">Nenhum agendamento para este colaborador no ano selecionado.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
