import React, { useEffect, useState } from 'react';
import { store } from '../services/store';
import { User, Project, TimesheetEntry, HOURS_PER_DAY } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { Download, AlertCircle, Loader2 } from 'lucide-react';

export const ManagerDashboard: React.FC = () => {
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [teamEntries, setTeamEntries] = useState<TimesheetEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamStats, setTeamStats] = useState<any[]>([]);
  const [projectBudgets, setProjectBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const currentUser = store.getCurrentUser();
    const allUsers = await store.getUsers();
    
    // Admins see all, Managers see their team
    let myTeam = [];
    if (currentUser?.role === 'ADMIN') {
        myTeam = allUsers;
    } else {
        myTeam = allUsers.filter(u => u.managerId === currentUser?.id || u.id === currentUser?.id);
    }
    setTeamMembers(myTeam);

    const allEntries = await store.getEntries();
    const myTeamIds = myTeam.map(m => m.id);
    const filteredEntries = allEntries.filter(e => myTeamIds.includes(e.userId));
    setTeamEntries(filteredEntries);

    const allProjects = await store.getProjects();
    setProjects(allProjects);

    await calculateStats(myTeam, filteredEntries, allProjects);
    setLoading(false);
  };

  const calculateStats = async (members: User[], entries: TimesheetEntry[], projs: Project[]) => {
    const today = new Date();
    const currentMonthExpected = await store.getExpectedHoursToDate(today.getFullYear(), today.getMonth());
    
    // Team Performance Stats
    const stats = members.map(m => {
        const memberEntries = entries.filter(e => {
            const d = new Date(e.date);
            return e.userId === m.id && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
        });
        const total = memberEntries.reduce((acc, curr) => acc + curr.hours, 0);
        return {
            name: m.name,
            actual: total,
            expected: currentMonthExpected,
            divergence: total - currentMonthExpected
        };
    });
    setTeamStats(stats);

    // Project Budget Stats
    const projStats = projs.filter(p => p.budgetedHours > 0).map(p => {
        const projEntries = entries.filter(e => e.projectId === p.id);
        const consumed = projEntries.reduce((acc, curr) => acc + curr.hours, 0);
        return {
            name: p.code,
            full_name: p.name,
            budget: p.budgetedHours,
            consumed: consumed
        };
    });
    setProjectBudgets(projStats);
  };

  const handleExport = () => {
    const header = ['Data', 'Usuário', 'Projeto', 'Horas', 'Descrição'];
    const rows = teamEntries.map(e => {
        const user = teamMembers.find(u => u.id === e.userId)?.name || 'N/A';
        const proj = projects.find(p => p.id === e.projectId)?.name || 'N/A';
        return [e.date, user, proj, e.hours, `"${e.description}"`];
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "timesheet_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
      return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-brand-600" size={48} /></div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
            <h1 className="text-2xl font-bold text-slate-800">Visão da Equipe</h1>
            <p className="text-slate-500">Acompanhamento de GRC e Auditoria</p>
        </div>
        <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-white hover:border-slate-400 transition-colors bg-white">
            <Download size={18} />
            Exportar CSV
        </button>
      </div>

      {/* Divergence Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {teamStats.filter(s => s.divergence < -10).map((s, idx) => (
            <div key={idx} className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start gap-3">
                <AlertCircle className="text-red-500 shrink-0" size={20} />
                <div>
                    <p className="font-bold text-red-900 text-sm">{s.name}</p>
                    <p className="text-xs text-red-700">Pendente: {Math.abs(s.divergence).toFixed(1)}h</p>
                </div>
            </div>
        ))}
        {teamStats.filter(s => s.divergence > 10).map((s, idx) => (
            <div key={idx} className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-lg flex items-start gap-3">
                <AlertCircle className="text-yellow-600 shrink-0" size={20} />
                <div>
                    <p className="font-bold text-yellow-900 text-sm">{s.name}</p>
                    <p className="text-xs text-yellow-700">Excesso: {s.divergence.toFixed(1)}h</p>
                </div>
            </div>
        ))}
        {teamStats.length === 0 && <p className="text-slate-400 text-sm col-span-2">Nenhum dado de equipe encontrado.</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Team Hours Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-96">
            <h3 className="text-lg font-semibold text-slate-800 mb-6">Desempenho da Equipe (Mês Atual)</h3>
            <ResponsiveContainer width="100%" height="90%">
                <BarChart data={teamStats} layout="vertical" margin={{ left: 40 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                    <Tooltip cursor={{fill: '#F0EFEA'}} />
                    <Legend />
                    <Bar dataKey="expected" name="Esperado" fill="#D1D0CB" barSize={20} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="actual" name="Realizado" fill="#0033C6" barSize={20} radius={[0, 4, 4, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>

        {/* Project Budget Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-96">
            <h3 className="text-lg font-semibold text-slate-800 mb-6">Orçado vs Realizado (Por Projeto)</h3>
            <ResponsiveContainer width="100%" height="90%">
                <BarChart data={projectBudgets}>
                    <XAxis dataKey="name" tick={{fontSize: 12}} />
                    <YAxis />
                    <Tooltip content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                                <div className="bg-white p-2 border border-slate-100 shadow-lg rounded text-xs">
                                    <p className="font-bold">{data.full_name}</p>
                                    <p>Orçado: {data.budget}h</p>
                                    <p>Realizado: {data.consumed.toFixed(1)}h</p>
                                    <p>Percentual: {((data.consumed/data.budget)*100).toFixed(0)}%</p>
                                </div>
                            );
                        }
                        return null;
                    }} />
                    <Bar dataKey="budget" name="Orçamento" fill="#D1D0CB" />
                    <Bar dataKey="consumed" name="Consumido" fill="#0033C6">
                        {projectBudgets.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={entry.consumed > entry.budget ? '#E71A3B' : '#0033C6'} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};