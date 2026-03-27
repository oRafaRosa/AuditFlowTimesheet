import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { store } from '../services/store';
import { Project, TimesheetEntry, User, UserArea, formatHours, formatPercentage } from '../types';
import { Search, TrendingUp, AlertTriangle, CheckCircle, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface ProjectBudgetData {
  id: string;
  name: string;
  code: string;
  classification: Project['classification'];
  area: UserArea;
  areaLabel: string;
  budgeted: number;
  consumed: number;
  teamConsumed: number;
  available: number;
  percentage: number;
  status: 'safe' | 'warning' | 'danger';
}

type ProjectCodeFilter = '' | 'HT' | 'BO' | 'AD';

const matchesProjectType = (projectCode: string, typeFilter: ProjectCodeFilter) => !typeFilter || projectCode.toUpperCase().startsWith(typeFilter);

const isTechnicalProject = (projectCode: string, classification: Project['classification']) => {
  const normalizedCode = projectCode.toUpperCase();
  if (normalizedCode.startsWith('HT')) return true;
  if (normalizedCode.startsWith('BO') || normalizedCode.startsWith('AD')) return false;
  return classification !== 'Backoffice';
};

const AREA_LABEL: Record<UserArea, string> = {
  AUDITORIA_INTERNA: 'Auditoria Interna',
  CONTROLES_INTERNOS: 'Controles Internos',
  COMPLIANCE: 'Compliance',
  CANAL_DENUNCIAS: 'Canal de Denuncias',
  GESTAO_RISCOS_DIGITAIS: 'Gestao de Riscos Digitais',
  OUTROS: 'Outros'
};

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
  const [areaFilter, setAreaFilter] = useState<UserArea | ''>('');
  const [codePrefixFilter, setCodePrefixFilter] = useState<ProjectCodeFilter>('');
  const [sortColumn, setSortColumn] = useState<'name' | 'budgeted' | 'consumed' | 'available' | 'percentage'>('percentage');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    loadData();
  }, []);

  const buildProjectData = (
    projectsList: Project[],
    entriesList: TimesheetEntry[],
    teamConsumedByProject?: Map<string, number>
  ): ProjectBudgetData[] => {
    return projectsList
      .filter((p) => !!p.area)
      .map((p): ProjectBudgetData => {
      const consumed = entriesList
        .filter(e => e.projectId === p.id)
        .reduce((acc, curr) => acc + curr.hours, 0);
      const teamConsumed = teamConsumedByProject
        ? (teamConsumedByProject.get(p.id) || 0)
        : consumed;
      const available = p.budgetedHours - consumed;

      const percentage = p.budgetedHours > 0 ? (consumed / p.budgetedHours) * 100 : 0;

      let status: 'safe' | 'warning' | 'danger' = 'safe';
      if (percentage > 100) status = 'danger';
      else if (percentage >= 85) status = 'warning';

      const area = p.area as UserArea;

      return {
        id: p.id,
        name: p.name,
        code: p.code,
        classification: p.classification,
        area,
        areaLabel: AREA_LABEL[area],
        budgeted: p.budgetedHours,
        consumed: consumed,
        teamConsumed,
        available,
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

    const activeUsers = allUsers.filter(user => user.isActive !== false);

    setProjects(allProjects);
    setEntries(allEntries);
    setUsers(activeUsers);

    // calcula budget de todos os projetos, sem dó
    const budgetData = buildProjectData(allProjects, allEntries);

    setProjectData(budgetData);
    setFilteredData(budgetData);
    setLoading(false);
  };

  const selectedTeamScopeUserIds = useMemo(() => {
    if (!teamFilter) return null;

    const reportsByManager = new Map<string, string[]>();
    users.forEach((user) => {
      if (!user.managerId) return;
      const current = reportsByManager.get(user.managerId) || [];
      reportsByManager.set(user.managerId, [...current, user.id]);
    });

    const scopedUsers = new Set<string>();
    const queue: string[] = [teamFilter];

    while (queue.length > 0) {
      const managerId = queue.shift() as string;
      if (scopedUsers.has(managerId)) continue;

      scopedUsers.add(managerId);

      const directReports = reportsByManager.get(managerId) || [];
      directReports.forEach((reportId) => {
        if (!scopedUsers.has(reportId)) {
          queue.push(reportId);
        }
      });
    }

    return scopedUsers;
  }, [teamFilter, users]);

  const teamConsumedByProject = useMemo(() => {
    if (!selectedTeamScopeUserIds || selectedTeamScopeUserIds.size === 0) return null;

    const teamEntries = entries.filter((entry) => selectedTeamScopeUserIds.has(entry.userId));
    const map = new Map<string, number>();

    teamEntries.forEach((entry) => {
      map.set(entry.projectId, (map.get(entry.projectId) || 0) + entry.hours);
    });

    return map;
  }, [entries, selectedTeamScopeUserIds]);

  const teamConsumedBreakdownByProject = useMemo(() => {
    if (!selectedTeamScopeUserIds || selectedTeamScopeUserIds.size === 0) return new Map<string, string>();

    const userNamesById = new Map(users.map((user) => [user.id, user.name]));
    const projectUserHours = new Map<string, Map<string, number>>();

    entries
      .filter((entry) => selectedTeamScopeUserIds.has(entry.userId))
      .forEach((entry) => {
        const userHours = projectUserHours.get(entry.projectId) || new Map<string, number>();
        userHours.set(entry.userId, (userHours.get(entry.userId) || 0) + entry.hours);
        projectUserHours.set(entry.projectId, userHours);
      });

    const tooltipByProject = new Map<string, string>();

    projectUserHours.forEach((userHours, projectId) => {
      const lines = Array.from(userHours.entries())
        .map(([userId, hours]) => ({
          name: userNamesById.get(userId) || 'Usuario',
          hours,
        }))
        .sort((a, b) => b.hours - a.hours)
        .map((item) => `${item.name}: ${formatHours(item.hours)}h`);

      tooltipByProject.set(projectId, `Equipe filtrada neste projeto:\n${lines.join('\n')}`);
    });

    return tooltipByProject;
  }, [entries, selectedTeamScopeUserIds, users]);

  useEffect(() => {
    let result = projectData;

    // filtro de busca
    if (searchTerm.trim()) {
      result = result.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // filtro por checkbox de projeto
    if (selectedProjectIds.size > 0) {
      result = result.filter(p => selectedProjectIds.has(p.id));
    }

    // filtro por prefixo do código (ht, bo, ad)
    if (codePrefixFilter) {
      result = result.filter(p => matchesProjectType(p.code, codePrefixFilter));
    }

    // filtro por área do projeto
    if (areaFilter) {
      result = result.filter(p => p.area === areaFilter);
    }

    // com filtro de equipe, mantém só projetos com horas da equipe selecionada
    if (teamFilter) {
      result = result.filter((p) => p.teamConsumed > 0);
    }

    // filtro de status
    if (statusFilter !== 'all') {
      result = result.filter(p => p.status === statusFilter);
    }

    // ordenação por coluna selecionada
    result = [...result].sort((a, b) => {
      let comparison = 0;

      switch (sortColumn) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'budgeted':
          comparison = a.budgeted - b.budgeted;
          break;
        case 'consumed':
          comparison = a.consumed - b.consumed;
          break;
        case 'available':
          comparison = a.available - b.available;
          break;
        case 'percentage':
          comparison = a.percentage - b.percentage;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    setFilteredData(result);
  }, [searchTerm, statusFilter, projectData, selectedProjectIds, codePrefixFilter, areaFilter, sortColumn, sortDirection, teamFilter]);

  useEffect(() => {
    if (!projects.length) return;

    const updatedData = buildProjectData(projects, entries, teamConsumedByProject || undefined);
    setProjectData(updatedData);
  }, [projects, entries, teamConsumedByProject]);

  const projectOptions = useMemo(() => {
    let result = projectData;

    if (searchTerm.trim()) {
      result = result.filter((project) =>
        project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.code.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (codePrefixFilter) {
      result = result.filter((project) => matchesProjectType(project.code, codePrefixFilter));
    }

    if (areaFilter) {
      result = result.filter((project) => project.area === areaFilter);
    }

    if (statusFilter !== 'all') {
      result = result.filter((project) => project.status === statusFilter);
    }

    if (teamFilter) {
      result = result.filter((project) => project.teamConsumed > 0);
    }

    return [...result].sort((a, b) => a.name.localeCompare(b.name));
  }, [projectData, searchTerm, codePrefixFilter, areaFilter, statusFilter, teamFilter]);

  useEffect(() => {
    const availableProjectIds = new Set(projectOptions.map((project) => project.id));

    setSelectedProjectIds((currentSelection) => {
      const nextSelection = new Set(
        [...currentSelection].filter((projectId) => availableProjectIds.has(projectId))
      );

      if (nextSelection.size === currentSelection.size) {
        return currentSelection;
      }

      return nextSelection;
    });
  }, [projectOptions]);

  const handleProjectClick = (projectId: string) => {
    navigate(`/manager/reports?projectId=${projectId}`);
  };

  const handleAreaChartClick = (data: { areaValue?: UserArea }) => {
    if (!data.areaValue) return;
    setAreaFilter(data.areaValue);
  };

  const handleSort = (column: 'name' | 'budgeted' | 'consumed' | 'available' | 'percentage') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ column }: { column: 'name' | 'budgeted' | 'consumed' | 'available' | 'percentage' }) => {
    if (sortColumn !== column) return <ArrowUpDown size={14} className="text-slate-400" />;
    return sortDirection === 'asc' 
      ? <ArrowUp size={14} className="text-brand-600" />
      : <ArrowDown size={14} className="text-brand-600" />;
  };

  // calcula kpis respeitando os filtros
  const totalBudgeted = filteredData.reduce((acc, p) => acc + p.budgeted, 0);
  const totalConsumed = filteredData.reduce((acc, p) => acc + p.consumed, 0);
  const totalAvailable = filteredData.reduce((acc, p) => acc + p.available, 0);
  const useTeamConsumedOnSegregation = !!teamFilter;

  const technicalConsumed = filteredData
    .filter((project) => isTechnicalProject(project.code, project.classification))
    .reduce((acc, project) => acc + (useTeamConsumedOnSegregation ? project.teamConsumed : project.consumed), 0);
  const administrativeConsumed = filteredData
    .filter((project) => !isTechnicalProject(project.code, project.classification))
    .reduce((acc, project) => acc + (useTeamConsumedOnSegregation ? project.teamConsumed : project.consumed), 0);
  const technicalBudgeted = filteredData
    .filter((project) => isTechnicalProject(project.code, project.classification))
    .reduce((acc, project) => acc + project.budgeted, 0);
  const administrativeBudgeted = filteredData
    .filter((project) => !isTechnicalProject(project.code, project.classification))
    .reduce((acc, project) => acc + project.budgeted, 0);
  const totalSegregatedConsumed = technicalConsumed + administrativeConsumed;

  const technicalBudgetShare = totalBudgeted > 0 ? (technicalBudgeted / totalBudgeted) * 100 : 0;
  const administrativeBudgetShare = totalBudgeted > 0 ? (administrativeBudgeted / totalBudgeted) * 100 : 0;
  const technicalConsumedShare = totalSegregatedConsumed > 0 ? (technicalConsumed / totalSegregatedConsumed) * 100 : 0;
  const administrativeConsumedShare = totalSegregatedConsumed > 0 ? (administrativeConsumed / totalSegregatedConsumed) * 100 : 0;
  const showTeamConsumedColumn = !!teamFilter && filteredData.some((project) => Math.abs(project.consumed - project.teamConsumed) > 0.01);

  // dados do gráfico: orçado vs realizado por área
  const areaChartData = useMemo(() => {
    const byArea = new Map<UserArea, { area: string; areaValue: UserArea; orcado: number; realizado: number }>();
    filteredData.forEach((p) => {
      const curr = byArea.get(p.area) || {
        area: p.areaLabel,
        areaValue: p.area,
        orcado: 0,
        realizado: 0
      };
      byArea.set(p.area, {
        ...curr,
        orcado: curr.orcado + p.budgeted,
        realizado: curr.realizado + p.consumed
      });
    });
    return Array.from(byArea.values())
      .map((vals) => ({ ...vals, disponivel: vals.orcado - vals.realizado }))
      .sort((a, b) => b.orcado - a.orcado);
  }, [filteredData]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-brand-600" size={48} /></div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Orçado vs Realizado - Todos os Projetos</h1>
        <p className="text-slate-500">Visão consolidada de horas por projeto em toda a diretoria</p>
      </div>

      {/* topo otimizado: kpis compactos, gráfico por área e segregação ocupando duas linhas */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* kpis */}
        <div className="xl:col-span-7 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Total Orçado</p>
            <div className="text-[2rem] leading-none font-bold text-slate-800">{formatHours(totalBudgeted)}h</div>
            <p className="text-xs text-slate-400 mt-3">{filteredData.length} projetos</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Total Realizado</p>
            <div className="text-[2rem] leading-none font-bold text-slate-800">{formatHours(totalConsumed)}h</div>
            <p className="text-xs text-slate-400 mt-3">{totalBudgeted > 0 ? formatPercentage((totalConsumed / totalBudgeted) * 100) : '0'}% consumido</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Horas Disponíveis</p>
            <div className={`text-[2rem] leading-none font-bold ${totalAvailable >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatHours(totalAvailable)}h</div>
            <p className="text-xs text-slate-400 mt-3">Orçado menos realizado no recorte</p>
          </div>
        </div>

        {/* card de segregação */}
        <div className="xl:col-span-5 xl:row-span-2 bg-white rounded-xl shadow-sm border border-slate-100 p-5 h-full">
          <div className="flex items-center justify-between gap-3 mb-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Segregação de Horas</p>
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-600" />Técnicas</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />Adm.</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Orçado</p>
                  <p className="text-[10px] text-slate-400">Distribuição planejada das horas</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-800">{formatHours(totalBudgeted)}h</p>
                  <p className="text-[10px] text-slate-400">base total</p>
                </div>
              </div>

              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="flex h-full w-full">
                  <div className="bg-brand-600" style={{ width: `${technicalBudgetShare}%` }} />
                  <div className="bg-red-500" style={{ width: `${administrativeBudgetShare}%` }} />
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-md bg-white px-2 py-1.5 border border-slate-100">
                  <div className="flex items-center justify-between gap-2 text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-600" />Técnicas</span>
                    <span>{formatPercentage(technicalBudgetShare)}%</span>
                  </div>
                  <p className="mt-1 font-bold text-slate-800">{formatHours(technicalBudgeted)}h</p>
                </div>
                <div className="rounded-md bg-white px-2 py-1.5 border border-slate-100">
                  <div className="flex items-center justify-between gap-2 text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />Adm.</span>
                    <span>{formatPercentage(administrativeBudgetShare)}%</span>
                  </div>
                  <p className="mt-1 font-bold text-slate-800">{formatHours(administrativeBudgeted)}h</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Realizado</p>
                  <p className="text-[10px] text-slate-400">Como as horas foram consumidas</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-800">{formatHours(totalSegregatedConsumed)}h</p>
                  <p className="text-[10px] text-slate-400">{totalBudgeted > 0 ? `${formatPercentage((totalSegregatedConsumed / totalBudgeted) * 100)}% do orçado` : 'sem base'}</p>
                </div>
              </div>

              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="flex h-full w-full">
                  <div className="bg-brand-600" style={{ width: `${technicalConsumedShare}%` }} />
                  <div className="bg-red-500" style={{ width: `${administrativeConsumedShare}%` }} />
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-md bg-white px-2 py-1.5 border border-slate-100">
                  <div className="flex items-center justify-between gap-2 text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-600" />Técnicas</span>
                    <span>{formatPercentage(technicalConsumedShare)}%</span>
                  </div>
                  <p className="mt-1 font-bold text-slate-800">{formatHours(technicalConsumed)}h</p>
                </div>
                <div className="rounded-md bg-white px-2 py-1.5 border border-slate-100">
                  <div className="flex items-center justify-between gap-2 text-slate-500">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />Adm.</span>
                    <span>{formatPercentage(administrativeConsumedShare)}%</span>
                  </div>
                  <p className="mt-1 font-bold text-slate-800">{formatHours(administrativeConsumed)}h</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Disponível</span>
              <span className={`text-sm font-bold ${totalAvailable >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatHours(totalAvailable)}h</span>
            </div>
          </div>
        </div>

        {/* gráfico orçado vs realizado por área */}
        {areaChartData.length > 0 && (
          <div className="xl:col-span-7 bg-white rounded-xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Orçado vs Realizado por Área</h3>
              <p className="text-xs text-slate-400 mt-1">Clique em qualquer barra para filtrar a tela pela área.</p>
            </div>
            {areaFilter && (
              <button
                type="button"
                onClick={() => setAreaFilter('')}
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Limpar área
              </button>
            )}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={areaChartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barGap={4}>
              <XAxis
                dataKey="area"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `${formatHours(v)}h`}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={60}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${formatHours(value)}h`,
                  name === 'orcado' ? 'Orçado' : name === 'realizado' ? 'Realizado' : 'Disponível',
                ]}
                labelStyle={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
              />
              <Legend
                formatter={(value) => value === 'orcado' ? 'Orçado' : value === 'realizado' ? 'Realizado' : 'Disponível'}
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              />
              <Bar dataKey="orcado" name="orcado" fill="#cbd5e1" radius={[4, 4, 0, 0]} maxBarSize={40} cursor="pointer" onClick={handleAreaChartClick} />
              <Bar dataKey="realizado" name="realizado" fill="#0033C6" radius={[4, 4, 0, 0]} maxBarSize={40} cursor="pointer" onClick={handleAreaChartClick} />
              <Bar dataKey="disponivel" name="disponivel" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} cursor="pointer" onClick={handleAreaChartClick} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* filtros e tabela */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* busca */}
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

            {/* filtro de time */}
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

            {/* filtro de status */}
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

            {/* filtro de área */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">Área</label>
              <select
                value={areaFilter}
                onChange={(e) => setAreaFilter((e.target.value || '') as UserArea | '')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">Todas</option>
                {Object.entries(AREA_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* filtro de prefixo do código */}
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2">Tipo (Código)</label>
              <select
                value={codePrefixFilter}
                onChange={(e) => setCodePrefixFilter((e.target.value || '') as ProjectCodeFilter)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">Todos</option>
                <option value="HT">HT - Horas Técnicas</option>
                <option value="BO">BO - Backoffice</option>
                <option value="AD">AD - Administrativas</option>
              </select>
            </div>
          </div>

          {/* filtro de checkbox por projeto */}
          <div className="mt-4">
            <label className="block text-xs font-bold text-slate-500 mb-2">Selecionar Projetos</label>
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-3 bg-slate-50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {projectOptions.map(p => (
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

        {/* tabela */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th 
                    onClick={() => handleSort('name')}
                    className="px-6 py-3 font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      Projeto
                      <SortIcon column="name" />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('budgeted')}
                    className="px-6 py-3 font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      Orçado
                      <SortIcon column="budgeted" />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('consumed')}
                    className="px-6 py-3 font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      Realizado
                      <SortIcon column="consumed" />
                    </div>
                  </th>
                  {showTeamConsumedColumn && (
                    <th className="px-6 py-3 font-semibold text-slate-600">Realizado (Equipe Filtrada)</th>
                  )}
                  <th 
                    onClick={() => handleSort('available')}
                    className="px-6 py-3 font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      Disponível
                      <SortIcon column="available" />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('percentage')}
                    className="px-6 py-3 font-semibold text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      Consumo
                      <SortIcon column="percentage" />
                    </div>
                  </th>
                  <th className="px-6 py-3 font-semibold text-slate-600">Progresso</th>
                  <th className="px-6 py-3 font-semibold text-slate-600 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={showTeamConsumedColumn ? 8 : 7} className="px-6 py-8 text-center text-slate-400">
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
                      {showTeamConsumedColumn && (
                        <td
                          className="px-6 py-4 font-medium text-slate-700 cursor-help"
                          title={teamConsumedBreakdownByProject.get(project.id) || 'Sem lançamentos da equipe neste projeto.'}
                        >
                          {formatHours(project.teamConsumed)}h
                        </td>
                      )}
                      <td className={`px-6 py-4 font-medium ${project.available >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatHours(project.available)}h</td>
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

        {/* legenda */}
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
