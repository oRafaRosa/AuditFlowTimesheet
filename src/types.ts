
// utilzinha pra formatar horas com arredondamento ok
export const formatHours = (hours: number, decimals: number = 1): string => {
  return hours.toFixed(decimals);
};

// evita acúmulo de erro de ponto flutuante em somas de horas (ex: 8.800000002)
export const roundHours = (h: number): number => Math.round(h * 100) / 100;

// utilzinha pra formatar percentual
export const formatPercentage = (value: number): string => {
  return Math.round(value).toString();
};

export type Role = 'ADMIN' | 'MANAGER' | 'USER';

export type UserArea =
  | 'AUDITORIA_INTERNA'
  | 'CONTROLES_INTERNOS'
  | 'COMPLIANCE'
  | 'CANAL_DENUNCIAS'
  | 'GESTAO_RISCOS_DIGITAIS'
  | 'OUTROS';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  area?: UserArea;
  admissionDate?: string; // yyyy-mm-dd
  terminationDate?: string; // yyyy-mm-dd (vazio quando ativo)
  isActive?: boolean;
  managerId?: string; // id do gestor
  delegatedManagerId?: string; // id do gestor temporário
  avatarUrl?: string;
  isDefaultPassword?: boolean; // flag pra forçar troca de senha
  requiresTimesheet?: boolean; // se false, não precisa lançar horas (não recebe alertas nem aparece em pendências)
}

export interface Project {
  id: string;
  name: string;
  code: string;
  classification: 'Backoffice' | 'Audit' | 'Consulting' | 'Training' | 'Vacation';
  area?: UserArea;
  budgetedHours: number;
  active: boolean;
  allowedManagerIds?: string[]; // lista de ids dos gestores que podem ver esse projeto
}

export interface TimesheetEntry {
  id: string;
  userId: string;
  projectId: string;
  date: string; // work_date (yyyy-mm-dd)
  hours: number;
  description: string;
  createdAt: string;
}

export type PeriodStatus = 'OPEN' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface TimesheetPeriod {
  id: string;
  userId: string;
  year: number;
  month: number; // 0-11 pra bater com o js date
  status: PeriodStatus;
  managerId?: string;
  rejectionReason?: string;
  updatedAt: string;
  userName?: string; // opcional pra exibir em listas
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export interface CalendarException {
  id: string;
  date: string;
  type: 'OFFDAY' | 'WORKDAY'; // offday = folga/ponte, workday = dia extra (tipo sábado)
  name: string;
}

export interface FrequentEntryTemplate {
  id: string;
  userId: string;
  projectId: string;
  hours: number;
  description: string;
  label: string;
  usageCount: number;
  lastUsedAt: string;
}

export interface UserLoginActivity {
  userId: string;
  activityDate: string;
  createdAt: string;
}

export type UserActivityType = 'REPORT_VIEW' | 'DASHBOARD_VIEW' | 'HELP_CENTER_VIEW';

export interface UserActivityEvent {
  userId: string;
  activityType: UserActivityType;
  activityDate: string;
  createdAt: string;
}

export type PeriodEventType = 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface TimesheetPeriodEvent {
  id: string;
  periodId?: string;
  userId: string;
  managerId?: string;
  actorUserId?: string;
  year: number;
  month: number;
  eventType: PeriodEventType;
  occurredAt: string;
}

export type AchievementTone = 'positive' | 'warning' | 'negative';

export interface AchievementDefinition {
  key: string;
  title: string;
  description: string;
  tone: AchievementTone;
  icon: string;
}

export interface EarnedAchievement extends AchievementDefinition {
  earned: boolean;
  earnedCount: number;
  progressText?: string;
}

export interface UserGamificationProfile {
  userId: string;
  userName: string;
  role: Role;
  loginStreak: number;
  loggingStreak: number;
  bestLoginStreak: number;
  bestLoggingStreak: number;
  detailedDescriptions: number;
  perfectMonths: number;
  specialWorkDays: number;
  saturdayWorkDays: number;
  sundayWorkDays: number;
  specialWorkStreak: number;
  reportViewDays: number;
  dashboardViewDays: number;
  helpCenterViewDays: number;
  reportDashboardComboDays: number;
  sniperClosures: number;
  almostPerfectMonths: number;
  managerReviewApprovals: number;
  reportNoNeedDays: number;
  controlAbsoluteStreak: number;
  timelySubmissions: number;
  quickRecoveries: number;
  timelyApprovals: number;
  strictRejections: number;
  negativeAchievements: number;
  achievements: EarnedAchievement[];
  score: number;
}

export const HOURS_PER_DAY = 8.8; // 8h48m = 8.8 horas

// interfaces de mock
export interface KPI {
  label: string;
  value: string | number;
  change?: string;
  status: 'positive' | 'negative' | 'neutral';
}
