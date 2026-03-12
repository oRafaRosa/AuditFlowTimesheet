import {
  AchievementDefinition,
  CalendarException,
  EarnedAchievement,
  Holiday,
  TimesheetEntry,
  TimesheetPeriod,
  TimesheetPeriodEvent,
  User,
  UserGamificationProfile,
  UserLoginActivity
} from '../types';
import { formatLocalDate, normalizeDateValue, parseDateOnly } from './date';
import { buildCalendarMaps, isExpectedWorkingDay, listPendingDaysForMonth } from './workCalendar';

const ACHIEVEMENTS: AchievementDefinition[] = [
  { key: 'login_5', title: 'Ritmo em Dia', description: 'Entrou no app por 5 dias úteis seguidos.', tone: 'positive', icon: 'flame' },
  { key: 'login_20', title: 'Presença de Ferro', description: 'Segurou 20 dias úteis seguidos de acesso.', tone: 'positive', icon: 'calendar' },
  { key: 'logging_5', title: 'Lançamento no Capricho', description: 'Lançou horas no próprio dia por 5 dias úteis seguidos.', tone: 'positive', icon: 'clock-3' },
  { key: 'logging_15', title: 'Relógio Suíço', description: 'Manteve 15 dias úteis seguidos com lançamento no dia certo.', tone: 'positive', icon: 'timer' },
  { key: 'detailed_10', title: 'Cronista do Projeto', description: 'Acumulou 10 lançamentos com descrição realmente detalhada.', tone: 'positive', icon: 'scroll-text' },
  { key: 'detailed_30', title: 'Memória Viva', description: 'Chegou a 30 lançamentos com descrição boa de verdade.', tone: 'positive', icon: 'book-text' },
  { key: 'perfect_month', title: 'Mês Perfeito', description: 'Fechou um mês aprovado, sem buracos e sem gambiarra de descrição.', tone: 'positive', icon: 'sparkles' },
  { key: 'timely_manager', title: 'Gestor Relâmpago', description: 'Aprovou pelo menos 3 timesheets em até 2 dias.', tone: 'positive', icon: 'zap' },
  { key: 'strict_manager', title: 'Gestor Exigente', description: 'Já devolveu 3 períodos para ajuste quando precisava.', tone: 'positive', icon: 'shield-alert' },
  { key: 'late_manager', title: 'Deixou Esfriar', description: 'Demorou demais para decidir vários períodos da equipe.', tone: 'negative', icon: 'hourglass' },
  { key: 'lazy_batch', title: 'Preguiçoso do Fechamento', description: 'Empurrou lançamentos demais para o fim do mês.', tone: 'negative', icon: 'bed' },
  { key: 'copy_paste', title: 'Sem Criatividade', description: 'Repetiu descrição demais nos lançamentos.', tone: 'negative', icon: 'copy' }
];

interface StreakStats {
  current: number;
  best: number;
}

const normalizeDescription = (description: string) =>
  description
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const isDetailedDescription = (description: string, repetitionCount: number) => {
  const normalized = normalizeDescription(description);
  const wordCount = normalized.split(' ').filter(Boolean).length;
  return normalized.length >= 24 && wordCount >= 4 && repetitionCount <= 1;
};

const getNextWorkingDay = (
  dateStr: string,
  holidayMap: Record<string, string>,
  offdayMap: Record<string, string>,
  workdayMap: Record<string, string>
) => {
  const cursor = parseDateOnly(dateStr);
  do {
    cursor.setDate(cursor.getDate() + 1);
  } while (!isExpectedWorkingDay(formatLocalDate(cursor), { holidayMap, offdayMap, workdayMap }));

  return formatLocalDate(cursor);
};

const calculateStreaks = (
  dates: string[],
  holidayMap: Record<string, string>,
  offdayMap: Record<string, string>,
  workdayMap: Record<string, string>
): StreakStats => {
  const uniqueSortedDates = Array.from(new Set(dates)).sort();
  if (uniqueSortedDates.length === 0) {
    return { current: 0, best: 0 };
  }

  let best = 1;
  let running = 1;

  for (let index = 1; index < uniqueSortedDates.length; index += 1) {
    const expectedNext = getNextWorkingDay(uniqueSortedDates[index - 1], holidayMap, offdayMap, workdayMap);
    if (uniqueSortedDates[index] === expectedNext) {
      running += 1;
      best = Math.max(best, running);
    } else {
      running = 1;
    }
  }

  const todayStr = formatLocalDate();
  let referenceDay = todayStr;
  if (!isExpectedWorkingDay(referenceDay, { holidayMap, offdayMap, workdayMap })) {
    const cursor = parseDateOnly(referenceDay);
    do {
      cursor.setDate(cursor.getDate() - 1);
      referenceDay = formatLocalDate(cursor);
    } while (!isExpectedWorkingDay(referenceDay, { holidayMap, offdayMap, workdayMap }));
  }

  let current = 0;
  const dateSet = new Set(uniqueSortedDates);
  while (dateSet.has(referenceDay)) {
    current += 1;
    const cursor = parseDateOnly(referenceDay);
    do {
      cursor.setDate(cursor.getDate() - 1);
      referenceDay = formatLocalDate(cursor);
    } while (!isExpectedWorkingDay(referenceDay, { holidayMap, offdayMap, workdayMap }));
  }

  return { current, best };
};

