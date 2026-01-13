
// Utility function to format hours with proper rounding
export const formatHours = (hours: number, decimals: number = 1): string => {
  return hours.toFixed(decimals);
};

// Utility function to format percentage
export const formatPercentage = (value: number): string => {
  return Math.round(value).toString();
};

export type Role = 'ADMIN' | 'MANAGER' | 'USER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  managerId?: string; // ID of the manager
  avatarUrl?: string;
  isDefaultPassword?: boolean; // Flag to force password change
}

export interface Project {
  id: string;
  name: string;
  code: string;
  classification: 'Backoffice' | 'Audit' | 'Consulting' | 'Training' | 'Vacation';
  budgetedHours: number;
  active: boolean;
  allowedManagerIds?: string[]; // List of manager IDs whose teams can see this project
}

export interface TimesheetEntry {
  id: string;
  userId: string;
  projectId: string;
  date: string; // ISO Date YYYY-MM-DD
  hours: number;
  description: string;
  createdAt: string;
}

export type PeriodStatus = 'OPEN' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface TimesheetPeriod {
  id: string;
  userId: string;
  year: number;
  month: number; // 0-11 to match JS Date
  status: PeriodStatus;
  managerId?: string;
  rejectionReason?: string;
  updatedAt: string;
  userName?: string; // Propriedade opcional para exibição em listas
}

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

export interface CalendarException {
  id: string;
  date: string;
  type: 'OFFDAY' | 'WORKDAY'; // OFFDAY = Company Holiday/Bridge, WORKDAY = Extra working day (e.g. Saturday)
  name: string;
}

export const HOURS_PER_DAY = 8.8; // 8h 48m = 8.8 hours

// Mock Data Interfaces
export interface KPI {
  label: string;
  value: string | number;
  change?: string;
  status: 'positive' | 'negative' | 'neutral';
}