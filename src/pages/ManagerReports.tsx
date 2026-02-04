

import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { store } from '../services/store';
import { User, Project, TimesheetEntry, formatHours } from '../types';
import { Filter, Loader2, Download } from 'lucide-react';

const parseLocalDate = (dateStr: string) => new Date(`${dateStr}T00:00:00`);

export const ManagerReports: React.FC = () => {
  const location = useLocation();
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterData, setFilterData] = useState({
      userId: '',
      projectId: '',
      startDate: '',
      endDate: ''
  });

  useEffect(() => {
    // Parse Query Params for Deep Linking
    const params = new URLSearchParams(location.search);
    setFilterData(prev => ({
        ...prev,
        userId: params.get('userId') || '',
        projectId: params.get('projectId') || '',
    }));

    loadData();
  }, [location.search]);

  const loadData = async () => {
    setLoading(true);
    const currentUser = store.getCurrentUser();
    if (!currentUser) return;

    const allUsers = await store.getUsers();
    
    // Filter users to only show my team (including sub-managers and their teams)
    let myTeam = [];
    if (currentUser.role === 'ADMIN') {
        myTeam = allUsers;
    } else {
        // Include: self, direct reports, managers who report to me
        myTeam = allUsers.filter(u => 
            u.id === currentUser.id ||  // Self
            u.managerId === currentUser.id ||  // Direct reports
            (u.role === 'MANAGER' && allUsers.some(sub => sub.managerId === u.id && allUsers.some(parent => parent.id === currentUser.id && (sub.managerId === currentUser.id || parent.id === u.managerId))))
        );
        
        // Also include all users who report to managers in my team
        const directManagerIds = [currentUser.id];
        const allManagerIds = new Set<string>(directManagerIds);
        
        // Find all managers who report to me
        allUsers.forEach(u => {
            if (u.managerId === currentUser.id && u.role === 'MANAGER') {
                allManagerIds.add(u.id);
            }
        });
        
        // Include me, my direct reports, and reports of managers under me
        myTeam = allUsers.filter(u => 
            u.id === currentUser.id || 
            u.managerId === currentUser.id ||
            Array.from(allManagerIds).includes(u.managerId || '')
        );
    }
    setUsers(myTeam);

    const [allEntries, allProjects] = await Promise.all([
        store.getEntries(),
        store.getProjects()
    ]);
    
    console.log('DEBUG: allEntries sample:', allEntries.slice(0, 3));
    console.log('DEBUG: allEntries febrero count:', allEntries.filter(e => e.date.includes('2026-02')).length);
    console.log('DEBUG: allEntries enero count:', allEntries.filter(e => e.date.includes('2026-01')).length);
    console.log('DEBUG: Kelson entries in allEntries:', allEntries.filter(e => e.userId === '86442e36-66e4-4a6f-917c-2afbd4238d28'));
    
    // Pre-filter entries to only show my team
    const myTeamIds = myTeam.map(m => m.id);
    const teamEntries = allEntries.filter(e => myTeamIds.includes(e.userId));
    
    console.log('DEBUG ManagerReports:', {
      currentUserRole: currentUser.role,
      currentUserId: currentUser.id,
      allUsersCount: allUsers.length,
      myTeamCount: myTeam.length,
      allEntriesCount: allEntries.length,
      teamEntriesCount: teamEntries.length,
      kelsonInTeam: myTeamIds.includes('86442e36-66e4-4a6f-917c-2afbd4238d28'),
      kelsonEntriesInAll: allEntries.filter(e => e.userId === '86442e36-66e4-4a6f-917c-2afbd4238d28').length,
      kelsonEntriesInTeam: teamEntries.filter(e => e.userId === '86442e36-66e4-4a6f-917c-2afbd4238d28').length
    });
    
    setEntries(teamEntries);
    
    // Filter projects for the dropdown (Avoid clutter)
    const visibleProjects = currentUser.role === 'ADMIN' 
        ? allProjects 
        : allProjects.filter(p => !p.allowedManagerIds?.length || p.allowedManagerIds.includes(currentUser.id));
    
    setProjects(visibleProjects);
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
    link.setAttribute("download", `report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getUserName = (id: string) => users.find(u => u.id === id)?.name || id;
  const getProjectName = (id: string) => projects.find(p => p.id === id)?.name || id;

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
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
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
                        {filteredEntries.map(e => (
                            <tr key={e.id} className="hover:bg-slate-50">
                                <td className="px-6 py-3 whitespace-nowrap">{parseLocalDate(e.date).toLocaleDateString('pt-BR')}</td>
                                <td className="px-6 py-3">{getUserName(e.userId)}</td>
                                <td className="px-6 py-3">{getProjectName(e.projectId)}</td>
                                <td className="px-6 py-3 text-slate-500 truncate max-w-xs">{e.description}</td>
                                <td className="px-6 py-3 text-right font-medium">{formatHours(e.hours)}</td>
                            </tr>
                        ))}
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
