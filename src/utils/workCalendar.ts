import { CalendarException, Holiday, TimesheetEntry, HOURS_PER_DAY } from '../types';
import { formatLocalDate, normalizeDateValue, parseDateOnly } from './date';

export interface PendingDay {
  date: string;
  loggedHours: number;
  missingHours: number;
}

export interface CalendarMaps {
  holidayMap: Record<string, string>;
  offdayMap: Record<string, string>;
  workdayMap: Record<string, string>;
}

export const buildCalendarMaps = (
  holidays: Holiday[],
  exceptions: CalendarException[]
): CalendarMaps => {
  const holidayMap: Record<string, string> = {};
  const offdayMap: Record<string, string> = {};
  const workdayMap: Record<string, string> = {};

  holidays.forEach((holiday) => {
    const normalizedDate = normalizeDateValue(holiday.date);
    if (!normalizedDate) return;
    holidayMap[normalizedDate] = holiday.name;
  });

  exceptions.forEach((exception) => {
    const normalizedDate = normalizeDateValue(exception.date);
    if (!normalizedDate) return;

    if (exception.type === 'WORKDAY') {
      workdayMap[normalizedDate] = exception.name || 'Dia útil extra';
      return;
    }

    offdayMap[normalizedDate] = exception.name || 'Folga/Ponte';
  });

  return { holidayMap, offdayMap, workdayMap };
};

export const isExpectedWorkingDay = (dateStr: string, maps: CalendarMaps): boolean => {
  if (maps.workdayMap[dateStr]) return true;
  if (maps.holidayMap[dateStr] || maps.offdayMap[dateStr]) return false;

  const day = parseDateOnly(dateStr).getDay();
  return day !== 0 && day !== 6;
};

export const listPendingDaysForMonth = ({
  entries,
  year,
  month,
  maps,
  maxDate
}: {
  entries: TimesheetEntry[];
  year: number;
  month: number;
  maps: CalendarMaps;
  maxDate?: string;
}): PendingDay[] => {
  const totalsByDate: Record<string, number> = {};

  entries.forEach((entry) => {
    const entryDate = parseDateOnly(entry.date);
    if (entryDate.getFullYear() !== year || entryDate.getMonth() !== month) return;
    totalsByDate[entry.date] = Math.round(((totalsByDate[entry.date] || 0) + entry.hours) * 100) / 100;
  });

  const pendingDays: PendingDay[] = [];
  const lastDay = new Date(year, month + 1, 0);
  const limitDate = maxDate ? parseDateOnly(maxDate) : lastDay;

  // aqui eu prefiro rodar dia a dia porque fica bem mais fácil de entender depois
  for (let cursor = new Date(year, month, 1, 12); cursor <= lastDay && cursor <= limitDate; cursor.setDate(cursor.getDate() + 1)) {
    const dateStr = formatLocalDate(cursor);
    if (!isExpectedWorkingDay(dateStr, maps)) continue;

    const loggedHours = totalsByDate[dateStr] || 0;
    if (loggedHours >= HOURS_PER_DAY) continue;

    pendingDays.push({
      date: dateStr,
      loggedHours,
      missingHours: Math.round((HOURS_PER_DAY - loggedHours) * 100) / 100
    });
  }

  return pendingDays;
};
