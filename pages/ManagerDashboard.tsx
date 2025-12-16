
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { User, Project, TimesheetEntry, TimesheetPeriod } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { Download, AlertCircle, Loader2, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { MyStatusWidget } from '../components/MyStatusWidget';

export const ManagerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [teamEntries, setTeamEntries] = useState<TimesheetEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teamStats, setTeamStats] = useState<any[]>([]);
  const [projectBudgets, setProjectBudgets] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<TimesheetPeriod[]>([]);
  const [loading, setLoading] = useState(true);

  // Rejection Modal
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const user = store.getCurrentUser();
    if (!user) return;
    setCurrentUser(user);

    const allUsers = await store.getUsers();
    
    // Admins see all, Managers see their team
    let myTeam = [];
    if (user.role === 'ADMIN') {
        myTeam = allUsers;
    } else {
        myTeam = allUsers.filter(u => u.managerId === user.id || u.id === user.id);
    }
    setTeamMembers(myTeam);

    const [allEntries, allProjects, approvals] = await Promise.all([
        store.getEntries(),
        store.getProjects(),
        store.getPendingApprovals(user.id)
    ]);
    
    // Associate user names to approvals
    const approvalsWithNames = approvals.map(a => ({
        ...a,
        userName: allUsers.find(u => u.id === a.userId)?.name || 'Desconhecido'
    }));
    setPendingApprovals(approvalsWithNames);

    const myTeamIds = myTeam.map(m => m.id);
    const filteredEntries = allEntries.filter(e => myTeamIds.includes(e.userId));
    setTeamEntries(filteredEntries);
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
            id: m.id,
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
            id: p.id,
            name: p.code,
            full_name: p.name,
            budget: p.budgetedHours,
            consumed: consumed
        };
    });
    setProjectBudgets(projStats);
  };

  const handleApprove = async (periodId: string) => {
      await store.approvePeriod(periodId);
      loadData();
  };

  const handleReject = async () => {
      if (rejectId && rejectReason) {
          await store.rejectPeriod(rejectId, rejectReason);
          setRejectId(null);
          setRejectReason('');
          loadData();
      }
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
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-8">
            {/* Pending Approvals Section */}
            {pendingApprovals.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-brand-100 overflow-hidden">
                    <div className="p-4 bg-brand-50 border-b border-brand-100 flex justify-between items-center">
                        <h3 className="font-bold text-brand-800 flex items-center gap-2">
                            <CheckCircle size={20} /> Aprovações Pendentes ({pendingApprovals.length})
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="text-slate-500 font-semibold border-b border-gray-100">
                                <tr>
                                    <th className="px-6 py-3">Colaborador</th>
                                    <th className="px-6 py-3">Período</th>
                                    <th className="px-6 py-3">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {pendingApprovals.map(p => (
                                    <tr key={p.id} className="hover:bg-brand-50/30">
                                        <td className="px-6 py-3 font-medium">
                                            <button 
                                                onClick={() => navigate(`/manager/reports?userId=${p.userId}`)}
                                                className="text-brand-600 hover:underline flex items-center gap-1"
                                            >
                                                {p['userName']} <ArrowRight size={12} />
                                            </button>
                                        </td>
                                        <td className="px-6 py-3">{p.month + 1}/{p.year}</td>
                                        <td className="px-6 py-3 flex gap-2">
                                            <button 
                                                onClick={() => handleApprove(p.id)}
                                                className="bg-green-100 text-green-700 px-3 py-1 rounded text-xs font-bold hover:bg-green-200"
                                            >
                                                Aprovar
                                            </button>
                                            <button 
                                                onClick={() => setRejectId(p.id)}
                                                className="bg-red-100 text-red-700 px-3 py-1 rounded text-xs font-bold hover:bg-red-200"
                                            >
                                                Devolver
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Divergence Alerts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {teamStats.filter(s => s.divergence < -10).map((s, idx) => (
                    <div key={idx} className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start gap-3">
                        <AlertCircle className="text-red-500 shrink-0" size={20} />
                        <div onClick={() => navigate(`/manager/reports?userId=${s.id}`)} className="cursor-pointer group">
                            <p className="font-bold text-red-900 text-sm group-hover:underline">{s.name}</p>
                            <p className="text-xs text-red-700">Pendente: {Math.abs(s.divergence).toFixed(1)}h</p>
                        </div>
                    </div>
                ))}
                {teamStats.filter(s => s.divergence > 10).map((s, idx) => (
                    <div key={idx} className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-lg flex items-start gap-3">
                        <AlertCircle className="text-yellow-600 shrink-0" size={20} />
                        <div onClick={() => navigate(`/manager/reports?userId=${s.id}`)} className="cursor-pointer group">
                            <p className="font-bold text-yellow-900 text-sm group-hover:underline">{s.name}</p>
                            <p className="text-xs text-yellow-700">Excesso: {s.divergence.toFixed(1)}h</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Team Hours Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-96">
                <h3 className="text-lg font-semibold text-slate-800 mb-6">Desempenho da Equipe (Mês Atual)</h3>
                <ResponsiveContainer width="100%" height="90%">
                    <BarChart data={teamStats} layout="vertical" margin={{ left: 40 }}>
                        <XAxis type="number" hide />
                        <YAxis 
                            dataKey="name" 
                            type="category" 
                            width={100} 
                            tick={{fontSize: 12, cursor: 'pointer'}} 
                            onClick={(data) => {
                                const user = teamStats.find(t => t.name === data.value);
                                if(user) navigate(`/manager/reports?userId=${user.id}`);
                            }}
                        />
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
                        <XAxis 
                            dataKey="name" 
                            tick={{fontSize: 12, cursor: 'pointer'}} 
                            onClick={(data) => {
                                const proj = projectBudgets.find(p => p.name === data.value); 
                            }}
                        />
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
                        <Bar 
                            dataKey="budget" 
                            name="Orçamento" 
                            fill="#D1D0CB" 
                            onClick={(data) => navigate(`/manager/reports?projectId=${data.id}`)}
                            cursor="pointer"
                        />
                        <Bar 
                            dataKey="consumed" 
                            name="Consumido" 
                            fill="#0033C6"
                            onClick={(data) => navigate(`/manager/reports?projectId=${data.id}`)}
                            cursor="pointer"
                        >
                            {projectBudgets.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.consumed > entry.budget ? '#E71A3B' : '#0033C6'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Right Column: Personal Status (Manager also has to submit timesheets) */}
        <div className="space-y-6">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Meu Controle</h3>
            {currentUser && <MyStatusWidget userId={currentUser.id} />}
        </div>
      </div>

      {/* Reject Modal */}
      {rejectId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-lg p-6 max-w-sm w-full">
                  <h3 className="font-bold text-lg mb-4">Motivo da Devolução</h3>
                  <textarea 
                    className="w-full border border-gray-300 rounded p-2 text-sm mb-4" 
                    rows={4}
                    placeholder="Explique o que precisa ser corrigido..."
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                      <button onClick={() => setRejectId(null)} className="px-4 py-2 text-slate-600">Cancelar</button>
                      <button onClick={handleReject} className="px-4 py-2 bg-red-600 text-white rounded font-bold">Confirmar Devolução</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
