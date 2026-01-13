

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { User, Project, TimesheetEntry, TimesheetPeriod, formatHours, formatPercentage } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { Download, AlertCircle, Loader2, CheckCircle, XCircle, ArrowRight, Search, Clock, Calendar, Briefcase, FileText } from 'lucide-react';
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

  // --- Review Modal State ---
  const [reviewPeriod, setReviewPeriod] = useState<TimesheetPeriod | null>(null);
  const [reviewDetails, setReviewDetails] = useState<{
      entries: TimesheetEntry[];
      totalHours: number;
      expectedHours: number;
      projectSummary: { project: Project; hours: number; percentage: number }[];
  } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [processingAction, setProcessingAction] = useState(false);

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
        userName: allUsers.find(u => u.id === a.userId)?.name || 'Desconhecido',
        userAvatar: allUsers.find(u => u.id === a.userId)?.avatarUrl
    }));
    setPendingApprovals(approvalsWithNames);

    const myTeamIds = myTeam.map(m => m.id);
    const filteredEntries = allEntries.filter(e => myTeamIds.includes(e.userId));
    setTeamEntries(filteredEntries);
    
    // Filter projects relevant to this manager to avoid clutter
    const relevantProjects = user.role === 'ADMIN' 
        ? allProjects 
        : allProjects.filter(p => !p.allowedManagerIds?.length || p.allowedManagerIds.includes(user.id));
        
    setProjects(relevantProjects);

    await calculateStats(myTeam, filteredEntries, relevantProjects);
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

    // Project Budget Stats (Only for filtered projects)
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

  // --- Review Logic ---

  const openReviewModal = async (period: TimesheetPeriod) => {
      setProcessingAction(true);
      // Fetch specific data for this period
      const [allEntries, expected] = await Promise.all([
          store.getEntries(period.userId),
          store.getExpectedHours(period.year, period.month)
      ]);

      const periodEntries = allEntries.filter(e => {
          const d = new Date(e.date);
          return d.getFullYear() === period.year && d.getMonth() === period.month;
      }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const total = periodEntries.reduce((acc, curr) => acc + curr.hours, 0);

      // Group by Project
      const projMap = new Map<string, number>();
      periodEntries.forEach(e => {
          const current = projMap.get(e.projectId) || 0;
          projMap.set(e.projectId, current + e.hours);
      });

      const projSummary = Array.from(projMap.entries()).map(([pid, hours]) => {
          // Projects might contain filtered list, we need to find from full list if possible or ensure projects contains everything
          // But since we filtered projects in loadData, we might miss some if the user worked on a project that is no longer relevant?
          // To be safe, we try to find it in the current filtered list.
          const proj = projects.find(p => p.id === pid) || { code: 'N/A', name: 'Projeto Desconhecido' } as Project;
          return {
              project: proj,
              hours: hours,
              percentage: total > 0 ? (hours / total) * 100 : 0
          };
      }).sort((a, b) => b.hours - a.hours);

      setReviewDetails({
          entries: periodEntries,
          totalHours: total,
          expectedHours: expected,
          projectSummary: projSummary
      });
      setReviewPeriod(period);
      setRejectReason('');
      setShowRejectInput(false);
      setProcessingAction(false);
  };

  const closeReviewModal = () => {
      setReviewPeriod(null);
      setReviewDetails(null);
  };

  const handleApprove = async () => {
      if (!reviewPeriod) return;
      setProcessingAction(true);
      await store.approvePeriod(reviewPeriod.id);
      await loadData();
      setProcessingAction(false);
      closeReviewModal();
  };

  const handleReject = async () => {
      if (!reviewPeriod || !rejectReason) return;
      setProcessingAction(true);
      await store.rejectPeriod(reviewPeriod.id, rejectReason);
      await loadData();
      setProcessingAction(false);
      closeReviewModal();
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
            {pendingApprovals.length > 0 ? (
                <div className="bg-white rounded-xl shadow-md border border-brand-100 overflow-hidden ring-1 ring-brand-100">
                    <div className="p-4 bg-brand-50 border-b border-brand-100 flex justify-between items-center">
                        <h3 className="font-bold text-brand-800 flex items-center gap-2">
                            <Clock size={20} className="text-brand-600" /> 
                            Aprovações Pendentes <span className="bg-brand-600 text-white text-xs px-2 py-0.5 rounded-full">{pendingApprovals.length}</span>
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="text-slate-500 font-semibold border-b border-gray-100 bg-white">
                                <tr>
                                    <th className="px-6 py-3">Colaborador</th>
                                    <th className="px-6 py-3">Período de Referência</th>
                                    <th className="px-6 py-3 text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {pendingApprovals.map(p => (
                                    <tr key={p.id} className="hover:bg-brand-50/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs">
                                                    {(p.userName || 'U').substring(0,2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-slate-800">{p.userName}</p>
                                                    <p className="text-xs text-slate-500">Solicitado em: {new Date(p.updatedAt).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-slate-600">
                                            {new Date(p.year, p.month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => openReviewModal(p)}
                                                disabled={processingAction}
                                                className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-brand-700 shadow-sm shadow-brand-500/20 flex items-center gap-2 ml-auto"
                                            >
                                                <Search size={16} /> Analisar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-8 text-center">
                    <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                        <CheckCircle size={24} />
                    </div>
                    <h3 className="text-lg font-medium text-slate-800">Tudo em dia!</h3>
                    <p className="text-slate-500">Você não possui timesheets pendentes de aprovação.</p>
                </div>
            )}

            {/* Divergence Alerts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {teamStats.filter(s => s.divergence < -10).map((s, idx) => (
                    <div key={idx} className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start gap-3">
                        <AlertCircle className="text-red-500 shrink-0" size={20} />
                        <div onClick={() => navigate(`/manager/reports?userId=${s.id}`)} className="cursor-pointer group">
                            <p className="font-bold text-red-900 text-sm group-hover:underline">{s.name}</p>
                            <p className="text-xs text-red-700">Pendente: {formatHours(Math.abs(s.divergence))}h</p>
                        </div>
                    </div>
                ))}
                {teamStats.filter(s => s.divergence > 10).map((s, idx) => (
                    <div key={idx} className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-lg flex items-start gap-3">
                        <AlertCircle className="text-yellow-600 shrink-0" size={20} />
                        <div onClick={() => navigate(`/manager/reports?userId=${s.id}`)} className="cursor-pointer group">
                            <p className="font-bold text-yellow-900 text-sm group-hover:underline">{s.name}</p>
                            <p className="text-xs text-yellow-700">Excesso: {formatHours(s.divergence)}h</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Team Hours Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-96 overflow-y-auto">
                <h3 className="text-lg font-semibold text-slate-800 mb-6">Desempenho da Equipe (Mês Atual)</h3>
                <ResponsiveContainer width="100%" height={Math.max(300, teamStats.length * 40)}>
                    <BarChart data={teamStats} layout="vertical" margin={{ left: 40, right: 20 }}>
                        <XAxis type="number" hide />
                        <YAxis 
                            dataKey="name" 
                            type="category" 
                            width={120} 
                            tick={{fontSize: 12, cursor: 'pointer'}} 
                            onClick={(data) => {
                                const user = teamStats.find(t => t.name === data.value);
                                if(user) navigate(`/manager/reports?userId=${user.id}`);
                            }}
                        />
                        <Tooltip cursor={{fill: '#F0EFEA'}} />
                        <Legend />
                        <Bar dataKey="expected" name="Esperado" fill="#D1D0CB" barSize={24} radius={[0, 4, 4, 0]} />
                        <Bar dataKey="actual" name="Realizado" fill="#0033C6" barSize={24} radius={[0, 4, 4, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Project Budget Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-96 overflow-x-auto">
                <h3 className="text-lg font-semibold text-slate-800 mb-6">Orçado vs Realizado (Projetos da Equipe)</h3>
                <ResponsiveContainer width={Math.max(600, projectBudgets.length * 120)} height="85%">
                    <BarChart data={projectBudgets} margin={{ bottom: 20, left: 20, right: 20 }}>
                        <XAxis 
                            dataKey="name" 
                            tick={{fontSize: 12, cursor: 'pointer'}} 
                            angle={-45}
                            textAnchor="end"
                            height={80}
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
                                        <p>Realizado: {formatHours(data.consumed)}h</p>
                                        <p>Percentual: {formatPercentage((data.consumed/data.budget)*100)}%</p>
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
                            barSize={40}
                        />
                        <Bar 
                            dataKey="consumed" 
                            name="Consumido" 
                            fill="#0033C6"
                            onClick={(data) => navigate(`/manager/reports?projectId=${data.id}`)}
                            cursor="pointer"
                            barSize={40}
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

      {/* --- Detailed Review Modal --- */}
      {reviewPeriod && reviewDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
                  
                  {/* Header */}
                  <div className="bg-brand-600 p-6 flex justify-between items-center shrink-0">
                      <div>
                          <h2 className="text-xl font-bold text-white flex items-center gap-3">
                              Análise de Timesheet
                              <span className="text-brand-200 text-sm font-normal border border-brand-400 px-2 py-0.5 rounded">
                                  {new Date(reviewPeriod.year, reviewPeriod.month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}
                              </span>
                          </h2>
                          <p className="text-brand-100 text-sm mt-1 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-white"></span>
                              Colaborador: <strong>{reviewPeriod['userName']}</strong>
                          </p>
                      </div>
                      <button onClick={closeReviewModal} className="text-brand-200 hover:text-white transition-colors p-2">
                          <XCircle size={28} />
                      </button>
                  </div>

                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
                      
                      {/* KPI Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                              <p className="text-xs text-slate-500 font-bold uppercase mb-1">Total Lançado</p>
                              <div className="flex items-baseline gap-2">
                                  <span className="text-2xl font-bold text-slate-800">{formatHours(reviewDetails.totalHours)}h</span>
                                  <span className="text-xs text-slate-400">/ {formatHours(reviewDetails.expectedHours)}h</span>
                              </div>
                              <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3">
                                  <div 
                                    className={`h-1.5 rounded-full ${reviewDetails.totalHours >= reviewDetails.expectedHours ? 'bg-green-500' : 'bg-brand-500'}`} 
                                    style={{width: `${Math.min((reviewDetails.totalHours/reviewDetails.expectedHours)*100, 100)}%`}}
                                  ></div>
                              </div>
                          </div>
                          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                              <p className="text-xs text-slate-500 font-bold uppercase mb-1">Divergência</p>
                              <div className={`text-2xl font-bold ${Math.abs(reviewDetails.totalHours - reviewDetails.expectedHours) < 1 ? 'text-green-600' : 'text-amber-600'}`}>
                                  {formatHours(reviewDetails.totalHours - reviewDetails.expectedHours)}h
                              </div>
                              <p className="text-xs text-slate-400 mt-1">Saldo do período</p>
                          </div>
                          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                              <p className="text-xs text-slate-500 font-bold uppercase mb-1">Projetos Atuados</p>
                              <div className="text-2xl font-bold text-slate-800">
                                  {reviewDetails.projectSummary.length}
                              </div>
                              <p className="text-xs text-slate-400 mt-1">Trabalhos distintos</p>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          
                          {/* Left: Project Breakdown */}
                          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 h-fit">
                              <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                  <Briefcase size={18} /> Resumo por Projeto
                              </h3>
                              <div className="space-y-4">
                                  {reviewDetails.projectSummary.map((item, idx) => (
                                      <div key={idx}>
                                          <div className="flex justify-between text-sm mb-1">
                                              <span className="font-medium text-slate-700">{item.project?.code || 'N/A'} - {item.project?.name || 'N/A'}</span>
                                              <span className="font-bold text-slate-900">{formatHours(item.hours)}h</span>
                                          </div>
                                          <div className="w-full bg-gray-100 h-2 rounded-full">
                                              <div className="bg-brand-500 h-2 rounded-full" style={{width: `${item.percentage}%`}}></div>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          </div>

                          {/* Right: Detailed Entries Table */}
                          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[400px]">
                              <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between sticky top-0">
                                  <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                      <FileText size={18} /> Lançamentos ({reviewDetails.entries.length})
                                  </h3>
                              </div>
                              <div className="overflow-y-auto flex-1 p-0">
                                  <table className="w-full text-left text-sm">
                                      <thead className="bg-white text-slate-500 text-xs font-semibold sticky top-0 shadow-sm">
                                          <tr>
                                              <th className="px-4 py-2 bg-gray-50">Data</th>
                                              <th className="px-4 py-2 bg-gray-50">Projeto</th>
                                              <th className="px-4 py-2 bg-gray-50">Horas</th>
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                          {reviewDetails.entries.map(e => (
                                              <tr key={e.id} className="hover:bg-brand-50/20">
                                                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                                                      {new Date(e.date).toLocaleDateString('pt-BR')}
                                                  </td>
                                                  <td className="px-4 py-2">
                                                      <div className="font-medium text-slate-800">{projects.find(p=>p.id===e.projectId)?.code}</div>
                                                      <div className="text-xs text-slate-400 truncate max-w-[150px]" title={e.description}>{e.description}</div>
                                                  </td>
                                                  <td className="px-4 py-2 font-bold text-slate-700">{e.hours}</td>
                                              </tr>
                                          ))}
                                      </tbody>
                                  </table>
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* Footer / Actions */}
                  <div className="p-6 border-t border-gray-200 bg-white shrink-0">
                      {showRejectInput ? (
                          <div className="animate-in slide-in-from-bottom duration-300">
                              <label className="block text-sm font-bold text-red-600 mb-2">Motivo da Devolução (Obrigatório)</label>
                              <textarea 
                                  className="w-full border border-red-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-red-500 outline-none"
                                  rows={2}
                                  placeholder="Descreva o que precisa ser ajustado..."
                                  value={rejectReason}
                                  onChange={e => setRejectReason(e.target.value)}
                              />
                              <div className="flex justify-end gap-3 mt-3">
                                  <button 
                                      onClick={() => setShowRejectInput(false)}
                                      className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg"
                                  >
                                      Cancelar
                                  </button>
                                  <button 
                                      onClick={handleReject}
                                      disabled={!rejectReason.trim() || processingAction}
                                      className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg flex items-center gap-2"
                                  >
                                      {processingAction ? <Loader2 className="animate-spin" size={18} /> : <XCircle size={18} />}
                                      Confirmar Devolução
                                  </button>
                              </div>
                          </div>
                      ) : (
                          <div className="flex justify-between items-center">
                              <p className="text-sm text-slate-500">
                                  Atenção: Ao aprovar, o período será fechado definitivamente.
                              </p>
                              <div className="flex gap-4">
                                  <button 
                                      onClick={() => setShowRejectInput(true)}
                                      className="px-6 py-3 border border-red-200 text-red-600 font-bold rounded-lg hover:bg-red-50 hover:border-red-300 transition-colors flex items-center gap-2"
                                  >
                                      <XCircle size={18} /> Devolver / Rejeitar
                                  </button>
                                  <button 
                                      onClick={handleApprove}
                                      disabled={processingAction}
                                      className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg shadow-green-500/30 transition-colors flex items-center gap-2"
                                  >
                                      {processingAction ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                                      Aprovar Timesheet
                                  </button>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