const getCreatedDate = (entry: TimesheetEntry) => normalizeDateValue(entry.createdAt) || entry.date;

const countManagerMetrics = (events: TimesheetPeriodEvent[]) => {
  const submissionsByPeriod = new Map<string, TimesheetPeriodEvent>();
  let timelyApprovals = 0;
  let strictRejections = 0;
  let slowApprovals = 0;

  events
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
    .forEach((event) => {
      if (!event.periodId) return;

      if (event.eventType === 'SUBMITTED') {
        submissionsByPeriod.set(event.periodId, event);
        return;
      }

      if (event.eventType === 'REJECTED') {
        strictRejections += 1;
      }

      if (event.eventType === 'APPROVED') {
        const submitted = submissionsByPeriod.get(event.periodId);
        if (submitted) {
          const elapsedDays = (new Date(event.occurredAt).getTime() - new Date(submitted.occurredAt).getTime()) / (1000 * 60 * 60 * 24);
          if (elapsedDays <= 2) timelyApprovals += 1;
          if (elapsedDays >= 5) slowApprovals += 1;
        }
      }
    });

  return { timelyApprovals, strictRejections, slowApprovals };
};

const detectLazyBatchMonths = (entries: TimesheetEntry[]) => {
  const monthMap = new Map<string, TimesheetEntry[]>();

  entries.forEach((entry) => {
    const key = entry.date.slice(0, 7);
    const list = monthMap.get(key) || [];
    list.push(entry);
    monthMap.set(key, list);
  });

  let lazyMonths = 0;
  monthMap.forEach((monthEntries, key) => {
    if (monthEntries.length < 6) return;
    const [year, month] = key.split('-').map(Number);
    const lastStart = new Date(year, month, 0, 12);
    lastStart.setDate(lastStart.getDate() - 2);
    const lastStartStr = formatLocalDate(lastStart);

    const rushedEntries = monthEntries.filter((entry) => {
      const createdDate = getCreatedDate(entry);
      return createdDate >= lastStartStr || createdDate > entry.date;
    });

    if ((rushedEntries.length / monthEntries.length) >= 0.7) {
      lazyMonths += 1;
    }
  });

  return lazyMonths;
};

