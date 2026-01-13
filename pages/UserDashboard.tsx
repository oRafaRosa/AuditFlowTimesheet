import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { TimesheetEntry, Project, HOURS_PER_DAY, TimesheetPeriod } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Clock, Calendar, CheckCircle, AlertTriangle, Plus, Trash2, Loader2, Lock, XCircle, Search, Filter, AlertOctagon, Copy, Edit } from 'lucide-react';
import { MyStatusWidget } from '../components/MyStatusWidget';

// Helper to fix timezone issue (UTC vs Local)
// Returns YYYY-MM-DD based on Browser's local time, not UTC.
const getLocalDateString = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000;
  const localTime = new Date(date.getTime() - offset);
  return localTime.toISOString().split('T')[0];
};

export const UserDashboard: React.FC = () => {
  const user = store.getCurrentUser();
  const navigate = useNavigate();
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
  
  // Alerts Data (Calculated locally)
  const [dailyTotals, setDailyTotals] = useState<Record<string, number>>({});

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'single' | 'bulk'>('single');
  const [editingId, setEditingId] = useState<string | null>(null); // To track which entry is being edited
  const [formData, setFormData] = useState({
    projectId: '',
    date: getLocalDateString(), // Initialized with correct Local Date
    endDate: getLocalDateString(), 
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
    
    // Calculate Daily Totals for Alert Logic
    const totals: Record<string, number> = {};
    allEntries.forEach(e => {
        totals[e.date] = (totals[e.date] || 0) + e.hours;
    });
    setDailyTotals(totals);

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
        
        // IMPORTANT: Add year/month to data so we can navigate on click
        chartData.push({ 
            name: monthName, 
            hours: mTotal, 
            expected: mExpected,
            year: d.getFullYear(),
            month: d.getMonth()
        });
    }
    setMonthlyData(chartData);

    setLoading(false);
  };

  const checkPeriodLocked = async (dateStr: string) => {
    if (!user) return true;
    const date = new Date(dateStr);
    const status = await store.getPeriodStatus(user.id, date.getFullYear(), date.getMonth());
    return status.status === 'SUBMITTED' || status.status === 'APPROVED';
  };

  const handleEditClick = async (entry: TimesheetEntry) => {
      const isLocked = await checkPeriodLocked(entry.date);
      if (isLocked) {
          alert("Este lançamento pertence a um mês já enviado para aprovação ou aprovado. Não é possível editar.");
          return;
      }

      setEditingId(entry.id);
      setFormData({
          projectId: entry.projectId,
          date: entry.date,
          endDate: entry.date,
          hours: entry.hours,
          description: entry.description
      });
      setFormMode('single'); // Edits are always single
      setIsFormOpen(true);
  };

  const handleDelete = async (id: string, entryDate: string) => {
    const isLocked = await checkPeriodLocked(entryDate);
    if (isLocked) {
        alert("Este lançamento pertence a um mês já enviado para aprovação ou aprovado. Não é possível excluir.");
        return;
    }
    
    if(window.confirm('Tem certeza que deseja excluir este lançamento?')) {
        await store.deleteEntry(id);
        loadData();
    }
  };

  const handleSubmitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setLoading(true);

    if (editingId) {
        // UPDATE MODE
        await store.updateEntry(editingId, {
            projectId: formData.projectId,
            date: formData.date,
            hours: Number(formData.hours),
            description: formData.description
        });
    } else {
        // CREATE MODE
        // Check current month status (approx, naive check for "Create")
        // Ideally we should check status for formData.date, but for now we rely on UI blocking
        const d = new Date(formData.date);
        const status = await store.getPeriodStatus(user.id, d.getFullYear(), d.getMonth());
        if (status.status === 'SUBMITTED' || status.status === 'APPROVED') {
             alert(`O mês de ${d.getMonth()+1}/${d.getFullYear()} já foi fechado. Não é possível adicionar lançamentos.`);
             setLoading(false);
             return;
        }

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
            
            for(let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const dayOfWeek = d.getUTCDay();
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
    }
    
    setIsFormOpen(false);
    setEditingId(null);
    setFormData({ ...formData, description: '' });
    await loadData();
    setLoading(false);
  };

  const handleCloseForm = () => {
      setIsFormOpen(false);
      setEditingId(null);
      setFormData({ ...formData, description: '' });
  };

  const getProjectName = (id: string) => {
    const proj = allProjectsHistory.find(p => p.id === id);
    if (!proj) return 'Projeto ' + id.substring(0,4);
    return proj.active ? proj.name : `${proj.name} (Inativo)`;
  }

  // Handle Chart Click
  const handleChartClick = (data: any) => {
      if (data && data.activePayload && data.activePayload.length > 0) {
          const payload = data.activePayload[0].payload;
          const { year, month } = payload;
          const startDate = new Date(year, month, 1);
          const endDate = new Date(year, month + 1, 0);
          
          const sStr = getLocalDateString(startDate);
          const eStr = getLocalDateString(endDate);

          navigate(`/reports?startDate=${sStr}&endDate=${eStr}`);
      }
  };

  const isDuplicate = (entry: TimesheetEntry) => {
      return entries.filter(e => 
          e.id !== entry.id && 
          e.date === entry.date && 
          e.projectId === entry.projectId && 
          e.hours === entry.hours &&
          e.description === entry.description
      ).length > 0;
  };

  // Status visual check for "New Entry" button (Current Month)
  const isCurrentPeriodLocked = periodStatus?.status === 'SUBMITTED' || periodStatus?.status === 'APPROVED';

  // Filtered Entries Logic
  const displayEntries = entryFilterDate 
      ? entries.filter(e => e.date === entryFilterDate)
      : entries.slice(0, 20); // Show more recent entries

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
                    onClick={() => {
                        setEditingId(null);
                        setFormMode('single');
                        setFormData({
                            projectId: '',
                            date: getLocalDateString(),
                            endDate: getLocalDateString(),
                            hours: HOURS_PER_DAY,
                            description: ''
                        });
                        setIsFormOpen(true);
                    }}
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
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-80 relative">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Histórico Semestral</h3>
                <ResponsiveContainer width="100%" height="90%">
                    <BarChart data={monthlyData} onClick={handleChartClick} style={{cursor: 'pointer'}}>
                        <XAxis dataKey="name" axisLine={false} tickLine={false} />
                        <YAxis axisLine={false} tickLine={false} />
                        <Tooltip cursor={{fill: '#F0EFEA'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                        <Bar dataKey="expected" name="Esperado" fill="#D1D0CB" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="hours" name="Realizado" fill="#0033C6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
                <div className="absolute top-6 right-6 text-xs text-slate-400">
                    Clique nas barras para ver detalhes
                </div>
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
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {displayEntries.map(entry => {
                                const dailyTotal = dailyTotals[entry.date] || 0;
                                const isOverLimit = dailyTotal > 8.8;
                                const isDup = isDuplicate(entry);
                                const hasAlert = isOverLimit || isDup;

                                return (
                                    <tr key={entry.id} className={`transition-colors ${hasAlert ? 'bg-yellow-50 hover:bg-yellow-100' : 'hover:bg-gray-50'}`}>
                                        <td className="px-6 py-3 whitespace-nowrap flex items-center gap-2">
                                            {new Date(entry.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                                            {isOverLimit && (
                                                <div className="group relative">
                                                    <AlertOctagon size={16} className="text-amber-500 cursor-help" />
                                                    <span className="hidden group-hover:block absolute left-6 top-0 bg-slate-800 text-white text-xs p-1 rounded z-50 w-32">
                                                        Total do dia: {dailyTotal.toFixed(1)}h (>8.8)
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-3 font-medium text-slate-800">
                                            <div className="flex items-center gap-2">
                                                {getProjectName(entry.projectId)}
                                                {isDup && (
                                                    <div className="group relative">
                                                        <Copy size={14} className="text-red-400 cursor-help" />
                                                        <span className="hidden group-hover:block absolute left-4 top-0 bg-slate-800 text-white text-xs p-1 rounded z-50 w-32">
                                                            Possível duplicidade detectada
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 truncate max-w-xs" title={entry.description}>{entry.description}</td>
                                        <td className={`px-6 py-3 font-bold ${isOverLimit ? 'text-amber-600' : ''}`}>{entry.hours}h</td>
                                        <td className="px-6 py-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button onClick={() => handleEditClick(entry)} className="text-brand-600 hover:text-brand-800 transition-colors p-1 rounded hover:bg-brand-50" title="Editar">
                                                    <Edit size={16} />
                                                </button>
                                                <button onClick={() => handleDelete(entry.id, entry.date)} className="text-red-400 hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50" title="Excluir">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
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

      {/* Modal Form (Create / Edit) */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-800">{editingId ? 'Editar Lançamento' : 'Novo Lançamento'}</h2>
                    <button onClick={handleCloseForm} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>
                <form onSubmit={handleSubmitEntry} className="p-6 space-y-4">
                    
                    {/* Mode Switcher (Only for Create) */}
                    {!editingId && (
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
                    )}

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
                            onClick={handleCloseForm}
                            className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="px-4 py-2 bg-brand-600 text-white font-bold rounded-lg hover:bg-brand-700 transition-colors shadow-lg shadow-brand-500/20"
                        >
                            {loading ? 'Salvando...' : (editingId ? 'Atualizar' : 'Salvar Lançamento')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};