import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { Project, TimesheetEntry, User, formatHours, formatPercentage } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend, PieChart, Pie } from 'recharts';
import { Search, TrendingUp, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';

interface ProjectBudgetData {
  id: string;
  name: string;
  code: string;
  budgeted: number;
  consumed: number;
  percentage: number;
  status: 'safe' | 'warning' | 'danger';
}

export const ManagerProjectBudget: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [projectData, setProjectData] = useState<ProjectBudgetData[]>([]);
  const [filteredData, setFilteredData] = useState<ProjectBudgetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'safe' | 'warning' | 'danger'>('all');
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [teamFilter, setTeamFilter] = useState('');
  const [codePrefixFilter, setCodePrefixFilter] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const buildProjectData = (projectsList: Project[], entriesList: TimesheetEntry[]) => {
    return projectsList.map(p => {
      const consumed = entriesList
        .filter(e => e.projectId === p.id)
        .reduce((acc, curr) => acc + curr.hours, 0);

      const percentage = p.budgetedHours > 0 ? (consumed / p.budgetedHours) * 100 : 0;

      let status: 'safe' | 'warning' | 'danger' = 'safe';
      if (percentage > 100) status = 'danger';
      else if (percentage >= 85) status = 'warning';

      return {
        id: p.id,
        name: p.name,
        code: p.code,
        budgeted: p.budgetedHours,
        consumed: consumed,
        percentage: percentage,
        status: status
      };
    }).filter(p => p.budgeted > 0);
  };

  const loadData = async () => {
    setLoading(true);
    const [allProjects, allEntries, allUsers] = await Promise.all([
      store.getProjects(),
      store.getEntries(),
      store.getUsers()
    ]);

    setProjects(allProjects);
    setEntries(allEntries);
    setUsers(allUsers);

    // Calculate budget data for ALL projects
    const budgetData = buildProjectData(allProjects, allEntries);

    setProjectData(budgetData);
    setFilteredData(budgetData);
    setLoading(false);
  };

  useEffect(() => {
    let result = projectData;

    // Search filter
    if (searchTerm.trim()) {
      result = result.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Project checkbox filter
    if (selectedProjectIds.size > 0) {
      result = result.filter(p => selectedProjectIds.has(p.id));
    }

    // Code prefix filter (HT, BO, AD)
    if (codePrefixFilter) {
      result = result.filter(p => p.code.startsWith(codePrefixFilter));
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(p => p.status === statusFilter);
    }

    // Sort by consumption (desc)
    result = [...result].sort((a, b) => b.consumed - a.consumed);

    setFilteredData(result);
  }, [searchTerm, statusFilter, projectData, selectedProjectIds, codePrefixFilter]);

  useEffect(() => {
    if (!projects.length) return;

    let scopedEntries = entries;

    if (teamFilter) {
      const teamUserIds = users
        .filter(u => u.managerId === teamFilter || u.id === teamFilter)
        .map(u => u.id);
      scopedEntries = entries.filter(e => teamUserIds.includes(e.userId));
    }

    const updatedData = buildProjectData(projects, scopedEntries);
    setProjectData(updatedData);
  }, [teamFilter, projects, entries, users]);

  const handleProjectClick = (projectId: string) => {
    navigate(`/manager/reports?projectId=${projectId}`);
  };

  // Calculate KPIs
  const totalBudgeted = projectData.reduce((acc, p) => acc + p.budgeted, 0);
  const totalConsumed = projectData.reduce((acc, p) => acc + p.consumed, 0);
  const overBudget = projectData.filter(p => p.status === 'danger').length;
  const atRisk = projectData.filter(p => p.status === 'warning').length;

  // Data for pie chart (status distribution)
  const statusDistribution = [
    { name: 'Dentro do Orçado', value: projectData.filter(p => p.status === 'safe').length, fill: '#10b981' },
    { name: 'Próximo do Limite', value: projectData.filter(p => p.status === 'warning').length, fill: '#f59e0b' },
    { name: 'Acima do Orçado', value: projectData.filter(p => p.status === 'danger').length, fill: '#ef4444' }
  ].filter(item => item.value > 0);

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-brand-600" size={48} /></div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Orçado vs Realizado - Todos os Projetos</h1>
        <p className="text-slate-500">Visão consolidada de horas por projeto em toda a diretoria</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-500 uppercase mb-2">Total Orçado</p>
          <div className="text-3xl font-bold text-slate-800">{formatHours(totalBudgeted)}h</div>
          <p className="text-xs text-slate-400 mt-2">{projectData.length} projetos</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-500 uppercase mb-2">Total Realizado</p>
          <div className="text-3xl font-bold text-slate-800">{formatHours(totalConsumed)}h</div>
          <p className="text-xs text-slate-400 mt-2">{formatPercentage((totalConsumed / totalBudgeted) * 100)}% consumido</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-500 uppercase mb-2">Próximos ao Limite</p>
          <div className="text-3xl font-bold text-amber-600">{atRisk}</div>
          <p className="text-xs text-slate-400 mt-2">85-100% do orçado</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <p className="text-xs font-bold text-slate-500 uppercase mb-2">Acima do Orçado</p>
          <div className="text-3xl font-bold text-red-600">{overBudget}</div>
          <p className="text-xs text-slate-400 mt-2">{formatHours(projectData.filter(p => p.status === 'danger').reduce((acc, p) => acc + (p.consumed - p.budgeted), 0))}h de excesso</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Gráfico de Barras - Orçado vs Realizado */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-6">Orçamento vs Realizado por Projeto</h2>
          <div className="overflow-y-auto" style={{ maxHeight: '500px' }}>
            <ResponsiveContainer width="100%" height={Math.max(400, filteredData.length * 45)}>
              <BarChart
                data={filteredData}
                layout="vertical"
                margin={{ left: 120, right: 20, top: 10, bottom: 10 }}
              >
                <XAxis type="number" />
                <YAxis
                  dataKey="code"
                  type="category"
                  width={110}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as ProjectBudgetData;
                      const label = payload[0].name;
                      const value = payload[0].value;
                      return (
                        <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg text-xs">
                          <p className="font-bold text-slate-800">{data.name}</p>
                          <p className="text-slate-600">
                            {label}: {formatHours(value as number)}h
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Bar dataKey="budgeted" name="Orçado" fill="#D1D0CB" onClick={(data) => handleProjectClick(data.id)} cursor="pointer" />
                <Bar dataKey="consumed" name="Realizado" fill="#0033C6" onClick={(data) => handleProjectClick(data.id)} cursor="pointer">
                  {filteredData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.status === 'danger' ? '#ef4444' : entry.status === 'warning' ? '#f59e0b' : '#0033C6'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Distribution Pie Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-6">Status dos Projetos</h2>
          {statusDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={false}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${value} projetos`} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-slate-400">Sem dados</div>
          )}
          {statusDistribution.length > 0 && (
            <div className="mt-4 space-y-2 text-sm">
              {statusDistribution.map(item => (
                <div key={item.name} className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }}></span>
                  <span className="text-slate-700">{item.name}</span>
                  <span className="text-slate-400">({item.value})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters and Table */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">Buscar Projeto</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Nome ou código..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>
            </div>

            {/* Team Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">Equipe</label>
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">Todas as Equipes</option>
                {users
                  .filter(u => u.role === 'MANAGER' || u.role === 'ADMIN')
                  .map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="all">Todos</option>
                <option value="safe">Dentro do Orçado</option>
                <option value="warning">Próximo do Limite</option>
                <option value="danger">Acima do Orçado</option>
              </select>
            </div>

            {/* Code Prefix Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">Tipo (Código)</label>
              <select
                value={codePrefixFilter}
                onChange={(e) => setCodePrefixFilter(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">Todos</option>
                <option value="HT">HT - Horas Técnicas</option>
                <option value="BO">BO - Backoffice</option>
                <option value="AD">AD - Administrativas</option>
              </select>
            </div>
          </div>

          {/* Project Checkbox Filter */}
          <div className="mt-4">
            <label className="block text-xs font-bold text-slate-500 mb-2">Selecionar Projetos</label>
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-3 bg-slate-50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {projects.map(p => (
                  <label key={p.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedProjectIds.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(selectedProjectIds);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        setSelectedProjectIds(next);
                      }}
                    />
                    <span className="text-slate-700">
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-xs text-slate-500"> ({p.code})</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {selectedProjectIds.size === 0 ? 'Nenhum selecionado (mostrando todos)' : `${selectedProjectIds.size} selecionados`}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 font-semibold text-slate-600">Projeto</th>
                  <th className="px-6 py-3 font-semibold text-slate-600">Orçado</th>
                  <th className="px-6 py-3 font-semibold text-slate-600">Realizado</th>
                  <th className="px-6 py-3 font-semibold text-slate-600">Consumo</th>
                  <th className="px-6 py-3 font-semibold text-slate-600">Progresso</th>
                  <th className="px-6 py-3 font-semibold text-slate-600 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                      Nenhum projeto encontrado com os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((project) => (
                    <tr
                      key={project.id}
                      onClick={() => handleProjectClick(project.id)}
                      className="hover:bg-blue-50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-800">{project.name}</div>
                        <div className="text-xs text-slate-500">{project.code}</div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-700">{formatHours(project.budgeted)}h</td>
                      <td className="px-6 py-4 font-medium text-slate-700">{formatHours(project.consumed)}h</td>
                      <td className="px-6 py-4">
                        <span className={`font-bold ${
                          project.status === 'danger' ? 'text-red-600' :
                          project.status === 'warning' ? 'text-amber-600' :
                          'text-green-600'
                        }`}>
                          {formatPercentage(project.percentage)}%
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              project.status === 'danger' ? 'bg-red-500' :
                              project.status === 'warning' ? 'bg-amber-500' :
                              'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(project.percentage, 100)}%` }}
                          />
                        </div>
                        {project.status === 'danger' && (
                          <p className="text-[10px] text-red-600 mt-1 font-bold">
                            +{formatHours(project.consumed - project.budgeted)}h acima
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {project.status === 'safe' && (
                          <div className="flex items-center justify-center gap-2 text-green-600">
                            <CheckCircle size={16} />
                            <span className="text-xs font-bold">OK</span>
                          </div>
                        )}
                        {project.status === 'warning' && (
                          <div className="flex items-center justify-center gap-2 text-amber-600">
                            <AlertTriangle size={16} />
                            <span className="text-xs font-bold">RISCO</span>
                          </div>
                        )}
                        {project.status === 'danger' && (
                          <div className="flex items-center justify-center gap-2 text-red-600">
                            <TrendingUp size={16} />
                            <span className="text-xs font-bold">EXCESSO</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legenda */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-xs font-bold text-blue-900 mb-3">Legenda de Status:</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-blue-800">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span><strong>OK:</strong> 0-85% do orçado</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500"></div>
              <span><strong>RISCO:</strong> 85-100% do orçado</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span><strong>EXCESSO:</strong> Acima de 100%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