const countPerfectMonths = (
  periods: TimesheetPeriod[],
  entries: TimesheetEntry[],
  holidayMap: Record<string, string>,
  offdayMap: Record<string, string>,
  workdayMap: Record<string, string>
) => {
  const approvedPeriods = periods.filter((period) => period.status === 'APPROVED');
  let perfectMonths = 0;

  approvedPeriods.forEach((period) => {
    const periodEntries = entries.filter((entry) => {
      const date = parseDateOnly(entry.date);
      return date.getFullYear() === period.year && date.getMonth() === period.month;
    });

    if (periodEntries.length === 0) return;

    const pendingDays = listPendingDaysForMonth({
      entries: periodEntries,
      year: period.year,
      month: period.month,
      maps: { holidayMap, offdayMap, workdayMap }
    });
    if (pendingDays.length > 0) return;

    const descriptionCounts = periodEntries.reduce<Record<string, number>>((acc, entry) => {
      const key = normalizeDescription(entry.description);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const hasRepeatedDescriptions = periodEntries.some((entry) => {
      const normalized = normalizeDescription(entry.description);
      return descriptionCounts[normalized] > 1;
    });

    const rushedMonths = detectLazyBatchMonths(periodEntries);
    if (!hasRepeatedDescriptions && rushedMonths === 0) {
      perfectMonths += 1;
    }
  });

  return perfectMonths;
};

const buildAchievements = (profile: Omit<UserGamificationProfile, 'achievements' | 'score'>, slowApprovals: number, lazyBatchMonths: number, copyPasteRatio: number) => {
  const earned: EarnedAchievement[] = ACHIEVEMENTS.map((definition) => {
    let match = false;
    let progressText = '';

    switch (definition.key) {
      case 'login_5':
        match = profile.bestLoginStreak >= 5;
        progressText = `${profile.bestLoginStreak}/5 dias úteis`;
        break;
      case 'login_20':
        match = profile.bestLoginStreak >= 20;
        progressText = `${profile.bestLoginStreak}/20 dias úteis`;
        break;
      case 'logging_5':
        match = profile.bestLoggingStreak >= 5;
        progressText = `${profile.bestLoggingStreak}/5 dias úteis`;
        break;
      case 'logging_15':
        match = profile.bestLoggingStreak >= 15;
        progressText = `${profile.bestLoggingStreak}/15 dias úteis`;
        break;
      case 'detailed_10':
        match = profile.detailedDescriptions >= 10;
        progressText = `${profile.detailedDescriptions}/10 lançamentos`;
        break;
      case 'detailed_30':
        match = profile.detailedDescriptions >= 30;
        progressText = `${profile.detailedDescriptions}/30 lançamentos`;
        break;
      case 'perfect_month':
        match = profile.perfectMonths >= 1;
        progressText = `${profile.perfectMonths} mês(es) perfeitos`;
        break;
      case 'timely_manager':
        match = profile.timelyApprovals >= 3;
        progressText = `${profile.timelyApprovals}/3 aprovações rápidas`;
        break;
      case 'strict_manager':
        match = profile.strictRejections >= 3;
        progressText = `${profile.strictRejections}/3 devoluções`;
        break;
      case 'late_manager':
        match = slowApprovals >= 3;
        progressText = `${slowApprovals} decisões demoradas`;
        break;
      case 'lazy_batch':
        match = lazyBatchMonths >= 1;
        progressText = `${lazyBatchMonths} mês(es) correndo no fim`;
        break;
      case 'copy_paste':
        match = copyPasteRatio >= 0.6;
        progressText = `${Math.round(copyPasteRatio * 100)}% das descrições repetidas`;
        break;
      default:
        break;
    }

    return {
      ...definition,
      earned: match,
      progressText
    };
  });

  return earned;
};

const scoreAchievements = (achievements: EarnedAchievement[]) =>
  achievements.reduce((acc, achievement) => {
    if (!achievement.earned) return acc;
    return acc + (achievement.tone === 'negative' ? -8 : 20);
  }, 0);

export const buildGamificationProfiles = ({
  users,
  entries,
  periods,
  loginActivities,
  periodEvents,
  holidays,
  exceptions
}: {
  users: User[];
  entries: TimesheetEntry[];
  periods: TimesheetPeriod[];
  loginActivities: UserLoginActivity[];
  periodEvents: TimesheetPeriodEvent[];
  holidays: Holiday[];
  exceptions: CalendarException[];
}): UserGamificationProfile[] => {
  const maps = buildCalendarMaps(holidays, exceptions);

  return users
    .filter((user) => user.isActive !== false)
    .map((user) => {
      const userEntries = entries.filter((entry) => entry.userId === user.id);
      const userPeriods = periods.filter((period) => period.userId === user.id);
      const userLoginDays = loginActivities
        .filter((activity) => activity.userId === user.id)
        .map((activity) => activity.activityDate);
      const userEvents = periodEvents.filter((event) =>
        event.userId === user.id ||
        event.actorUserId === user.id ||
        event.managerId === user.id
      );

      const descriptionCounts = userEntries.reduce<Record<string, number>>((acc, entry) => {
        const key = normalizeDescription(entry.description);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      const detailedDescriptions = userEntries.filter((entry) =>
        isDetailedDescription(entry.description, descriptionCounts[normalizeDescription(entry.description)] || 0)
      ).length;

      const repeatedDescriptions = Object.entries(descriptionCounts).filter(([, count]) => count > 1);
      const repeatedDescriptionEntries = repeatedDescriptions.reduce((acc, [, count]) => acc + count, 0);
      const copyPasteRatio = userEntries.length > 0 ? repeatedDescriptionEntries / userEntries.length : 0;

      const loginStreakStats = calculateStreaks(userLoginDays, maps.holidayMap, maps.offdayMap, maps.workdayMap);

      const sameDayLoggedDates = userEntries
        .filter((entry) => getCreatedDate(entry) === entry.date)
        .map((entry) => entry.date);
      const loggingStreakStats = calculateStreaks(sameDayLoggedDates, maps.holidayMap, maps.offdayMap, maps.workdayMap);

      const perfectMonths = countPerfectMonths(userPeriods, userEntries, maps.holidayMap, maps.offdayMap, maps.workdayMap);
      const lazyBatchMonths = detectLazyBatchMonths(userEntries);
      const { timelyApprovals, strictRejections, slowApprovals } = countManagerMetrics(
        userEvents.filter((event) => event.managerId === user.id || event.actorUserId === user.id)
      );

      const baseProfile = {
        userId: user.id,
        userName: user.name,
        role: user.role,
        loginStreak: loginStreakStats.current,
        loggingStreak: loggingStreakStats.current,
        bestLoginStreak: loginStreakStats.best,
        bestLoggingStreak: loggingStreakStats.best,
        detailedDescriptions,
        perfectMonths,
        timelyApprovals,
        strictRejections,
        negativeAchievements: 0
      };

      const achievements = buildAchievements(baseProfile, slowApprovals, lazyBatchMonths, copyPasteRatio);
      const negativeAchievements = achievements.filter((achievement) => achievement.earned && achievement.tone === 'negative').length;
      const score = scoreAchievements(achievements)
        + baseProfile.bestLoginStreak
        + baseProfile.bestLoggingStreak
        + (baseProfile.detailedDescriptions * 2)
        + (baseProfile.perfectMonths * 25)
        + (baseProfile.timelyApprovals * 4)
        + (baseProfile.strictRejections * 3)
        - (negativeAchievements * 6);

      return {
        ...baseProfile,
        negativeAchievements,
        achievements,
        score
      };
    })
    .sort((a, b) => b.score - a.score || b.bestLoginStreak - a.bestLoginStreak || b.bestLoggingStreak - a.bestLoggingStreak);
};
