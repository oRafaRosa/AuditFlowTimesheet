

import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { store } from '../services/store';
import { CalendarException, Holiday, User, Project, TimesheetEntry, HOURS_PER_DAY, formatHours } from '../types';
import { Filter, Loader2, Download, AlertTriangle, AlertOctagon, Copy } from 'lucide-react';
import { formatDateForDisplay, formatLocalDate } from '../utils/date';
import { buildCalendarMaps, isExpectedWorkingDay } from '../utils/workCalendar';

export const ManagerReports: React.FC = () => {
  const location = useLocation();
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [exceptions, setExceptions] = useState<CalendarException[]>([]);
    const [dailyHourLimit, setDailyHourLimit] = useState(10);
  const [filteredEntries, setFilteredEntries] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(true);

    // filtros
  const [filterData, setFilterData] = useState({
      userId: '',
      projectId: '',
      startDate: '',
      endDate: ''
  });

  useEffect(() => {
    // parse dos params da url pro deep link
    const params = new URLSearchParams(location.search);
    setFilterData(prev => ({
        ...prev,
        userId: params.get('userId') || '',
        projectId: params.get('projectId') || '',
    }));

    loadData();
  }, [location.search]);

  useEffect(() => {
    const currentUser = store.getCurrentUser();
    if (!currentUser) return;

    store.recordUserActivityEvent(currentUser.id, 'REPORT_VIEW');
  }, []);

  const loadData = async () => {
    setLoading(true);
    const currentUser = store.getCurrentUser();
    if (!currentUser) return;

    const allUsers = await store.getUsers();
    
    // filtra usuários pra mostrar só minha equipe (inclui subgestores e times deles)
    let myTeam = [];
    if (currentUser.role === 'ADMIN') {
        myTeam = allUsers;
    } else {
        // inclui: eu, diretos e gestores que respondem pra mim
        myTeam = allUsers.filter(u => 
            u.id === currentUser.id ||  // eu
            u.managerId === currentUser.id ||  // diretos
            (u.role === 'MANAGER' && allUsers.some(sub => sub.managerId === u.id && allUsers.some(parent => parent.id === currentUser.id && (sub.managerId === currentUser.id || parent.id === u.managerId))))
        );
        
        // também inclui quem responde pros gestores do meu time
        const directManagerIds = [currentUser.id];
        const allManagerIds = new Set<string>(directManagerIds);
        
        // acha todos os gestores que me reportam
        allUsers.forEach(u => {
            if (u.managerId === currentUser.id && u.role === 'MANAGER') {
                allManagerIds.add(u.id);
            }
        });
        
        // inclui eu, meus diretos e os diretos dos gestores abaixo
        myTeam = allUsers.filter(u => 
            u.id === currentUser.id || 
            u.managerId === currentUser.id ||
            Array.from(allManagerIds).includes(u.managerId || '')
        );
    }
    setUsers(myTeam);

    const [allEntries, allProjects, allHolidays, allExceptions, configuredDailyHourLimit] = await Promise.all([
        store.getEntries(),
        store.getProjects(),
        store.getHolidays(),
        store.getExceptions(),
        store.getDailyHourLimit()
    ]);
    
    // pré-filtro das entradas só da minha equipe
    const myTeamIds = myTeam.map(m => m.id);
    const teamEntries = allEntries.filter(e => myTeamIds.includes(e.userId));
    
    setEntries(teamEntries);
    
    // filtra projetos pro dropdown (menos bagunça)
    const visibleProjects = currentUser.role === 'ADMIN' 
        ? allProjects 
        : allProjects.filter(p => !p.allowedManagerIds?.length || p.allowedManagerIds.includes(currentUser.id));
    
    setProjects(visibleProjects);
    setHolidays(allHolidays);
    setExceptions(allExceptions);
        setDailyHourLimit(configuredDailyHourLimit);
    setLoading(false);
  };

  useEffect(() => {
    if (!loading) applyFilters();
  }, [filterData, entries, loading]);

  const applyFilters = () => {
      let result = entries;

      if (filterData.startDate) {
          result = result.filter(e => e.date >= filterData.startDate);
      }
      if (filterData.endDate) {
          result = result.filter(e => e.date <= filterData.endDate);
      }
      if (filterData.projectId) {
          result = result.filter(e => e.projectId === filterData.projectId);
      }
      if (filterData.userId) {
          result = result.filter(e => e.userId === filterData.userId);
      }

      setFilteredEntries(result);
  };

    const getDailyTotalForUser = (userId: string, date: string) => {
        return entries
            .filter((entry) => entry.userId === userId && entry.date === date)
            .reduce((acc, curr) => acc + curr.hours, 0);
    };

    const isDuplicate = (entry: TimesheetEntry) => {
        return entries.filter(e =>
            e.id !== entry.id &&
            e.userId === entry.userId &&
            e.date === entry.date &&
            e.projectId === entry.projectId &&
            e.hours === entry.hours &&
            e.description === entry.description
        ).length > 0;
    };

  const handleExport = () => {
    const header = ['Data', 'Usuário', 'Projeto', 'Horas', 'Descrição'];
    const rows = filteredEntries.map(e => {
        const user = users.find(u => u.id === e.userId)?.name || 'N/A';
        const proj = projects.find(p => p.id === e.projectId)?.name || 'N/A';
        return [e.date, user, proj, e.hours, `"${e.description}"`];
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `report_${formatLocalDate()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getUserName = (id: string) => users.find(u => u.id === id)?.name || id;
  const getProjectName = (id: string) => projects.find(p => p.id === id)?.name || id;
    const calendarMaps = buildCalendarMaps(holidays, exceptions);

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-brand-600" size={48} /></div>;

  return (
    <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-800">Relatórios Gerenciais</h1>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Data Início</label>
                    <input type="date" className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={filterData.startDate} onChange={e => setFilterData({...filterData, startDate: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Data Fim</label>
                    <input type="date" className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={filterData.endDate} onChange={e => setFilterData({...filterData, endDate: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Colaborador</label>
                    <select className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={filterData.userId} onChange={e => setFilterData({...filterData, userId: e.target.value})}>
                        <option value="">Todos da Equipe</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.isActive === false ? `${u.name} (Inativo)` : u.name}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Projeto</label>
                    <select className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={filterData.projectId} onChange={e => setFilterData({...filterData, projectId: e.target.value})}>
                        <option value="">Todos da Equipe</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                    </select>
                </div>
            </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                <h3 className="font-semibold text-slate-700 flex items-center gap-2"><Filter size={18} /> Resultados</h3>
                <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-brand-600 bg-brand-50 px-3 py-1 rounded-full">
                        Total: {formatHours(filteredEntries.reduce((acc, curr) => acc + curr.hours, 0))}h
                    </span>
                    <button onClick={handleExport} className="text-slate-500 hover:text-brand-600">
                        <Download size={20} />
                    </button>
                </div>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-white sticky top-0 z-10 font-semibold text-slate-500 border-b border-gray-200 shadow-sm">
                        <tr>
                            <th className="px-6 py-3">Data</th>
                            <th className="px-6 py-3">Colaborador</th>
                            <th className="px-6 py-3">Projeto</th>
                            <th className="px-6 py-3">Descrição</th>
                            <th className="px-6 py-3 text-right">Horas</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredEntries.map(e => {
                            const user = users.find(u => u.id === e.userId);
                            const requiresTimesheet = user?.requiresTimesheet !== false;
                            const totalDayHours = getDailyTotalForUser(e.userId, e.date);
                            const isWorkingDay = isExpectedWorkingDay(e.date, calendarMaps);
                            const isOverConfiguredLimit = requiresTimesheet && totalDayHours > dailyHourLimit;
                            const isOverLimit = requiresTimesheet && totalDayHours > HOURS_PER_DAY;
                            const isUnderLimit = requiresTimesheet && isWorkingDay && totalDayHours < HOURS_PER_DAY;
                            const hasDuplicate = isDuplicate(e);
                            const hasAlert = isOverLimit || isUnderLimit || hasDuplicate;

                            return (
                            <tr key={e.id} className={`${isOverConfiguredLimit ? 'bg-red-100 hover:bg-red-200' : hasAlert ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-slate-50'}`}>
                                <td className="px-6 py-3 whitespace-nowrap">{formatDateForDisplay(e.date)}</td>
                                <td className="px-6 py-3">
                                    <div className="flex items-center gap-2">
                                        <span>{getUserName(e.userId)}</span>
                                        {hasAlert && (
                                            <div className="group relative">
                                                <AlertTriangle size={14} className="text-amber-600 cursor-help" />
                                                <span className="hidden group-hover:block absolute left-5 top-0 bg-slate-800 text-white text-xs p-1.5 rounded z-50 w-64">
                                                    {isOverConfiguredLimit && `Dia com ${formatHours(totalDayHours)}h (acima do limite diário de ${formatHours(dailyHourLimit)}h). `}
                                                    {isOverLimit && `Dia com ${formatHours(totalDayHours)}h (acima de ${formatHours(HOURS_PER_DAY)}h). `}
                                                    {isUnderLimit && `Dia com ${formatHours(totalDayHours)}h (abaixo de ${formatHours(HOURS_PER_DAY)}h em dia útil). `}
                                                    {hasDuplicate && 'Possível lançamento duplicado detectado.'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-3">{getProjectName(e.projectId)}</td>
                                <td className="px-6 py-3 text-slate-500 truncate max-w-xs">{e.description}</td>
                                <td className={`px-6 py-3 text-right font-medium ${isOverConfiguredLimit ? 'text-red-700' : (isOverLimit || isUnderLimit) ? 'text-amber-700' : ''}`}>
                                    <div className="flex items-center justify-end gap-2">
                                        {isOverConfiguredLimit && <AlertOctagon size={14} className="text-red-600" />}
                                        {!isOverConfiguredLimit && (isOverLimit || isUnderLimit) && <AlertOctagon size={14} className="text-amber-600" />}
                                        {hasDuplicate && <Copy size={14} className="text-red-500" />}
                                        <span>{formatHours(e.hours)}</span>
                                    </div>
                                </td>
                            </tr>
                        )})}
                        {filteredEntries.length === 0 && (
                            <tr><td colSpan={5} className="p-8 text-center text-slate-400">Nenhum registro encontrado.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );
};
