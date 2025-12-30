

import React, { useEffect, useState } from 'react';
import { store } from '../services/store';
import { TimesheetEntry, Project, HOURS_PER_DAY, TimesheetPeriod } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Clock, Calendar, CheckCircle, AlertTriangle, Plus, Trash2, Loader2, Lock, XCircle, Search, Filter } from 'lucide-react';
import { MyStatusWidget } from '../components/MyStatusWidget';

export const UserDashboard: React.FC = () => {
  const user = store.getCurrentUser();
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [periodStatus, setPeriodStatus] = useState<TimesheetPeriod | null>(null);
  
  // State separation: 
  // selectableProjects = Active projects allowed for NEW entries
  // allProjectsHistory = ALL projects (active or inactive) for displaying names in tables
  const [selectableProjects, setSelectableProjects] = useState<Project[]>([]);
  const [allProjectsHistory, setAllProjectsHistory] = useState<Project[]>([]);
  
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [entryFilterDate, setEntryFilterDate] = useState('');

  // KPI States
  const [currentMonthHours, setCurrentMonthHours] = useState(0);
  const [expectedHours, setExpectedHours] = useState(0);
  const [pendingHours, setPendingHours] = useState(0);
  const [monthlyData, setMonthlyData] = useState<any[]>([]);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'single' | 'bulk'>('single');
  const [formData, setFormData] = useState({
    projectId: '',
    date: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0], // for bulk
    hours: HOURS_PER_DAY,
    description: ''
  });

  useEffect(() => {
    if (user?.id) {
        loadData();
    }
  }, [user?.id]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    const [allEntries, allProjects, status] = await Promise.all([
        store.getEntries(user.id),
        store.getProjects(),
        store.getPeriodStatus(user.id, currentYear, currentMonth)
    ]);

    setPeriodStatus(status);
    setEntries(allEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    
    // 1. Store ALL projects for history lookup (so inactive projects still show names in the table)
    setAllProjectsHistory(allProjects);

    // 2. Filter projects for the Dropdown (Active & Permissioned only)
    const availableProjects = allProjects.filter(p => {
        if (!p.active) return false; // Must be active
        
        // Permission logic
        if (!p.allowedManagerIds || p.allowedManagerIds.length === 0) return true;
        if (p.allowedManagerIds.includes(user.id)) return true;
        if (user.managerId && p.allowedManagerIds.includes(user.managerId)) return true;
        return false;
    });

    setSelectableProjects(availableProjects);

    // Calc KPIs
    const currentMonthEntries = allEntries.filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const totalHours = currentMonthEntries.reduce((acc, curr) => acc + curr.hours, 0);
    const expected = await store.getExpectedHoursToDate(currentYear, currentMonth);
    const expectedFullMonth = await store.getExpectedHours(currentYear, currentMonth);
    
    setCurrentMonthHours(totalHours);
    setExpectedHours(expected);
    setPendingHours(expected - totalHours);

    // Chart Data (Last 6 months)
    const chartData = [];
    for(let i=5; i>=0; i--) {
        const d = new Date(currentYear, currentMonth - i, 1);
        const monthName = d.toLocaleDateString('pt-BR', { month: 'short' });
        const monthEntries = allEntries.filter(e => {
            const entD = new Date(e.date);
            return entD.getMonth() === d.getMonth() && entD.getFullYear() === d.getFullYear();
        });
        const mTotal = monthEntries.reduce((acc, curr) => acc + curr.hours, 0);
        const mExpected = await store.getExpectedHours(d.getFullYear(), d.getMonth());
        chartData.push({ name: monthName, hours: mTotal, expected: mExpected });
    }
    setMonthlyData(chartData);

    setLoading(false);
  };

  const handleDelete = async (id: string, entryDate: string) => {
    // Basic check: if current period is locked, block.
    // Ideally we should check the status of the specific month of the entry, but for now we warn the user.
    const entryD = new Date(entryDate);
    const today = new Date();
    
    // If deleting from current month and it is locked
    if (entryD.getMonth() === today.getMonth() && entryD.getFullYear() === today.getFullYear()) {
        if (isPeriodLocked) {
             alert("O período atual já foi enviado ou aprovado. Não é possível excluir.");
             return;
        }
    }
    
    if(window.confirm('Tem certeza que deseja excluir este lançamento?')) {
        await store.deleteEntry(id);
        loadData();
    }
  };

  const handleSubmitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Check Status Logic
    if (isPeriodLocked) {
        alert("O período atual já foi enviado ou aprovado. Não é possível adicionar lançamentos.");
        return;
    }

    setLoading(true);

    if (formMode === 'single') {
        await store.addEntry({
            userId: user.id,
            projectId: formData.projectId,
            date: formData.date,
            hours: Number(formData.hours),
            description: formData.description
        });
    } else {
        const start = new Date(formData.date);
        const end = new Date(formData.endDate);
        
        // Naive bulk implementation
        for(let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                const dateStr = d.toISOString().split('T')[0];
                await store.addEntry({
                    userId: user.id,
                    projectId: formData.projectId,
                    date: dateStr,
                    hours: Number(formData.hours),
                    description: formData.description
                });
            }
        }
    }
    
    setIsFormOpen(false);
    setFormData({ ...formData, description: '' });
    await loadData();
    setLoading(false);
  };

  const getProjectName = (id: string) => {
    const proj = allProjectsHistory.find(p => p.id === id);
    if (!proj) return 'Projeto ' + id.substring(0,4);
    return proj.active ? proj.name : `${proj.name} (Inativo)`;
  }

  // Helper to check if inputs should be disabled (Only affects CURRENT month input form)
  const isPeriodLocked = periodStatus?.status === 'SUBMITTED' || periodStatus?.status === 'APPROVED';

  // Filtered Entries Logic
  const displayEntries = entryFilterDate 
      ? entries.filter(e => e.date === entryFilterDate)
      : entries.slice(0, 10);

  if (loading && entries.length === 0) {
      return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-brand-600" size={48} /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Meu Dashboard</h1>
        <div className="flex gap-3">
             {periodStatus?.status === 'OPEN' || periodStatus?.status === 'REJECTED' ? (
                 <button 
                    onClick={() => setIsFormOpen(true)}
                    className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-lg shadow-brand-500/20">
                    <Plus size={20} />
                    Novo Lançamento
                </button>
             ) : (
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-slate-500 rounded-lg font-medium border border-gray-200">
                    <Lock size={18} />
                    {periodStatus?.status === 'SUBMITTED' ? 'Aguardando Aprovação' : 'Mês Fechado'}
                </div>
             )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-brand-100 text-brand-600 rounded-lg"><Clock size={24} /></div>
                <div>
                    <p className="text-sm text-slate-500 font-medium">Horas Realizadas (Mês)</p>
                    <p className="text-2xl font-bold text-slate-900">{currentMonthHours.toFixed(1)}h</p>
                </div>
            </div>
            <div className="mt-4 w-full bg-gray-100 rounded-full h-2">
                <div className="bg-brand-600 h-2 rounded-full" style={{ width: `${Math.min((currentMonthHours / (expectedHours || 1)) * 100, 100)}%` }}></div>
            </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg"><Calendar size={24} /></div>
                <div>
                    <p className="text-sm text-slate-500 font-medium">Horas Esperadas (Hoje)</p>
                    <p className="text-2xl font-bold text-slate-900">{expectedHours.toFixed(1)}h</p>
                </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">Baseado em 8.8h/dia útil</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg ${pendingHours > 0 ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                    {pendingHours > 0 ? <AlertTriangle size={24} /> : <CheckCircle size={24} />}
                </div>
                <div>
                    <p className="text-sm text-slate-500 font-medium">Pendência</p>
                    <p className={`text-2xl font-bold ${pendingHours > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {pendingHours > 0 ? `${pendingHours.toFixed(1)}h Faltantes` : 'Em dia'}
                    </p>
                </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">Divergência acumulada</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Chart & History */}
        <div className="lg:col-span-2 space-y-6">
            
            {/* Chart */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-80">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Histórico Semestral</h3>
                <ResponsiveContainer width="100%" height="90%">
                    <BarChart data={monthlyData}>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} />
                        <YAxis axisLine={false} tickLine={false} />
                        <Tooltip cursor={{fill: '#F0EFEA'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                        <Bar dataKey="expected" name="Esperado" fill="#D1D0CB" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="hours" name="Realizado" fill="#0033C6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Recent Entries & Filter */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <h3 className="text-lg font-semibold text-slate-800">
                        {entryFilterDate ? 'Registros do Dia' : 'Últimos Lançamentos'}
                    </h3>
                    
                    {/* Filter */}
                    <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-lg border border-gray-200">
                        <Filter size={16} className="text-slate-400 ml-2" />
                        <input 
                            type="date"
                            value={entryFilterDate}
                            onChange={(e) => setEntryFilterDate(e.target.value)}
                            className="bg-transparent border-none text-sm text-slate-600 focus:ring-0 outline-none"
                            placeholder="Filtrar por data"
                        />
                        {entryFilterDate && (
                            <button onClick={() => setEntryFilterDate('')} className="text-slate-400 hover:text-red-500 px-2">
                                <XCircle size={16} />
                            </button>
                        )}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-gray-50 text-xs uppercase font-semibold text-slate-500">
                            <tr>
                                <th className="px-6 py-3">Data</th>
                                <th className="px-6 py-3">Projeto</th>
                                <th className="px-6 py-3">Descrição</th>
                                <th className="px-6 py-3">Horas</th>
                                <th className="px-6 py-3">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {displayEntries.map(entry => (
                                <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-3 whitespace-nowrap">{new Date(entry.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                                    <td className="px-6 py-3 font-medium text-slate-800">{getProjectName(entry.projectId)}</td>
                                    <td className="px-6 py-3 truncate max-w-xs" title={entry.description}>{entry.description}</td>
                                    <td className="px-6 py-3 font-bold">{entry.hours}h</td>
                                    <td className="px-6 py-3">
                                        <button onClick={() => handleDelete(entry.id, entry.date)} className="text-red-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50">
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {displayEntries.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                                        {entryFilterDate ? 'Nenhum lançamento nesta data.' : 'Nenhum lançamento recente.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        {/* Right Col: Status and History Widget */}
        <div className="space-y-6">
            {user && <MyStatusWidget userId={user.id} onUpdate={loadData} />}
        </div>
      </div>

      {/* Modal Form */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-800">Novo Lançamento</h2>
                    <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>
                <form onSubmit={handleSubmitEntry} className="p-6 space-y-4">
                    
                    {/* Mode Switcher */}
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button 
                            type="button" 
                            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${formMode === 'single' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                            onClick={() => setFormMode('single')}
                        >
                            Diário
                        </button>
                        <button 
                            type="button" 
                            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${formMode === 'bulk' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                            onClick={() => setFormMode('bulk')}
                        >
                            Lote (Férias/Período)
                        </button>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Trabalho / Projeto</label>
                        <select 
                            required
                            value={formData.projectId} 
                            onChange={(e) => setFormData({...formData, projectId: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                        >
                            <option value="">Selecione...</option>
                            {selectableProjects.map(p => (
                                <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                            ))}
                        </select>
                        <p className="text-xs text-slate-400 mt-1">Exibindo projetos disponíveis para sua equipe.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Data {formMode === 'bulk' && 'Início'}</label>
                            <input 
                                type="date"
                                required 
                                value={formData.date}
                                onChange={(e) => setFormData({...formData, date: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                            />
                        </div>
                        {formMode === 'bulk' && (
                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Data Fim</label>
                                <input 
                                    type="date"
                                    required 
                                    min={formData.date}
                                    value={formData.endDate}
                                    onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                                />
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Horas/Dia</label>
                            <input 
                                type="number" 
                                step="0.1"
                                max="24"
                                required
                                value={formData.hours}
                                onChange={(e) => setFormData({...formData, hours: Number(e.target.value)})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
                        <textarea 
                            rows={3}
                            required
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                            placeholder="Descreva as atividades realizadas..."
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button 
                            type="button" 
                            onClick={() => setIsFormOpen(false)}
                            className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="px-4 py-2 bg-brand-600 text-white font-bold rounded-lg hover:bg-brand-700 transition-colors shadow-lg shadow-brand-500/20"
                        >
                            {loading ? 'Salvando...' : 'Salvar Lançamento'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};
