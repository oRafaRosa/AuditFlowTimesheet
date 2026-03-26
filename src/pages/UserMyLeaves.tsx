import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { store } from '../services/store';
import { LeaveType, TeamLeave } from '../types';
import { formatDateForDisplay } from '../utils/date';

const normalizeCode = (value: string) => value.trim().toUpperCase();
const LOAD_TIMEOUT_MS = 12000;

const formatLeavePeriodLabel = (leave: TeamLeave) => {
  if (leave.startDate === leave.endDate) return formatDateForDisplay(leave.startDate);
  return `${formatDateForDisplay(leave.startDate)} a ${formatDateForDisplay(leave.endDate)}`;
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), timeoutMs);
    })
  ]);
};

export const UserMyLeaves: React.FC = () => {
  const currentUserId = store.getCurrentUser()?.id || '';
  const currentYear = new Date().getFullYear();

  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [leaves, setLeaves] = useState<TeamLeave[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let isMounted = true;
    const watchdog = window.setTimeout(() => {
      if (!isMounted) return;
      setLeaves([]);
      setLeaveTypes([]);
      setLoadError('Não consegui carregar sua programação agora. Tente novamente em instantes.');
      setLoading(false);
    }, LOAD_TIMEOUT_MS);

    const loadData = async () => {
      if (!isMounted) return;

      setLoading(true);
      setLoadError('');

      try {
        const currentUser = store.getCurrentUser();
        const resolvedUser = currentUser || await withTimeout(store.syncCurrentUserFromDatabase(), LOAD_TIMEOUT_MS);

        if (!resolvedUser) {
          if (!isMounted) return;
          setLeaves([]);
          setLeaveTypes([]);
          setLoadError('Não foi possível identificar seu usuário agora. Recarregue para tentar novamente.');
          return;
        }

        const [scopedLeaves, allLeaveTypes] = await withTimeout(
          Promise.all([
            store.getTeamLeaves({ userIds: [resolvedUser.id], year: selectedYear }),
            store.getLeaveTypes()
          ]),
          LOAD_TIMEOUT_MS
        );

        if (!isMounted) return;
        setLeaves(scopedLeaves);
        setLeaveTypes(allLeaveTypes.filter((type) => type.active !== false));
      } catch (error) {
        if (!isMounted) return;
        console.warn('Erro ao carregar programação de férias/folgas do usuário:', error);
        setLeaves([]);
        setLeaveTypes([]);
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

  const leaveTypeMap = useMemo(() => {
    const map = new Map<string, LeaveType>();
    leaveTypes.forEach((item) => map.set(normalizeCode(item.code), item));
    return map;
  }, [leaveTypes]);

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
          <p className="text-sm text-slate-500 mt-1">Consulta de férias e folgas já programadas no AuditFlow.</p>
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

      {sortedLeaves.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-5">
          <p className="text-sm text-slate-600">
            Ainda não há férias ou folgas programadas para você neste ano. Quando possível, alinhe com seu gestor;
            ele já tem acesso para incluir sua programação no AuditFlow.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <CalendarDays size={16} className="text-brand-600" />
            <h3 className="font-semibold text-slate-700">Programação do ano</h3>
          </div>

          <div className="p-4 space-y-2.5">
            {sortedLeaves.map((leave) => {
              const leaveType = leaveTypeMap.get(normalizeCode(leave.leaveTypeCode));
              const badgeColor = leaveType?.color || '#94a3b8';

              return (
                <div key={leave.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm border border-slate-300" style={{ backgroundColor: badgeColor }} />
                      <p className="text-sm font-semibold text-slate-800 truncate">{leaveType?.name || leave.leaveTypeCode}</p>
                    </div>
                    <p className="text-xs text-slate-600 whitespace-nowrap">{formatLeavePeriodLabel(leave)}</p>
                  </div>

                  {leave.notes && <p className="text-xs text-slate-500 mt-1.5">{leave.notes}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
