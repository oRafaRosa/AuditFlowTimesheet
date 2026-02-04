
// utilzinha pra formatar horas com arredondamento ok
export const formatHours = (hours: number, decimals: number = 1): string => {
  return hours.toFixed(decimals);
};

// utilzinha pra formatar percentual
export const formatPercentage = (value: number): string => {
  return Math.round(value).toString();
};

export type Role = 'ADMIN' | 'MANAGER' | 'USER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  managerId?: string; // id do gestor
  delegatedManagerId?: string; // id do gestor temporário
  avatarUrl?: string;
  isDefaultPassword?: boolean; // flag pra forçar troca de senha
}

export interface Project {
  id: string;
  name: string;
  code: string;
  classification: 'Backoffice' | 'Audit' | 'Consulting' | 'Training' | 'Vacation';
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

export const HOURS_PER_DAY = 8.8; // 8h48m = 8.8 horas

// interfaces de mock
export interface KPI {
  label: string;
  value: string | number;
  change?: string;
  status: 'positive' | 'negative' | 'neutral';
}