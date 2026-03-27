
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { store, SUPABASE_SCHEMA_SQL } from '../services/store';
import { User, Project, TimesheetEntry, CalendarException, UserArea, RiskMatrixAccess, LeaveType, AppNotice, formatHours } from '../types';
import { Database, Edit, Filter, Calendar, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Bell } from 'lucide-react';
import { DashboardLoadingState } from '../components/DashboardLoadingState';
import { formatDateForDisplay } from '../utils/date';

interface ManagerApprovalBacklogGroup {
  managerId: string;
  managerName: string;
  officialManagerName?: string;
  pendingCount: number;
  teamMembersCount: number;
  oldestUpdatedAt: string;
  periods: Array<{
    id: string;
    userId: string;
    userName: string;
    year: number;
    month: number;
    updatedAt: string;
  }>;
}

export const AdminDashboard: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'users' | 'projects' | 'reports' | 'settings'>('users');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [exceptions, setExceptions] = useState<CalendarException[]>([]);
  const [managerApprovalBacklog, setManagerApprovalBacklog] = useState<ManagerApprovalBacklogGroup[]>([]);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [loading, setLoading] = useState(false);
    const [riskAccessByUser, setRiskAccessByUser] = useState<Record<string, RiskMatrixAccess>>({});
    const [savingRiskAccess, setSavingRiskAccess] = useState(false);
    const [dailyHourLimit, setDailyHourLimit] = useState(10);
    const [savingDailyHourLimit, setSavingDailyHourLimit] = useState(false);
    const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
    const [savingLeaveTypes, setSavingLeaveTypes] = useState(false);
    const [notices, setNotices] = useState<AppNotice[]>([]);
    const [savingNotice, setSavingNotice] = useState(false);
    const [newNotice, setNewNotice] = useState({ title: '', description: '', expiresAt: '' });
    const [newLeaveType, setNewLeaveType] = useState({
        code: '',
        name: '',
        color: '#2563eb',
        yearlyLimit: '',
        preferredBirthdayMonth: false
    });
    const [userSortColumn, setUserSortColumn] = useState<'name' | 'manager' | 'role'>('name');
    const [userSortDirection, setUserSortDirection] = useState<'asc' | 'desc'>('asc');
    const [projectSortColumn, setProjectSortColumn] = useState<'project' | 'classification' | 'area' | 'budgetedHours' | 'permissions'>('project');
    const [projectSortDirection, setProjectSortDirection] = useState<'asc' | 'desc'>('asc');
    const [projectFilterData, setProjectFilterData] = useState({
        search: '',
        classification: '',
        area: '',
        status: 'all' as 'all' | 'active' | 'inactive'
    });
    const [reportSearchTerm, setReportSearchTerm] = useState('');
    const [reportSortColumn, setReportSortColumn] = useState<'date' | 'user' | 'project' | 'description' | 'hours'>('date');
    const [reportSortDirection, setReportSortDirection] = useState<'asc' | 'desc'>('desc');

    // estado de usuários
  const [editingUser, setEditingUser] = useState<User | null>(null);
    const [userData, setUserData] = useState({
        name: '',
        email: '',
        role: 'USER' as any,
        managerId: '',
        area: '' as any,
        birthdayDate: '',
        admissionDate: '2020-01-01',
        terminationDate: '',
        isActive: true,
        requiresTimesheet: true
    });

    // estado de projetos
  const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [projectData, setProjectData] = useState({ name: '', code: '', classification: 'Audit' as any, area: '' as UserArea | '', budgetedHours: 0, active: true, allowedManagerIds: [] as string[] });
    const [projectAdjustmentData, setProjectAdjustmentData] = useState({
        enabled: false,
        adjustedHours: '',
        justification: ''
    });

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

    const normalizeText = (value?: string) =>
        (value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();

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

  const handleAddNotice = async () => {
    if (!newNotice.title.trim() || !newNotice.expiresAt) {
      alert('Informe o título e a data de expiração do aviso.');
      return;
    }
    setSavingNotice(true);
    const ok = await store.addNotice({
      title: newNotice.title.trim(),
      description: newNotice.description.trim() || undefined,
      expiresAt: newNotice.expiresAt
    });
    setSavingNotice(false);
    if (ok) {
      setNewNotice({ title: '', description: '', expiresAt: '' });
      const updated = await store.getNotices();
      setNotices(updated);
    } else {
      alert('Não foi possível salvar o aviso.');
    }
  };

  const handleDeleteNotice = async (id: string) => {
    if (!window.confirm('Remover este aviso?')) return;
    const ok = await store.deleteNotice(id);
    if (ok) {
      setNotices((prev) => prev.filter((n) => n.id !== id));
    }
  };

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

    const [allUsers, allProjects, allEntries, allExceptions, allPeriods, configuredDailyLimit, configuredLeaveTypes, allNotices] = await Promise.all([
        store.getUsers(),
        store.getProjects(),
        store.getEntries(),
        store.getExceptions(),
        store.getTimesheetPeriods(),
        store.getDailyHourLimit(),
        store.getLeaveTypes(),
        store.getNotices()
    ]);
    setUsers(allUsers);
    setProjects(allProjects);
    setEntries(allEntries);
    setExceptions(allExceptions);
    setDailyHourLimit(configuredDailyLimit);
    setLeaveTypes(configuredLeaveTypes);
    setNotices(allNotices);
        setRiskAccessByUser(
            allUsers.reduce<Record<string, RiskMatrixAccess>>((acc, item) => {
                if (item.role === 'ADMIN') {
                    acc[item.id] = 'EDIT';
                } else {
                    acc[item.id] = item.riskMatrixAccess || 'NONE';
                }
                return acc;
            }, {})
        );

    const activeUsers = allUsers.filter((item) => item.isActive !== false);
    const userMap = new Map(activeUsers.map((item) => [item.id, item]));
    const submittedPeriods = allPeriods.filter((period) => period.status === 'SUBMITTED' && period.managerId);
    const groupedBacklog = new Map<string, ManagerApprovalBacklogGroup>();

    submittedPeriods.forEach((period) => {
      const employee = userMap.get(period.userId);
      const officialManager = employee?.managerId ? userMap.get(employee.managerId) : null;
      const delegatedApprover = officialManager?.delegatedManagerId
        ? userMap.get(officialManager.delegatedManagerId)
        : null;
      const currentApprover = period.managerId ? userMap.get(period.managerId) : null;

      const manager = delegatedApprover || currentApprover || officialManager;

      if (!manager || !employee) return;
      if (manager.role !== 'MANAGER' && manager.role !== 'ADMIN') return;

      const officialManagerName =
        officialManager && officialManager.id !== manager.id
          ? officialManager.name
          : undefined;

      const currentGroup = groupedBacklog.get(manager.id) || {
        managerId: manager.id,
        managerName: manager.name,
        officialManagerName,
        pendingCount: 0,
        teamMembersCount: 0,
        oldestUpdatedAt: period.updatedAt,
        periods: []
      };

      currentGroup.pendingCount += 1;
      currentGroup.periods.push({
        id: period.id,
        userId: employee.id,
        userName: employee.name,
        year: period.year,
        month: period.month,
        updatedAt: period.updatedAt
      });

      if (new Date(period.updatedAt).getTime() < new Date(currentGroup.oldestUpdatedAt).getTime()) {
        currentGroup.oldestUpdatedAt = period.updatedAt;
      }

      currentGroup.teamMembersCount = new Set(currentGroup.periods.map((item) => item.userId)).size;
      groupedBacklog.set(manager.id, currentGroup);
    });

    setManagerApprovalBacklog(
      [...groupedBacklog.values()]
        .map((group) => ({
          ...group,
          periods: [...group.periods].sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
        }))
        .sort((a, b) => {
          if (b.pendingCount !== a.pendingCount) return b.pendingCount - a.pendingCount;
          return new Date(a.oldestUpdatedAt).getTime() - new Date(b.oldestUpdatedAt).getTime();
        })
    );

    setLoading(false);
  };

    const handleSaveDailyHourLimit = async () => {
        const normalizedLimit = Number(dailyHourLimit);
        if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0) {
            alert('Informe um limite diário válido (maior que zero).');
            return;
        }

        setSavingDailyHourLimit(true);
        const ok = await store.updateDailyHourLimit(normalizedLimit);
        setSavingDailyHourLimit(false);

        if (ok) {
            alert('Limite diário salvo com sucesso.');
        } else {
            alert('Não foi possível salvar no banco agora. O valor foi salvo localmente neste navegador.');
        }
    };

    const handleSaveRiskAccess = async () => {
        setSavingRiskAccess(true);
        try {
            const updates = users
                .filter(user => user.role !== 'ADMIN')
                .filter(user => (user.riskMatrixAccess || 'NONE') !== (riskAccessByUser[user.id] || 'NONE'));

            for (const user of updates) {
                await store.updateUser(user.id, { riskMatrixAccess: riskAccessByUser[user.id] || 'NONE' });
            }

            if (updates.length > 0) {
                alert('Permissões da Matriz de Riscos atualizadas com sucesso.');
            } else {
                alert('Nenhuma alteração de permissão para salvar.');
            }

            await refreshData();
        } finally {
            setSavingRiskAccess(false);
        }
    };

    const handleAddLeaveType = () => {
        const normalizedCode = newLeaveType.code.trim().toUpperCase();
        const normalizedName = newLeaveType.name.trim();

        if (!normalizedCode || !normalizedName) {
            alert('Informe código e nome para o tipo de folga.');
            return;
        }

        if (leaveTypes.some((item) => item.code.toUpperCase() === normalizedCode)) {
            alert('Já existe um tipo com esse código.');
            return;
        }

        setLeaveTypes((prev) => ([
            ...prev,
            {
                code: normalizedCode,
                name: normalizedName,
                color: newLeaveType.color || '#2563eb',
                yearlyLimit: newLeaveType.yearlyLimit ? Number(newLeaveType.yearlyLimit) : undefined,
                preferredBirthdayMonth: newLeaveType.preferredBirthdayMonth,
                active: true
            }
        ]));

        setNewLeaveType({
            code: '',
            name: '',
            color: '#2563eb',
            yearlyLimit: '',
            preferredBirthdayMonth: false
        });
    };

    const handleRemoveLeaveType = (code: string) => {
        setLeaveTypes((prev) => prev.filter((item) => item.code !== code));
    };

    const handleSaveLeaveTypes = async () => {
        setSavingLeaveTypes(true);
        const ok = await store.updateLeaveTypes(leaveTypes);
        setSavingLeaveTypes(false);

        if (ok) {
            alert('Tipos de folga salvos com sucesso.');
            await refreshData();
            return;
        }

        alert('Não foi possível salvar no banco agora.');
    };

    // --- handlers de usuário ---
  const handleEditUserClick = (u: User) => {
      setEditingUser(u);
      setUserData({ 
        name: u.name, 
        email: u.email, 
        role: u.role, 
        managerId: u.managerId || '', 
            area: u.area || '',
                                birthdayDate: u.birthdayDate || '',
                admissionDate: u.admissionDate || '2020-01-01',
                terminationDate: u.terminationDate || '',
        isActive: u.isActive !== false,
        requiresTimesheet: u.requiresTimesheet !== false // default true se não existir
      });
  };

  const handleCancelEditUser = () => {
      setEditingUser(null);
            setUserData({
                name: '',
                email: '',
                role: 'USER',
                managerId: '',
                area: '',
                birthdayDate: '',
                admissionDate: '2020-01-01',
                terminationDate: '',
                isActive: true,
                requiresTimesheet: true
            });
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
        setUserData({
            name: '',
            email: '',
            role: 'USER',
            managerId: '',
            area: '',
            birthdayDate: '',
            admissionDate: '2020-01-01',
            terminationDate: '',
            isActive: true,
            requiresTimesheet: true
        });
    refreshData();
  };

    // --- handlers de projeto ---
  const handleEditProjectClick = (p: Project) => {
      setEditingProject(p);
      setProjectData({ 
          name: p.name, 
          code: p.code, 
          classification: p.classification, 
          area: p.area || '',
          budgetedHours: p.budgetedHours,
          active: p.active,
          allowedManagerIds: p.allowedManagerIds || []
      });
      setProjectAdjustmentData({
          enabled: false,
          adjustedHours: String(p.budgetedHours || 0),
          justification: ''
      });
  };

  const handleCancelEditProject = () => {
      setEditingProject(null);
      setProjectData({ name: '', code: '', classification: 'Audit', area: '', budgetedHours: 0, active: true, allowedManagerIds: [] });
      setProjectAdjustmentData({ enabled: false, adjustedHours: '', justification: '' });
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
        let nextBudgetedHours = Number(projectData.budgetedHours);
        let adjustmentJustification: string | undefined;
        let adjustedAt: string | undefined;

        if (editingProject && projectAdjustmentData.enabled) {
            const parsedAdjustedHours = Number(projectAdjustmentData.adjustedHours);
            if (!Number.isFinite(parsedAdjustedHours) || parsedAdjustedHours < 0) {
                alert('Informe um valor válido para as horas ajustadas.');
                return;
            }

            const normalizedJustification = projectAdjustmentData.justification.trim();
            if (!normalizedJustification) {
                alert('Informe a justificativa do ajuste de horas.');
                return;
            }

            nextBudgetedHours = parsedAdjustedHours;
            adjustmentJustification = normalizedJustification;
            adjustedAt = new Date().toISOString();
        }

        const normalizedProjectData = {
            ...projectData,
            area: projectData.area || undefined,
            budgetedHours: nextBudgetedHours,
            budgetAdjustmentJustification: adjustmentJustification,
            budgetAdjustedAt: adjustedAt
        };

    if (editingProject) {
                await store.updateProject(editingProject.id, normalizedProjectData);
        setEditingProject(null);
    } else {
                await store.addProject(normalizedProjectData);
    }
    setProjectData({ name: '', code: '', classification: 'Audit', area: '', budgetedHours: 0, active: true, allowedManagerIds: [] });
        setProjectAdjustmentData({ enabled: false, adjustedHours: '', justification: '' });
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
      if (reportSearchTerm.trim()) {
          const normalizedSearch = normalizeText(reportSearchTerm.trim());
          result = result.filter(e => {
              const userName = getUserName(e.userId);
              const projectName = getProjectName(e.projectId);

              return [
                  e.description,
                  e.date,
                  userName,
                  projectName
              ].some(value => normalizeText(value).includes(normalizedSearch));
          });
      }

      setFilteredEntries(result);
  };

  useEffect(() => {
    if(activeTab === 'reports') applyFilters();
  }, [filterData, activeTab, entries, reportSearchTerm, users, projects]);


    // helpers
  const managers = users.filter(u => (u.role === 'MANAGER' || u.role === 'ADMIN') && u.isActive !== false);
    const areaLabelMap: Record<UserArea, string> = {
        AUDITORIA_INTERNA: 'Auditoria Interna',
        CONTROLES_INTERNOS: 'Controles Internos',
        COMPLIANCE: 'Compliance',
        CANAL_DENUNCIAS: 'Canal de Denuncias',
        GESTAO_RISCOS_DIGITAIS: 'Gestao de Riscos Digitais',
        OUTROS: 'Outros'
    };
  const getManagerName = (id?: string) => users.find(u => u.id === id)?.name || '-';
  const getUserName = (id: string) => users.find(u => u.id === id)?.name || 'Desconhecido';
  const getProjectName = (id: string) => projects.find(p => p.id === id)?.name || 'Desconhecido';
    const getProjectPermissionsLabel = (project: Project) => {
        if (!project.allowedManagerIds || project.allowedManagerIds.length === 0) {
            return 'Todos';
        }

        return `${project.allowedManagerIds.length} Equipes`;
    };
  const totalPendingManagerApprovals = managerApprovalBacklog.reduce((acc, group) => acc + group.pendingCount, 0);
  const formatPeriodLabel = (year: number, month: number) =>
    new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
  const formatTimestamp = (value: string) =>
    new Date(value).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    const handleUserSort = (column: 'name' | 'manager' | 'role') => {
        if (userSortColumn === column) {
            setUserSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
            return;
        }

        setUserSortColumn(column);
        setUserSortDirection('asc');
    };

    const UserSortIcon = ({ column }: { column: 'name' | 'manager' | 'role' }) => {
        if (userSortColumn !== column) return <ArrowUpDown size={14} className="text-slate-400" />;
        return userSortDirection === 'asc'
            ? <ArrowUp size={14} className="text-brand-600" />
            : <ArrowDown size={14} className="text-brand-600" />;
    };

    const handleProjectSort = (column: 'project' | 'classification' | 'area' | 'budgetedHours' | 'permissions') => {
        if (projectSortColumn === column) {
            setProjectSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
            return;
        }

        setProjectSortColumn(column);
        setProjectSortDirection('asc');
    };

    const ProjectSortIcon = ({ column }: { column: 'project' | 'classification' | 'area' | 'budgetedHours' | 'permissions' }) => {
        if (projectSortColumn !== column) return <ArrowUpDown size={14} className="text-slate-400" />;
        return projectSortDirection === 'asc'
            ? <ArrowUp size={14} className="text-brand-600" />
            : <ArrowDown size={14} className="text-brand-600" />;
    };

    const handleReportSort = (column: 'date' | 'user' | 'project' | 'description' | 'hours') => {
        if (reportSortColumn === column) {
            setReportSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
            return;
        }

        setReportSortColumn(column);
        setReportSortDirection(column === 'date' ? 'desc' : 'asc');
    };

    const ReportSortIcon = ({ column }: { column: 'date' | 'user' | 'project' | 'description' | 'hours' }) => {
        if (reportSortColumn !== column) return <ArrowUpDown size={14} className="text-slate-400" />;
        return reportSortDirection === 'asc'
            ? <ArrowUp size={14} className="text-brand-600" />
            : <ArrowDown size={14} className="text-brand-600" />;
    };

    const sortedUsers = React.useMemo(() => {
        const sorted = [...users].sort((a, b) => {
            let comparison = 0;

            if (userSortColumn === 'name') {
                comparison = a.name.localeCompare(b.name, 'pt-BR');
            } else if (userSortColumn === 'manager') {
                comparison = getManagerName(a.managerId).localeCompare(getManagerName(b.managerId), 'pt-BR');
            } else {
                comparison = a.role.localeCompare(b.role, 'pt-BR');
            }

            return userSortDirection === 'asc' ? comparison : -comparison;
        });

        return sorted;
    }, [users, userSortColumn, userSortDirection]);

    const filteredProjects = React.useMemo(() => {
        const normalizedSearch = normalizeText(projectFilterData.search.trim());

        return projects.filter(project => {
            if (projectFilterData.classification && project.classification !== projectFilterData.classification) {
                return false;
            }

            if (projectFilterData.area && (project.area || '') !== projectFilterData.area) {
                return false;
            }

            if (projectFilterData.status === 'active' && !project.active) {
                return false;
            }

            if (projectFilterData.status === 'inactive' && project.active) {
                return false;
            }

            if (!normalizedSearch) {
                return true;
            }

            return [
                project.code,
                project.name,
                project.classification,
                project.area ? areaLabelMap[project.area] : '',
                getProjectPermissionsLabel(project)
            ].some(value => normalizeText(value).includes(normalizedSearch));
        });
    }, [projects, projectFilterData]);

    const sortedProjects = React.useMemo(() => {
        const sorted = [...filteredProjects].sort((a, b) => {
            let comparison = 0;

            if (projectSortColumn === 'project') {
                comparison = `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, 'pt-BR', { numeric: true });
            } else if (projectSortColumn === 'classification') {
                comparison = a.classification.localeCompare(b.classification, 'pt-BR');
            } else if (projectSortColumn === 'area') {
                comparison = (a.area ? areaLabelMap[a.area] : '').localeCompare(b.area ? areaLabelMap[b.area] : '', 'pt-BR');
            } else if (projectSortColumn === 'budgetedHours') {
                comparison = a.budgetedHours - b.budgetedHours;
            } else {
                comparison = getProjectPermissionsLabel(a).localeCompare(getProjectPermissionsLabel(b), 'pt-BR', { numeric: true });
            }

            return projectSortDirection === 'asc' ? comparison : -comparison;
        });

        return sorted;
    }, [filteredProjects, projectSortColumn, projectSortDirection]);

    const sortedFilteredEntries = React.useMemo(() => {
        const sorted = [...filteredEntries].sort((a, b) => {
            let comparison = 0;

            if (reportSortColumn === 'date') {
                comparison = a.date.localeCompare(b.date);
            } else if (reportSortColumn === 'user') {
                comparison = getUserName(a.userId).localeCompare(getUserName(b.userId), 'pt-BR');
            } else if (reportSortColumn === 'project') {
                comparison = getProjectName(a.projectId).localeCompare(getProjectName(b.projectId), 'pt-BR');
            } else if (reportSortColumn === 'description') {
                comparison = a.description.localeCompare(b.description, 'pt-BR');
            } else {
                comparison = a.hours - b.hours;
            }

            return reportSortDirection === 'asc' ? comparison : -comparison;
        });

        return sorted;
    }, [filteredEntries, reportSortColumn, reportSortDirection, users, projects]);

    if (loading && users.length === 0) {
        return (
            <DashboardLoadingState
                title="Carregando administracao"
                subtitle="Sincronizando usuarios, permissoes e configuracoes da base..."
            />
        );
    }

  return (
        <div className="space-y-6">
            <div className="space-y-6">
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
          <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-5 border-b border-slate-100 bg-slate-50">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div>
                              <h3 className="font-semibold text-slate-700">Pendências de Aprovação por Gestor</h3>
                              <p className="text-sm text-slate-500 mt-1">
                                  Usuários que já enviaram o timesheet e ainda aguardam a aprovação do responsável atual.
                              </p>
                          </div>
                          <div className="flex gap-3">
                              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 min-w-[120px]">
                                  <p className="text-[11px] font-bold uppercase text-amber-700">Pendências</p>
                                  <p className="text-2xl font-bold text-amber-900 mt-1">{totalPendingManagerApprovals}</p>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 min-w-[120px]">
                                  <p className="text-[11px] font-bold uppercase text-slate-500">Gestores</p>
                                  <p className="text-2xl font-bold text-slate-900 mt-1">{managerApprovalBacklog.length}</p>
                              </div>
                          </div>
                      </div>
                  </div>

                  {managerApprovalBacklog.length > 0 ? (
                      <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                              <thead className="bg-white font-semibold text-slate-500 border-b border-gray-200">
                                  <tr>
                                      <th className="px-6 py-3">Gestor</th>
                                      <th className="px-6 py-3">Pendências</th>
                                      <th className="px-6 py-3">Colaboradores</th>
                                      <th className="px-6 py-3">Mais antiga</th>
                                      <th className="px-6 py-3">Detalhes</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                  {managerApprovalBacklog.map((group) => (
                                      <tr key={group.managerId} className="hover:bg-slate-50 align-top">
                                          <td className="px-6 py-4">
                                              <p className="font-medium text-slate-800">{group.managerName}</p>
                                              {group.officialManagerName && (
                                                  <p className="mt-1 text-xs text-slate-500">
                                                      Gestão delegada por {group.officialManagerName}
                                                  </p>
                                              )}
                                          </td>
                                          <td className="px-6 py-4">
                                              <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
                                                  {group.pendingCount} aguardando aprovação
                                              </span>
                                          </td>
                                          <td className="px-6 py-4 text-slate-600">{group.teamMembersCount}</td>
                                          <td className="px-6 py-4 text-slate-600">{formatTimestamp(group.oldestUpdatedAt)}</td>
                                          <td className="px-6 py-4">
                                              <div className="space-y-2">
                                                  {group.periods.slice(0, 3).map((period) => (
                                                      <div key={period.id} className="text-xs text-slate-600">
                                                          <span className="font-medium text-slate-700">{period.userName}</span>
                                                          {' • '}
                                                          <span>{formatPeriodLabel(period.year, period.month)}</span>
                                                      </div>
                                                  ))}
                                                  {group.periods.length > 3 && (
                                                      <p className="text-xs text-slate-400">
                                                          +{group.periods.length - 3} pendência(s) adicional(is)
                                                      </p>
                                                  )}
                                              </div>
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  ) : (
                      <div className="p-8 text-center text-slate-500">
                          Não há gestores com timesheets aguardando aprovação no momento.
                      </div>
                  )}
              </div>

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
                                  <th className="px-6 py-3">
                                      <button type="button" onClick={() => handleUserSort('name')} className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors">
                                          Nome
                                          <UserSortIcon column="name" />
                                      </button>
                                  </th>
                                  <th className="px-6 py-3">
                                      <button type="button" onClick={() => handleUserSort('manager')} className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors">
                                          Gestor (Equipe)
                                          <UserSortIcon column="manager" />
                                      </button>
                                  </th>
                                  <th className="px-6 py-3">
                                      <button type="button" onClick={() => handleUserSort('role')} className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors">
                                          Função
                                          <UserSortIcon column="role" />
                                      </button>
                                  </th>
                                  <th className="px-6 py-3">Área</th>
                                  <th className="px-6 py-3">Admissão</th>
                                  <th className="px-6 py-3">Desligamento</th>
                                  <th className="px-6 py-3 text-right">Ação</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                              {sortedUsers.map(u => (
                                  <tr key={u.id} className={u.isActive === false ? 'bg-slate-50 opacity-60' : 'hover:bg-slate-50'}>
                                      <td className="px-6 py-3 flex items-center gap-2">
                                          <img src={u.avatarUrl} className="w-6 h-6 rounded-full" />
                                          <div>
                                              <div className="font-medium">{u.name}</div>
                                              <div className="text-xs text-slate-400">{u.email}</div>
                                          </div>
                                      </td>
                                      <td className="px-6 py-3 text-slate-600">{getManagerName(u.managerId)}</td>
                                      <td className="px-6 py-3">
                                          <div className="flex items-center gap-2">
                                              <span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-600">{u.role}</span>
                                              <span className={`px-2 py-1 rounded text-[10px] font-bold ${u.isActive === false ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                  {u.isActive === false ? 'INATIVO' : 'ATIVO'}
                                              </span>
                                              {u.requiresTimesheet === false && (
                                                  <span className="px-2 py-1 rounded text-[10px] font-bold bg-amber-100 text-amber-700" title="Não precisa lançar horas">
                                                      SEM TIMESHEET
                                                  </span>
                                              )}
                                          </div>
                                      </td>
                                      <td className="px-6 py-3 text-xs text-slate-600">{u.area ? u.area.replace(/_/g, ' ') : '-'}</td>
                                      <td className="px-6 py-3 text-xs text-slate-600">{u.admissionDate ? formatDateForDisplay(u.admissionDate) : '-'}</td>
                                      <td className="px-6 py-3 text-xs text-slate-600">{u.terminationDate ? formatDateForDisplay(u.terminationDate) : '-'}</td>
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
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Área</label>
                          <select className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={userData.area} onChange={e => setUserData({...userData, area: e.target.value as any})}>
                              <option value="">Selecionar depois</option>
                              <option value="AUDITORIA_INTERNA">Auditoria Interna</option>
                              <option value="CONTROLES_INTERNOS">Controles Internos</option>
                              <option value="COMPLIANCE">Compliance</option>
                              <option value="CANAL_DENUNCIAS">Canal de Denúncias</option>
                              <option value="GESTAO_RISCOS_DIGITAIS">Gestão de Riscos Digitais</option>
                              <option value="OUTROS">Outros</option>
                          </select>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Data de Aniversário</label>
                              <input
                                  type="date"
                                  className="w-full border border-gray-300 p-2 rounded-lg text-sm"
                                  value={userData.birthdayDate}
                                  onChange={e => setUserData({...userData, birthdayDate: e.target.value})}
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Data de Admissão</label>
                              <input
                                  type="date"
                                  className="w-full border border-gray-300 p-2 rounded-lg text-sm"
                                  value={userData.admissionDate}
                                  onChange={e => setUserData({...userData, admissionDate: e.target.value})}
                                  required
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Data de Desligamento</label>
                              <input
                                  type="date"
                                  className="w-full border border-gray-300 p-2 rounded-lg text-sm"
                                  value={userData.terminationDate}
                                  onChange={e => setUserData({...userData, terminationDate: e.target.value})}
                              />
                          </div>
                      </div>
                      <div>
                          <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                  type="checkbox"
                                  checked={userData.isActive}
                                  onChange={e => setUserData({...userData, isActive: e.target.checked})}
                                  className="rounded text-brand-600"
                              />
                              <span className="text-sm font-medium text-slate-700">Usuário ativo</span>
                          </label>
                          <p className="text-[11px] text-slate-400 mt-1">
                              Se desativar, ele perde acesso e deixa de aparecer nas pendências do gestor.
                          </p>
                      </div>
                      <div>
                          <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                  type="checkbox"
                                  checked={userData.requiresTimesheet}
                                  onChange={e => setUserData({...userData, requiresTimesheet: e.target.checked})}
                                  className="rounded text-brand-600"
                              />
                              <span className="text-sm font-medium text-slate-700">Precisa lançar horas</span>
                          </label>
                          <p className="text-[11px] text-slate-400 mt-1">
                              Se desmarcar, não recebe notificações de pendências nem aparece em relatórios de divergência.
                          </p>
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
          </div>
        )}

        {activeTab === 'projects' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                      <h3 className="font-semibold text-slate-600">Trabalhos Cadastrados</h3>
                  </div>
                  <div className="p-4 border-b border-gray-100 bg-white">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                          <div className="md:col-span-2">
                              <label className="block text-xs font-bold text-slate-500 mb-1">Busca rápida</label>
                              <input
                                  type="text"
                                  className="w-full border border-gray-300 p-2 rounded-lg text-sm"
                                  placeholder="Código, nome, tipo, área ou permissão"
                                  value={projectFilterData.search}
                                  onChange={e => setProjectFilterData({ ...projectFilterData, search: e.target.value })}
                              />
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Tipo</label>
                              <select className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={projectFilterData.classification} onChange={e => setProjectFilterData({ ...projectFilterData, classification: e.target.value })}>
                                  <option value="">Todos</option>
                                  <option value="Audit">Auditoria</option>
                                  <option value="Backoffice">Backoffice</option>
                                  <option value="Consulting">Consultoria</option>
                                  <option value="Training">Treinamento</option>
                                  <option value="Vacation">Férias/Ausência</option>
                              </select>
                          </div>
                          <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Área</label>
                              <select className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={projectFilterData.area} onChange={e => setProjectFilterData({ ...projectFilterData, area: e.target.value })}>
                                  <option value="">Todas</option>
                                  <option value="AUDITORIA_INTERNA">Auditoria Interna</option>
                                  <option value="CONTROLES_INTERNOS">Controles Internos</option>
                                  <option value="COMPLIANCE">Compliance</option>
                                  <option value="CANAL_DENUNCIAS">Canal de Denuncias</option>
                                  <option value="GESTAO_RISCOS_DIGITAIS">Gestao de Riscos Digitais</option>
                                  <option value="OUTROS">Outros</option>
                              </select>
                          </div>
                      </div>
                      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Status</label>
                              <select className="w-full md:w-[180px] border border-gray-300 p-2 rounded-lg text-sm" value={projectFilterData.status} onChange={e => setProjectFilterData({ ...projectFilterData, status: e.target.value as 'all' | 'active' | 'inactive' })}>
                                  <option value="all">Todos</option>
                                  <option value="active">Ativos</option>
                                  <option value="inactive">Inativos</option>
                              </select>
                          </div>
                          <div className="flex items-center gap-3">
                              <span className="text-xs text-slate-400">{sortedProjects.length} resultado(s)</span>
                              <button
                                  type="button"
                                  onClick={() => setProjectFilterData({ search: '', classification: '', area: '', status: 'all' })}
                                  className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                              >
                                  Limpar filtros
                              </button>
                          </div>
                      </div>
                  </div>
                  <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                          <thead className="bg-gray-50 font-semibold text-slate-500 border-b border-gray-200">
                              <tr>
                                  <th className="px-6 py-3">
                                      <button type="button" onClick={() => handleProjectSort('project')} className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors">
                                          Projeto
                                          <ProjectSortIcon column="project" />
                                      </button>
                                  </th>
                                  <th className="px-6 py-3">
                                      <button type="button" onClick={() => handleProjectSort('classification')} className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors">
                                          Tipo
                                          <ProjectSortIcon column="classification" />
                                      </button>
                                  </th>
                                  <th className="px-6 py-3">
                                      <button type="button" onClick={() => handleProjectSort('area')} className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors">
                                          Area
                                          <ProjectSortIcon column="area" />
                                      </button>
                                  </th>
                                  <th className="px-6 py-3">
                                      <button type="button" onClick={() => handleProjectSort('budgetedHours')} className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors">
                                          Orçamento
                                          <ProjectSortIcon column="budgetedHours" />
                                      </button>
                                  </th>
                                  <th className="px-6 py-3">
                                      <button type="button" onClick={() => handleProjectSort('permissions')} className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors">
                                          Permissões
                                          <ProjectSortIcon column="permissions" />
                                      </button>
                                  </th>
                                  <th className="px-6 py-3 text-right">Ação</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                              {sortedProjects.map(p => (
                                  <tr key={p.id} className={!p.active ? 'opacity-50 bg-gray-50' : ''}>
                                      <td className="px-6 py-3">
                                          <div className="font-mono text-xs text-slate-400">{p.code}</div>
                                          <div className="font-medium">{p.name}</div>
                                      </td>
                                      <td className="px-6 py-3">{p.classification}</td>
                                      <td className="px-6 py-3">{p.area ? areaLabelMap[p.area] : '-'}</td>
                                      <td className="px-6 py-3">{p.budgetedHours}h
                                          {p.budgetAdjustedAt && (
                                              <div className="text-[11px] text-amber-700 font-medium mt-1">
                                                  Ajustado em {formatTimestamp(p.budgetAdjustedAt)}
                                              </div>
                                          )}
                                      </td>
                                      <td className="px-6 py-3 text-xs text-slate-500 max-w-[150px] truncate">
                                          {!p.allowedManagerIds || p.allowedManagerIds.length === 0 
                                              ? <span className="text-green-600 font-semibold">Todos</span>
                                              : getProjectPermissionsLabel(p)
                                          }
                                      </td>
                                      <td className="px-6 py-3 text-right">
                                          <button onClick={() => handleEditProjectClick(p)} className="text-brand-600 hover:text-brand-800 p-1 rounded hover:bg-brand-50">
                                              <Edit size={16} />
                                          </button>
                                      </td>
                                  </tr>
                              ))}
                              {sortedProjects.length === 0 && (
                                  <tr>
                                      <td colSpan={6} className="p-8 text-center text-slate-400">Nenhum trabalho encontrado para os filtros selecionados.</td>
                                  </tr>
                              )}
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
                              <label className="block text-xs font-bold text-slate-500 mb-1">Area</label>
                              <select className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={projectData.area} onChange={e => setProjectData({...projectData, area: e.target.value as UserArea | ''})}>
                                  <option value="">Sem area</option>
                                  <option value="AUDITORIA_INTERNA">Auditoria Interna</option>
                                  <option value="CONTROLES_INTERNOS">Controles Internos</option>
                                  <option value="COMPLIANCE">Compliance</option>
                                  <option value="CANAL_DENUNCIAS">Canal de Denuncias</option>
                                  <option value="GESTAO_RISCOS_DIGITAIS">Gestao de Riscos Digitais</option>
                                  <option value="OUTROS">Outros</option>
                              </select>
                          </div>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Orçamento (h)</label>
                          <input type="number" className="w-full border border-gray-300 p-2 rounded-lg text-sm" value={projectData.budgetedHours} onChange={e => setProjectData({...projectData, budgetedHours: Number(e.target.value)})} />
                      </div>

                      {editingProject && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
                              <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                      type="checkbox"
                                      checked={projectAdjustmentData.enabled}
                                      onChange={e => setProjectAdjustmentData({
                                          ...projectAdjustmentData,
                                          enabled: e.target.checked,
                                          adjustedHours: e.target.checked ? String(projectData.budgetedHours || 0) : ''
                                      })}
                                      className="rounded text-amber-600"
                                  />
                                  <span className="text-sm font-semibold text-amber-900">Ajustar horas deste trabalho</span>
                              </label>

                              {projectAdjustmentData.enabled && (
                                  <div className="grid grid-cols-1 gap-3">
                                      <div>
                                          <label className="block text-xs font-bold text-slate-600 mb-1">Horas ajustadas</label>
                                          <input
                                              type="number"
                                              min={0}
                                              className="w-full border border-amber-200 p-2 rounded-lg text-sm"
                                              value={projectAdjustmentData.adjustedHours}
                                              onChange={e => setProjectAdjustmentData({ ...projectAdjustmentData, adjustedHours: e.target.value })}
                                              required={projectAdjustmentData.enabled}
                                          />
                                      </div>
                                      <div>
                                          <label className="block text-xs font-bold text-slate-600 mb-1">Justificativa do ajuste</label>
                                          <textarea
                                              className="w-full border border-amber-200 p-2 rounded-lg text-sm min-h-[76px]"
                                              placeholder="Descreva o motivo da alteração de horas"
                                              value={projectAdjustmentData.justification}
                                              onChange={e => setProjectAdjustmentData({ ...projectAdjustmentData, justification: e.target.value })}
                                              required={projectAdjustmentData.enabled}
                                          />
                                      </div>
                                  </div>
                              )}
                          </div>
                      )}
                      
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
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
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
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Busca rápida</label>
                          <input
                              type="text"
                              className="w-full border border-gray-300 p-2 rounded-lg text-sm"
                              placeholder="Usuário, projeto, data ou descrição"
                              value={reportSearchTerm}
                              onChange={e => setReportSearchTerm(e.target.value)}
                          />
                      </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                      <button
                          type="button"
                          onClick={() => {
                              setFilterData({ userId: '', managerId: '', projectId: '', startDate: '', endDate: '' });
                              setReportSearchTerm('');
                          }}
                          className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                      >
                          Limpar filtros
                      </button>
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
                                  <th className="px-6 py-3">
                                      <button type="button" onClick={() => handleReportSort('date')} className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors">
                                          Data
                                          <ReportSortIcon column="date" />
                                      </button>
                                  </th>
                                  <th className="px-6 py-3">
                                      <button type="button" onClick={() => handleReportSort('user')} className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors">
                                          Usuário
                                          <ReportSortIcon column="user" />
                                      </button>
                                  </th>
                                  <th className="px-6 py-3">
                                      <button type="button" onClick={() => handleReportSort('project')} className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors">
                                          Projeto
                                          <ReportSortIcon column="project" />
                                      </button>
                                  </th>
                                  <th className="px-6 py-3">
                                      <button type="button" onClick={() => handleReportSort('description')} className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors">
                                          Descrição
                                          <ReportSortIcon column="description" />
                                      </button>
                                  </th>
                                  <th className="px-6 py-3 text-right">
                                      <button type="button" onClick={() => handleReportSort('hours')} className="inline-flex items-center gap-2 hover:text-slate-700 transition-colors ml-auto">
                                          Horas
                                          <ReportSortIcon column="hours" />
                                      </button>
                                  </th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                              {sortedFilteredEntries.map(e => (
                                  <tr key={e.id} className="hover:bg-slate-50">
                                      <td className="px-6 py-3 whitespace-nowrap">{formatDateForDisplay(e.date)}</td>
                                      <td className="px-6 py-3">{getUserName(e.userId)}</td>
                                      <td className="px-6 py-3">{getProjectName(e.projectId)}</td>
                                      <td className="px-6 py-3 text-slate-500 truncate max-w-xs">{e.description}</td>
                                      <td className="px-6 py-3 text-right font-medium">{e.hours}</td>
                                  </tr>
                              ))}
                              {sortedFilteredEntries.length === 0 && (
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
                                              {formatDateForDisplay(ex.date)}
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
                            <div className="space-y-6">
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-fit">
                                    <h3 className="font-bold text-slate-800 mb-4">Parâmetros de Lançamento</h3>
                                    <p className="text-xs text-slate-500 mb-4">Defina o limite máximo de horas que cada usuário pode lançar por dia.</p>
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">Limite diário de horas</label>
                                            <input
                                                type="number"
                                                min={1}
                                                step={0.1}
                                                className="w-full border border-gray-300 p-2 rounded-lg text-sm"
                                                value={dailyHourLimit}
                                                onChange={(e) => setDailyHourLimit(Number(e.target.value) || 0)}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleSaveDailyHourLimit}
                                            disabled={savingDailyHourLimit}
                                            className="w-full bg-brand-600 text-white p-2 rounded-lg font-bold hover:bg-brand-700 disabled:opacity-60"
                                        >
                                            {savingDailyHourLimit ? 'Salvando...' : 'Salvar limite diário'}
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-fit">
                                    <h3 className="font-bold text-slate-800 mb-4">Tipos de Folga e Férias</h3>
                                    <p className="text-xs text-slate-500 mb-4">
                                        Cadastre novas folgas para aparecerem na agenda dos gestores.
                                    </p>

                                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1 mb-3">
                                        {leaveTypes.map((type) => (
                                            <div key={type.code} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-xs flex items-center justify-between gap-2">
                                                <div>
                                                    <div className="font-semibold text-slate-700">{type.name}</div>
                                                    <div className="text-slate-500">
                                                        {type.code}
                                                        {type.yearlyLimit !== undefined ? ` • limite/ano: ${type.yearlyLimit}` : ''}
                                                        {type.preferredBirthdayMonth ? ' • mês do aniversário' : ''}
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveLeaveType(type.code)}
                                                    className="text-red-500 hover:text-red-700"
                                                    title="Remover tipo"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <input
                                            className="border border-gray-300 rounded-lg p-2 text-xs"
                                            placeholder="Código (ex: ABONO_EQUIPE)"
                                            value={newLeaveType.code}
                                            onChange={(e) => setNewLeaveType((prev) => ({ ...prev, code: e.target.value }))}
                                        />
                                        <input
                                            className="border border-gray-300 rounded-lg p-2 text-xs"
                                            placeholder="Nome"
                                            value={newLeaveType.name}
                                            onChange={(e) => setNewLeaveType((prev) => ({ ...prev, name: e.target.value }))}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <input
                                            type="color"
                                            className="w-full border border-gray-300 rounded-lg p-1 h-9"
                                            value={newLeaveType.color}
                                            onChange={(e) => setNewLeaveType((prev) => ({ ...prev, color: e.target.value }))}
                                        />
                                        <input
                                            type="number"
                                            min={0}
                                            className="border border-gray-300 rounded-lg p-2 text-xs"
                                            placeholder="Limite por ano (opcional)"
                                            value={newLeaveType.yearlyLimit}
                                            onChange={(e) => setNewLeaveType((prev) => ({ ...prev, yearlyLimit: e.target.value }))}
                                        />
                                    </div>
                                    <label className="flex items-center gap-2 text-xs text-slate-600 mt-2">
                                        <input
                                            type="checkbox"
                                            checked={newLeaveType.preferredBirthdayMonth}
                                            onChange={(e) => setNewLeaveType((prev) => ({ ...prev, preferredBirthdayMonth: e.target.checked }))}
                                        />
                                        Usar no mês de aniversário (quando aplicável)
                                    </label>
                                    <div className="grid grid-cols-2 gap-2 mt-3">
                                        <button
                                            type="button"
                                            onClick={handleAddLeaveType}
                                            className="bg-slate-200 text-slate-700 rounded-lg p-2 text-xs font-bold hover:bg-slate-300"
                                        >
                                            Adicionar tipo
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSaveLeaveTypes}
                                            disabled={savingLeaveTypes}
                                            className="bg-brand-600 text-white rounded-lg p-2 text-xs font-bold hover:bg-brand-700 disabled:opacity-60"
                                        >
                                            {savingLeaveTypes ? 'Salvando...' : 'Salvar tipos'}
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-fit">
                                    <h3 className="font-bold text-slate-800 mb-4">Permissões - Matriz de Riscos</h3>
                                    <p className="text-xs text-slate-500 mb-4">
                                        Defina quem pode acessar a Matriz de Riscos e o nivel de permissao.
                                        Administradores sempre possuem permissao de edicao.
                                    </p>

                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                        {users.map((user) => (
                                            <div key={user.id} className="rounded-lg border border-slate-200 p-3 flex items-center gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-slate-800 truncate">{user.name}</p>
                                                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                                                </div>
                                                {user.role === 'ADMIN' ? (
                                                    <span className="text-xs font-bold bg-brand-50 text-brand-700 px-2 py-1 rounded">EDIT (ADMIN)</span>
                                                ) : (
                                                    <select
                                                        className="border border-gray-300 rounded-lg p-2 text-xs"
                                                        value={riskAccessByUser[user.id] || 'NONE'}
                                                        onChange={(e) => setRiskAccessByUser((prev) => ({
                                                            ...prev,
                                                            [user.id]: e.target.value as RiskMatrixAccess
                                                        }))}
                                                    >
                                                        <option value="NONE">Sem acesso</option>
                                                        <option value="READ">Apenas leitura</option>
                                                        <option value="EDIT">Leitura + edicao</option>
                                                    </select>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleSaveRiskAccess}
                                        disabled={savingRiskAccess}
                                        className="mt-4 w-full bg-brand-600 text-white p-2 rounded-lg font-bold hover:bg-brand-700 disabled:opacity-60"
                                    >
                                        {savingRiskAccess ? 'Salvando permissoes...' : 'Salvar permissoes da Matriz'}
                                    </button>
                                </div>

                                {/* bloco de avisos para usuários */}
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-fit">
                                  <h3 className="font-bold text-slate-800 mb-1 flex items-center gap-2">
                                    <Bell size={15} className="text-amber-500" />
                                    Avisos para Usuários
                                  </h3>
                                  <p className="text-xs text-slate-500 mb-4">
                                    Aparecem no painel de cada usuário até a data de expiração.
                                  </p>

                                  {/* lista de avisos ativos */}
                                  <div className="space-y-2 mb-4 max-h-44 overflow-y-auto pr-1">
                                    {notices.length === 0 && (
                                      <p className="text-xs text-slate-400">Nenhum aviso ativo.</p>
                                    )}
                                    {notices.map((notice) => (
                                      <div key={notice.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="font-semibold text-slate-800">{notice.title}</p>
                                          {notice.description && <p className="text-slate-500 mt-0.5">{notice.description}</p>}
                                          <p className="text-slate-400 mt-1">Expira em {notice.expiresAt}</p>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteNotice(notice.id)}
                                          className="text-red-400 hover:text-red-600 shrink-0"
                                          title="Remover aviso"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    ))}
                                  </div>

                                  {/* form novo aviso */}
                                  <div className="space-y-2">
                                    <input
                                      className="w-full border border-gray-300 rounded-lg p-2 text-xs"
                                      placeholder="Título do aviso"
                                      value={newNotice.title}
                                      onChange={(e) => setNewNotice((prev) => ({ ...prev, title: e.target.value }))}
                                    />
                                    <textarea
                                      className="w-full border border-gray-300 rounded-lg p-2 text-xs resize-none"
                                      rows={2}
                                      placeholder="Descrição (opcional)"
                                      value={newNotice.description}
                                      onChange={(e) => setNewNotice((prev) => ({ ...prev, description: e.target.value }))}
                                    />
                                    <div>
                                      <label className="block text-xs font-bold text-slate-500 mb-1">Expirar em</label>
                                      <input
                                        type="date"
                                        className="w-full border border-gray-300 rounded-lg p-2 text-xs"
                                        value={newNotice.expiresAt}
                                        onChange={(e) => setNewNotice((prev) => ({ ...prev, expiresAt: e.target.value }))}
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={handleAddNotice}
                                      disabled={savingNotice}
                                      className="w-full bg-amber-500 hover:bg-amber-600 text-white rounded-lg p-2 text-xs font-bold disabled:opacity-60"
                                    >
                                      {savingNotice ? 'Salvando...' : 'Publicar aviso'}
                                    </button>
                                  </div>
                                </div>

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
    </div>
  );
};
