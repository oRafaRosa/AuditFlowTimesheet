import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { store } from '../services/store';
import { Project, TimesheetEntry, HOURS_PER_DAY, formatHours } from '../types';
import { Filter, Loader2, Download, Edit, Trash2 } from 'lucide-react';

// helper pra arrumar o rolê do fuso (utc vs local)
const getLocalDateString = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000;
  const localTime = new Date(date.getTime() - offset);
  return localTime.toISOString().split('T')[0];
};

const parseLocalDate = (dateStr: string) => new Date(`${dateStr}T00:00:00`);

export const UserReports: React.FC = () => {
  const location = useLocation();
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectableProjects, setSelectableProjects] = useState<Project[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodStatuses, setPeriodStatuses] = useState<Record<string, string>>({});

    // filtros
  const [filterData, setFilterData] = useState({
      projectId: '',
      startDate: '',
      endDate: ''
  });

    // estado do modal de edição
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
      projectId: '',
      date: getLocalDateString(),
      hours: HOURS_PER_DAY,
      description: ''
  });
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    // parse dos params da url pra deep link (do gráfico do dashboard)
    const params = new URLSearchParams(location.search);
    setFilterData(prev => ({
        ...prev,
        projectId: params.get('projectId') || '',
        startDate: params.get('startDate') || '',
        endDate: params.get('endDate') || '',
    }));

    loadData();
  }, [location.search]);

  const loadData = async () => {
    setLoading(true);
    const currentUser = store.getCurrentUser();
    if (!currentUser) return;

    const [allEntries, allProjects, periods] = await Promise.all([
        store.getEntries(currentUser.id),
        store.getProjects(),
        store.getLastPeriods(currentUser.id)
    ]);
    
    // cria map de "yyyy-mm" -> status pra achar rápido
    const statusMap: Record<string, string> = {};
    periods.forEach(p => {
        statusMap[`${p.year}-${p.month}`] = p.status;
    });
    setPeriodStatuses(statusMap);

    // ordena por data desc
    allEntries.sort((a,b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
    setEntries(allEntries);
    
    setProjects(allProjects);

    // projetos disponíveis pro dropdown (ativo + permissão)
    const available = allProjects.filter(p => {
        if (!p.active) return false;
        if (!p.allowedManagerIds || p.allowedManagerIds.length === 0) return true;
        if (p.allowedManagerIds.includes(currentUser.id)) return true;
        if (currentUser.managerId && p.allowedManagerIds.includes(currentUser.managerId)) return true;
        return false;
    });
    setSelectableProjects(available);

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

      setFilteredEntries(result);
  };

  const isEntryLocked = (entry: TimesheetEntry) => {
    const d = parseLocalDate(entry.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const status = periodStatuses[key];
    // se tem status e é submitted/approved, tá travado
    // se não existe (undefined), é open (ainda não gerou)
      return status === 'SUBMITTED' || status === 'APPROVED';
  };

  const handleEditClick = (entry: TimesheetEntry) => {
      if (isEntryLocked(entry)) return;
      
      setEditingId(entry.id);
      setFormData({
          projectId: entry.projectId,
          date: entry.date,
          hours: entry.hours,
          description: entry.description
      });
      setIsFormOpen(true);
  };

  const handleDeleteClick = async (id: string, entry: TimesheetEntry) => {
      if (isEntryLocked(entry)) return;

      if(window.confirm('Tem certeza que deseja excluir este lançamento?')) {
          await store.deleteEntry(id);
          loadData();
      }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingId) return;
      setFormLoading(true);

      await store.updateEntry(editingId, {
          projectId: formData.projectId,
          date: formData.date,
          hours: Number(formData.hours),
          description: formData.description
      });

      setFormLoading(false);
      setIsFormOpen(false);
      setEditingId(null);
      loadData();
  };

  const handleExport = () => {
    const header = ['Data', 'Projeto', 'Horas', 'Descrição'];
    const rows = filteredEntries.map(e => {
        const proj = projects.find(p => p.id === e.projectId)?.name || 'N/A';
        return [e.date, proj, e.hours, `"${e.description}"`];
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `meu_relatorio_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getProjectName = (id: string) => projects.find(p => p.id === id)?.name || id;

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-brand-600" size={48} /></div>;

  return (
    <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-800">Meus Relatórios Detalhados</h1>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Data Início</label>
                    <input type="date" className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={filterData.startDate} onChange={e => setFilterData({...filterData, startDate: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Data Fim</label>
                    <input type="date" className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={filterData.endDate} onChange={e => setFilterData({...filterData, endDate: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Projeto</label>
                    <select className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={filterData.projectId} onChange={e => setFilterData({...filterData, projectId: e.target.value})}>
                        <option value="">Todos</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                    </select>
                </div>
            </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                <h3 className="font-semibold text-slate-700 flex items-center gap-2"><Filter size={18} /> Histórico de Lançamentos</h3>
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
                            <th className="px-6 py-3">Projeto</th>
                            <th className="px-6 py-3">Descrição</th>
                            <th className="px-6 py-3 text-right">Horas</th>
                            <th className="px-6 py-3 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredEntries.map(e => {
                            const locked = isEntryLocked(e);
                            return (
                                <tr key={e.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-3 whitespace-nowrap">{parseLocalDate(e.date).toLocaleDateString('pt-BR')}</td>
                                    <td className="px-6 py-3 font-medium text-slate-700">{getProjectName(e.projectId)}</td>
                                    <td className="px-6 py-3 text-slate-500 truncate max-w-lg" title={e.description}>{e.description}</td>
                                    <td className="px-6 py-3 text-right font-bold text-slate-600">{formatHours(e.hours)}</td>
                                    <td className="px-6 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button 
                                                onClick={() => handleEditClick(e)} 
                                                disabled={locked}
                                                className={`transition-colors p-1 rounded ${locked ? 'text-gray-300 cursor-not-allowed' : 'text-brand-600 hover:text-brand-800 hover:bg-brand-50'}`} 
                                                title={locked ? "Mês fechado" : "Editar"}
                                            >
                                                <Edit size={16} />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteClick(e.id, e)} 
                                                disabled={locked}
                                                className={`transition-colors p-1 rounded ${locked ? 'text-gray-300 cursor-not-allowed' : 'text-red-400 hover:text-red-600 hover:bg-red-50'}`}
                                                title={locked ? "Mês fechado" : "Excluir"}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredEntries.length === 0 && (
                            <tr><td colSpan={5} className="p-8 text-center text-slate-400">Nenhum registro encontrado.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* modal de edição (copiado/adaptado do dashboard) */}
        {isFormOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                        <h2 className="text-xl font-bold text-slate-800">Editar Lançamento</h2>
                        <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                    </div>
                    <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
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
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Data</label>
                                <input 
                                    type="date"
                                    required 
                                    value={formData.date}
                                    onChange={(e) => setFormData({...formData, date: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Horas</label>
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
                                disabled={formLoading}
                                className="px-4 py-2 bg-brand-600 text-white font-bold rounded-lg hover:bg-brand-700 transition-colors shadow-lg shadow-brand-500/20"
                            >
                                {formLoading ? 'Atualizando...' : 'Atualizar'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}
    </div>
  );
};