import { User } from '../types';

export interface BirthdayListItem {
  id: string;
  name: string;
  area?: string;
  month: number;
  day: number;
  dateLabel: string;
  isToday: boolean;
  daysUntil: number;
}

const getBirthdayOccurrence = (birthdayDate: string, year: number) => {
  const [rawYear, rawMonth, rawDay] = birthdayDate.split('-').map(Number);
  const month = (rawMonth || 1) - 1;
  const maxDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(rawDay || 1, maxDay);

  return new Date(year, month, day, 12, 0, 0, 0);
};

const getDaysUntil = (target: Date, reference: Date) => {
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Math.round((target.getTime() - reference.getTime()) / oneDayMs);
};

const toBirthdayListItem = (user: User, occurrence: Date, referenceDate: Date): BirthdayListItem => ({
  id: user.id,
  name: user.name,
  area: user.area,
  month: occurrence.getMonth(),
  day: occurrence.getDate(),
  dateLabel: occurrence.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
  isToday: getDaysUntil(occurrence, referenceDate) === 0,
  daysUntil: getDaysUntil(occurrence, referenceDate)
});

export const getMonthlyBirthdays = (users: User[], referenceDate = new Date()): BirthdayListItem[] => {
  const normalizedReference = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 12, 0, 0, 0);
  const currentMonth = normalizedReference.getMonth();

  return users
    .filter((user) => user.isActive !== false && !!user.birthdayDate)
    .map((user) => toBirthdayListItem(user, getBirthdayOccurrence(user.birthdayDate as string, normalizedReference.getFullYear()), normalizedReference))
    .filter((item) => item.month === currentMonth)
    .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
};

export const getUpcomingBirthdays = (users: User[], limit = 3, referenceDate = new Date()): BirthdayListItem[] => {
  const normalizedReference = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 12, 0, 0, 0);

  return users
    .filter((user) => user.isActive !== false && !!user.birthdayDate)
    .map((user) => {
      const thisYearOccurrence = getBirthdayOccurrence(user.birthdayDate as string, normalizedReference.getFullYear());
      const nextOccurrence = getDaysUntil(thisYearOccurrence, normalizedReference) >= 0
        ? thisYearOccurrence
        : getBirthdayOccurrence(user.birthdayDate as string, normalizedReference.getFullYear() + 1);

      return toBirthdayListItem(user, nextOccurrence, normalizedReference);
    })
    .filter((item) => item.daysUntil > 0)
    .sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name))
    .slice(0, limit);
};