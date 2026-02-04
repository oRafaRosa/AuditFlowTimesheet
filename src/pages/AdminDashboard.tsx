
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { store, SUPABASE_SCHEMA_SQL } from '../services/store';
import { User, Project, TimesheetEntry, CalendarException, formatHours } from '../types';
import { Plus, Database, Edit, Search, Filter, Calendar, Trash2, Loader2 } from 'lucide-react';
import { MyStatusWidget } from '../components/MyStatusWidget';

const parseLocalDate = (dateStr: string) => new Date(`${dateStr}T00:00:00`);

export const AdminDashboard: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'users' | 'projects' | 'reports' | 'settings'>('users');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [exceptions, setExceptions] = useState<CalendarException[]>([]);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [loading, setLoading] = useState(false);

    // estado de usuários
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userData, setUserData] = useState({ name: '', email: '', role: 'USER' as any, managerId: '' });

    // estado de projetos
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectData, setProjectData] = useState({ name: '', code: '', classification: 'Audit' as any, budgetedHours: 0, active: true, allowedManagerIds: [] as string[] });

    // estado de exceções do calendário
  const [exceptionData, setExceptionData] = useState({ date: '', type: 'OFFDAY' as any, name: '' });

    // estado de relatório
  const [filterData, setFilterData] = useState({
      userId: '',
    managerId: '', // filtro por "time"
      projectId: '',
      startDate: '',
      endDate: ''
  });
  const [filteredEntries, setFilteredEntries] = useState<TimesheetEntry[]>([]);

  useEffect(() => {
    refreshData();
  }, []);

    // sincroniza aba com a url
  useEffect(() => {
    const path = location.pathname;
    if (path.includes('/projects')) {
        setActiveTab('projects');
    } else if (path.includes('/reports')) {
        setActiveTab('reports');
    } else if (path.includes('/settings')) {
        setActiveTab('settings');
    } else if (path.includes('/users')) {
        setActiveTab('users');
    } else {
        // rota padrão /admin cai em usuários
        setActiveTab('users');
    }
  }, [location]);

  const handleTabChange = (tab: 'users' | 'projects' | 'reports' | 'settings') => {
      setActiveTab(tab);
    // atualiza url pra bater com a aba
      if (tab === 'users') navigate('/admin/users');
      else navigate(`/admin/${tab}`);
  };

  const refreshData = async () => {
    setLoading(true);
    const user = store.getCurrentUser();
    setCurrentUser(user);

    const [u, p, e, ex] = await Promise.all([
        store.getUsers(),
        store.getProjects(),
        store.getEntries(),
        store.getExceptions()
    ]);
    setUsers(u);
    setProjects(p);
    setEntries(e);
    setExceptions(ex);
    setLoading(false);
  };

    // --- handlers de usuário ---
  const handleEditUserClick = (u: User) => {
      setEditingUser(u);
      setUserData({ name: u.name, email: u.email, role: u.role, managerId: u.managerId || '' });
  };

  const handleCancelEditUser = () => {
      setEditingUser(null);
      setUserData({ name: '', email: '', role: 'USER', managerId: '' });
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUser) {
        await store.updateUser(editingUser.id, userData);
        setEditingUser(null);
    } else {
        await store.addUser({ 
            ...userData, 
            avatarUrl: `https://ui-avatars.com/api/?name=${userData.name}` 
        });
    }
    setUserData({ name: '', email: '', role: 'USER', managerId: '' });
    refreshData();
  };

    // --- handlers de projeto ---
  const handleEditProjectClick = (p: Project) => {
      setEditingProject(p);
      setProjectData({ 
          name: p.name, 
          code: p.code, 
          classification: p.classification, 
          budgetedHours: p.budgetedHours,
          active: p.active,
          allowedManagerIds: p.allowedManagerIds || []
      });
  };

  const handleCancelEditProject = () => {
      setEditingProject(null);
      setProjectData({ name: '', code: '', classification: 'Audit', budgetedHours: 0, active: true, allowedManagerIds: [] });
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProject) {
        await store.updateProject(editingProject.id, projectData);
        setEditingProject(null);
    } else {
        await store.addProject(projectData);
    }
    setProjectData({ name: '', code: '', classification: 'Audit', budgetedHours: 0, active: true, allowedManagerIds: [] });
    refreshData();
  };

  const toggleProjectManager = (managerId: string) => {
      const current = projectData.allowedManagerIds;
      if (current.includes(managerId)) {
          setProjectData({ ...projectData, allowedManagerIds: current.filter(id => id !== managerId) });
      } else {
          setProjectData({ ...projectData, allowedManagerIds: [...current, managerId] });
      }
  };

    // --- handlers de calendário ---
  const handleAddException = async (e: React.FormEvent) => {
      e.preventDefault();
      await store.addException(exceptionData);
      setExceptionData({ date: '', type: 'OFFDAY', name: '' });
      refreshData();
  };

  const handleDeleteException = async (id: string) => {
      await store.deleteException(id);
      refreshData();
  };

    // --- filtros de relatório ---
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
      if (filterData.managerId) {
          // acha quem reporta pra esse gestor
          const teamUserIds = users.filter(u => u.managerId === filterData.managerId || u.id === filterData.managerId).map(u => u.id);
          result = result.filter(e => teamUserIds.includes(e.userId));
      }

      setFilteredEntries(result);
  };

  useEffect(() => {
    if(activeTab === 'reports') applyFilters();
  }, [filterData, activeTab, entries]);


    // helpers
  const managers = users.filter(u => u.role === 'MANAGER' || u.role === 'ADMIN');
  const getManagerName = (id?: string) => users.find(u => u.id === id)?.name || '-';
  const getUserName = (id: string) => users.find(u => u.id === id)?.name || 'Desconhecido';
  const getProjectName = (id: string) => projects.find(p => p.id === id)?.name || 'Desconhecido';

  if (loading && users.length === 0) return <div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin text-brand-600" /></div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-3 space-y-6">
        <h1 className="text-2xl font-bold text-slate-800">Administração do Sistema</h1>
        
        <div className="flex border-b border-gray-200 overflow-x-auto">
          <button 
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'users' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              onClick={() => handleTabChange('users')}
          >
              Usuários & Equipes
          </button>
          <button 
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'projects' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              onClick={() => handleTabChange('projects')}
          >
              Trabalhos & Permissões
          </button>
          <button 
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'reports' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              onClick={() => handleTabChange('reports')}
          >
              Relatórios e Filtros
          </button>
           <button 
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${activeTab === 'settings' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              onClick={() => handleTabChange('settings')}
          >
              Configurações
          </button>
        </div>

        {activeTab === 'users' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                      <h3 className="font-semibold text-slate-600">Base de Usuários</h3>
                      <span className="text-xs text-slate-400">{users.length} cadastrados</span>
                  </div>
                  <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                          <thead className="bg-gray-50 font-semibold text-slate-500 border-b border-gray-200">
                              <tr>
                                  <th className="px-6 py-3">Nome</th>
                                  <th className="px-6 py-3">Gestor (Equipe)</th>
                                  <th className="px-6 py-3">Função</th>
                                  <th className="px-6 py-3 text-right">Ação</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                              {users.map(u => (
                                  <tr key={u.id} className="hover:bg-slate-50">
                                      <td className="px-6 py-3 flex items-center gap-2">
                                          <img src={u.avatarUrl} className="w-6 h-6 rounded-full" />
                                          <div>
                                              <div className="font-medium">{u.name}</div>
                                              <div className="text-xs text-slate-400">{u.email}</div>
                                          </div>
                                      </td>
                                      <td className="px-6 py-3 text-slate-600">{getManagerName(u.managerId)}</td>
                                      <td className="px-6 py-3"><span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-600">{u.role}</span></td>
                                      <td className="px-6 py-3 text-right">
                                          <button onClick={() => handleEditUserClick(u)} className="text-brand-600 hover:text-brand-800 p-1 rounded hover:bg-brand-50">
                                              <Edit size={16} />
                                          </button>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-fit">
                  <h3 className="font-bold text-slate-800 mb-4">{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</h3>
                  <form onSubmit={handleSaveUser} className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Nome Completo</label>
                          <input className="w-full border border-gray-300 p-2 rounded-lg text-sm" placeholder="Ex: João da Silva" value={userData.name} onChange={e => setUserData({...userData, name: e.target.value})} required />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Email Corporativo</label>
                          <input className="w-full border border-gray-300 p-2 rounded-lg text-sm" placeholder="Ex: joao@grc.com" value={userData.email} onChange={e => setUserData({...userData, email: e.target.value})} required />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Nível de Acesso</label>
                          <select className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={userData.role} onChange={e => setUserData({...userData, role: e.target.value as any})}>
                              <option value="USER">Usuário (Lança Horas)</option>
                              <option value="MANAGER">Gestor (Vê Equipe)</option>
                              <option value="ADMIN">Administrador</option>
                          </select>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Gestor Responsável (Equipe)</label>
                          <select className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={userData.managerId} onChange={e => setUserData({...userData, managerId: e.target.value})}>
                              <option value="">-- Sem Gestor / Diretor --</option>
                              {managers.map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                          </select>
                      </div>
                      <div className="flex gap-2 pt-2">
                          {editingUser && (
                              <button type="button" onClick={handleCancelEditUser} className="flex-1 bg-gray-100 text-slate-600 p-2 rounded-lg font-bold hover:bg-gray-200">Cancelar</button>
                          )}
                          <button className="flex-1 bg-brand-600 text-white p-2 rounded-lg font-bold hover:bg-brand-700">{editingUser ? 'Salvar Alterações' : 'Cadastrar'}</button>
                      </div>
                  </form>
              </div>
          </div>
        )}

        {activeTab === 'projects' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                      <h3 className="font-semibold text-slate-600">Trabalhos Cadastrados</h3>
                  </div>
                  <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                          <thead className="bg-gray-50 font-semibold text-slate-500 border-b border-gray-200">
                              <tr>
                                  <th className="px-6 py-3">Projeto</th>
                                  <th className="px-6 py-3">Tipo</th>
                                  <th className="px-6 py-3">Orçamento</th>
                                  <th className="px-6 py-3">Permissões</th>
                                  <th className="px-6 py-3 text-right">Ação</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                              {projects.map(p => (
                                  <tr key={p.id} className={!p.active ? 'opacity-50 bg-gray-50' : ''}>
                                      <td className="px-6 py-3">
                                          <div className="font-mono text-xs text-slate-400">{p.code}</div>
                                          <div className="font-medium">{p.name}</div>
                                      </td>
                                      <td className="px-6 py-3">{p.classification}</td>
                                      <td className="px-6 py-3">{p.budgetedHours}h</td>
                                      <td className="px-6 py-3 text-xs text-slate-500 max-w-[150px] truncate">
                                          {!p.allowedManagerIds || p.allowedManagerIds.length === 0 
                                              ? <span className="text-green-600 font-semibold">Todos</span>
                                              : p.allowedManagerIds.length + ' Equipes'
                                          }
                                      </td>
                                      <td className="px-6 py-3 text-right">
                                          <button onClick={() => handleEditProjectClick(p)} className="text-brand-600 hover:text-brand-800 p-1 rounded hover:bg-brand-50">
                                              <Edit size={16} />
                                          </button>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-fit">
                  <h3 className="font-bold text-slate-800 mb-4">{editingProject ? 'Editar Trabalho' : 'Novo Trabalho'}</h3>
                  <form onSubmit={handleSaveProject} className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Código</label>
                          <input className="w-full border border-gray-300 p-2 rounded-lg text-sm" placeholder="ex: AUD-01" value={projectData.code} onChange={e => setProjectData({...projectData, code: e.target.value})} required />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Nome do Projeto</label>
                          <input className="w-full border border-gray-300 p-2 rounded-lg text-sm" placeholder="Nome do Projeto" value={projectData.name} onChange={e => setProjectData({...projectData, name: e.target.value})} required />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                          <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Classificação</label>
                              <select className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={projectData.classification} onChange={e => setProjectData({...projectData, classification: e.target.value as any})}>
                                  <option value="Audit">Auditoria</option>
                                  <option value="Controles">Controles Internos</option>
                                  <option value="Backoffice">Backoffice</option>
                                  <option value="Compliance">Compliance</option>
                                  <option value="Vacation">Férias/Ausência</option>
                              </select>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Orçamento (h)</label>
                              <input type="number" className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={projectData.budgetedHours} onChange={e => setProjectData({...projectData, budgetedHours: Number(e.target.value)})} />
                          </div>
                      </div>
                      
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Equipes Permitidas (Quem pode ver?)</label>
                          <div className="border border-gray-300 rounded-lg p-2 max-h-32 overflow-y-auto bg-gray-50">
                              <div className="space-y-1">
                                  {managers.map(m => (
                                      <label key={m.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-gray-100 p-1 rounded">
                                          <input 
                                              type="checkbox" 
                                              checked={projectData.allowedManagerIds.includes(m.id)}
                                              onChange={() => toggleProjectManager(m.id)}
                                              className="rounded text-brand-600 focus:ring-brand-500"
                                          />
                                          Equipe de {m.name}
                                      </label>
                                  ))}
                                  {managers.length === 0 && <p className="text-xs text-slate-400">Nenhum gestor cadastrado.</p>}
                              </div>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">Deixe vazio para permitir acesso a todos os usuários.</p>
                      </div>

                      <div>
                          <label className="flex items-center gap-2 cursor-pointer">
                              <input 
                                  type="checkbox" 
                                  checked={projectData.active} 
                                  onChange={e => setProjectData({...projectData, active: e.target.checked})}
                                  className="rounded text-brand-600"
                              />
                              <span className="text-sm font-medium text-slate-700">Projeto Ativo</span>
                          </label>
                      </div>

                      <div className="flex gap-2 pt-2">
                           {editingProject && (
                              <button type="button" onClick={handleCancelEditProject} className="flex-1 bg-gray-100 text-slate-600 p-2 rounded-lg font-bold hover:bg-gray-200">Cancelar</button>
                          )}
                          <button className="flex-1 bg-brand-600 text-white p-2 rounded-lg font-bold hover:bg-brand-700">{editingProject ? 'Salvar' : 'Criar'}</button>
                      </div>
                  </form>
              </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Data Início</label>
                          <input type="date" className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={filterData.startDate} onChange={e => setFilterData({...filterData, startDate: e.target.value})} />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Data Fim</label>
                          <input type="date" className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={filterData.endDate} onChange={e => setFilterData({...filterData, endDate: e.target.value})} />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Por Equipe (Gestor)</label>
                          <select className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={filterData.managerId} onChange={e => setFilterData({...filterData, managerId: e.target.value})}>
                              <option value="">Todas</option>
                              {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Por Usuário</label>
                          <select className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={filterData.userId} onChange={e => setFilterData({...filterData, userId: e.target.value})}>
                              <option value="">Todos</option>
                              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                          </select>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Por Projeto</label>
                          <select className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={filterData.projectId} onChange={e => setFilterData({...filterData, projectId: e.target.value})}>
                              <option value="">Todos</option>
                              {projects.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
                          </select>
                      </div>
                  </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                      <h3 className="font-semibold text-slate-700 flex items-center gap-2"><Filter size={18} /> Resultados Filtrados</h3>
                      <div className="text-sm font-bold text-brand-600 bg-brand-50 px-3 py-1 rounded-full">
                          Total: {formatHours(filteredEntries.reduce((acc, curr) => acc + curr.hours, 0))} Horas
                      </div>
                  </div>
                  <div className="max-h-[500px] overflow-y-auto">
                      <table className="w-full text-left text-sm">
                          <thead className="bg-white sticky top-0 z-10 font-semibold text-slate-500 border-b border-gray-200 shadow-sm">
                              <tr>
                                  <th className="px-6 py-3">Data</th>
                                  <th className="px-6 py-3">Usuário</th>
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
                                      <td className="px-6 py-3 text-right font-medium">{e.hours}</td>
                                  </tr>
                              ))}
                              {filteredEntries.length === 0 && (
                                  <tr><td colSpan={5} className="p-8 text-center text-slate-400">Nenhum registro encontrado para os filtros selecionados.</td></tr>
                              )}
                          </tbody>
                      </table>
                  </div>
              </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-6">
                  
                  {/* lista de exceções do calendário */}
                  <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                      <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                          <h3 className="font-semibold text-slate-600 flex items-center gap-2">
                               <Calendar size={18} />
                               Exceções de Calendário (Feriados/Pontes)
                          </h3>
                      </div>
                      <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                              <thead className="bg-gray-50 font-semibold text-slate-500 border-b border-gray-200">
                                  <tr>
                                      <th className="px-6 py-3">Data</th>
                                      <th className="px-6 py-3">Tipo</th>
                                      <th className="px-6 py-3">Descrição</th>
                                      <th className="px-6 py-3 text-right">Ação</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                  {exceptions.map(ex => (
                                      <tr key={ex.id} className="hover:bg-slate-50">
                                          <td className="px-6 py-3 whitespace-nowrap font-medium text-slate-700">
                                              {new Date(ex.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                                          </td>
                                          <td className="px-6 py-3">
                                              {ex.type === 'OFFDAY' 
                                                  ? <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">Folga / Feriado</span>
                                                  : <span className="bg-brand-100 text-brand-700 px-2 py-1 rounded text-xs font-bold">Dia Útil Extra</span>
                                              }
                                          </td>
                                          <td className="px-6 py-3 text-slate-500">{ex.name}</td>
                                          <td className="px-6 py-3 text-right">
                                              <button onClick={() => handleDeleteException(ex.id)} className="text-red-400 hover:text-red-600 p-1">
                                                  <Trash2 size={16} />
                                              </button>
                                          </td>
                                      </tr>
                                  ))}
                                  {exceptions.length === 0 && (
                                      <tr><td colSpan={4} className="p-6 text-center text-slate-400 text-xs">Nenhuma exceção cadastrada. O sistema usa apenas fins de semana e feriados nacionais padrão.</td></tr>
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>

                  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                       <div className="flex items-center gap-4 mb-4">
                          <div className="p-3 bg-slate-100 text-slate-600 rounded-lg"><Database size={24}/></div>
                          <div>
                              <h2 className="text-lg font-bold">Dados Técnicos</h2>
                              <p className="text-sm text-slate-500">Configuração de Banco de Dados</p>
                          </div>
                       </div>
                       <p className="text-xs text-slate-600 mb-4">
                          Acesse a configuração no arquivo <code>services/store.ts</code> e insira as credenciais do Supabase.
                       </p>
                       <button 
                          onClick={() => setShowSqlModal(true)}
                          className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                       >
                          Ver Schema SQL
                       </button>
                  </div>
              </div>

              {/* form de adicionar calendário */}
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-fit">
                  <h3 className="font-bold text-slate-800 mb-4">Gerenciar Calendário</h3>
                  <p className="text-xs text-slate-500 mb-4">Adicione feriados, emendas (pontes) ou dias úteis extras (sábados trabalhados) para ajustar o cálculo automático de horas esperadas.</p>
                  <form onSubmit={handleAddException} className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Data</label>
                          <input type="date" className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={exceptionData.date} onChange={e => setExceptionData({...exceptionData, date: e.target.value})} required />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Tipo de Exceção</label>
                          <select className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={exceptionData.type} onChange={e => setExceptionData({...exceptionData, type: e.target.value as any})}>
                              <option value="OFFDAY">Folga / Ponte (Não conta horas)</option>
                              <option value="WORKDAY">Dia Útil Extra (Conta horas)</option>
                          </select>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Descrição</label>
                          <input className="w-full border border-gray-300 p-2 rounded-lg text-sm" placeholder="Ex: Emenda de Feriado" value={exceptionData.name} onChange={e => setExceptionData({...exceptionData, name: e.target.value})} required />
                      </div>
                      
                      <button className="w-full bg-brand-600 text-white p-2 rounded-lg font-bold hover:bg-brand-700 mt-2">
                          Adicionar ao Calendário
                      </button>
                  </form>
              </div>
          </div>
        )}

        {showSqlModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="p-4 border-b flex justify-between items-center">
                      <h3 className="font-bold text-lg">Supabase Setup SQL</h3>
                      <button onClick={() => setShowSqlModal(false)}>✕</button>
                  </div>
                  <div className="p-4 overflow-auto bg-slate-50">
                      <pre className="text-xs text-slate-700 font-mono whitespace-pre-wrap">{SUPABASE_SCHEMA_SQL}</pre>
                  </div>
                  <div className="p-4 border-t text-right">
                      <button onClick={() => {navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL); alert('Copiado!')}} className="text-brand-600 font-bold text-sm">Copiar para Área de Transferência</button>
                  </div>
              </div>
          </div>
        )}
      </div>

    {/* coluna direita: status pessoal do admin */}
      <div className="lg:col-span-1 space-y-6">
           <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Meu Controle</h3>
           {currentUser && <MyStatusWidget userId={currentUser.id} />}
      </div>
    </div>
  );
};
