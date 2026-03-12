import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { store } from '../services/store';
import { CalendarException, Holiday, TimesheetEntry, TimesheetPeriod, TimesheetPeriodEvent, User, UserGamificationProfile, UserLoginActivity } from '../types';
import { Flame, Medal, Trophy, Loader2, Crown } from 'lucide-react';
import { buildGamificationProfiles } from '../utils/gamification';
import { parseDateOnly } from '../utils/date';

export const GamificationSnapshot: React.FC<{ userId: string }> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserGamificationProfile | null>(null);
  const [previousMonthTopThree, setPreviousMonthTopThree] = useState<UserGamificationProfile[]>([]);
  const [previousMonthLabel, setPreviousMonthLabel] = useState('');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      const [users, entries, periods, loginActivities, periodEvents, holidays, exceptions] = await Promise.all([
        store.getUsers(),
        store.getEntries(),
        store.getTimesheetPeriods(),
        store.getLoginActivity(),
        store.getPeriodEvents(),
        store.getHolidays(),
        store.getExceptions()
      ]);

      const profiles = buildGamificationProfiles({
        users,
        entries,
        periods,
        loginActivities,
        periodEvents,
        holidays,
        exceptions
      });

      const previousMonthDate = new Date();
      previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
      const previousMonthYear = previousMonthDate.getFullYear();
      const previousMonth = previousMonthDate.getMonth();

      const previousMonthProfiles = buildGamificationProfiles({
        users,
        entries: entries.filter((entry) => {
          const date = parseDateOnly(entry.date);
          return date.getFullYear() === previousMonthYear && date.getMonth() === previousMonth;
        }),
        periods: periods.filter((period) => period.year === previousMonthYear && period.month === previousMonth),
        loginActivities: loginActivities.filter((activity) => {
          const date = parseDateOnly(activity.activityDate);
          return date.getFullYear() === previousMonthYear && date.getMonth() === previousMonth;
        }),
        periodEvents: periodEvents.filter((event) => event.year === previousMonthYear && event.month === previousMonth),
        holidays,
        exceptions
      });

      setProfile(profiles.find((item) => item.userId === userId) || null);
      setPreviousMonthTopThree(previousMonthProfiles.slice(0, 3));
      setPreviousMonthLabel(previousMonthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }));
      setLoading(false);
    };

    loadData();
  }, [userId]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5 flex items-center justify-center">
        <Loader2 className="animate-spin text-brand-600" size={20} />
      </div>
    );
  }

  if (!profile) return null;

  const earnedPositive = profile.achievements.filter((achievement) => achievement.earned && achievement.tone !== 'negative').length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-800">Conquistas & Ranking</h3>
          <p className="text-sm text-slate-500 mt-1">Seu app agora também tem fase boa, fase engraçada e recorde pessoal.</p>
        </div>
        <Trophy className="text-amber-500" size={22} />
      </div>

      <div className="grid grid-cols-3 gap-3 mt-5">
        <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
          <div className="flex items-center gap-2 text-amber-700">
            <Flame size={16} />
            <span className="text-xs font-bold uppercase">Login</span>
          </div>
          <p className="text-xl font-bold text-slate-900 mt-2">{profile.loginStreak}</p>
          <p className="text-[11px] text-slate-500">Atual</p>
        </div>
        <div className="rounded-xl bg-brand-50 border border-brand-100 p-3">
          <div className="flex items-center gap-2 text-brand-700">
            <Medal size={16} />
            <span className="text-xs font-bold uppercase">No Dia</span>
          </div>
          <p className="text-xl font-bold text-slate-900 mt-2">{profile.loggingStreak}</p>
          <p className="text-[11px] text-slate-500">Atual</p>
        </div>
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
          <div className="flex items-center gap-2 text-emerald-700">
            <Trophy size={16} />
            <span className="text-xs font-bold uppercase">Boas</span>
          </div>
          <p className="text-xl font-bold text-slate-900 mt-2">{earnedPositive}</p>
          <p className="text-[11px] text-slate-500">Conquistas</p>
        </div>
      </div>

      <Link
        to="/achievements"
        className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
      >
        Ver ranking completo
      </Link>

      {previousMonthTopThree.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center gap-2">
            <Crown className="text-amber-500" size={16} />
            <div>
              <p className="text-xs font-bold uppercase text-slate-500">Pódio do mês anterior</p>
              <p className="text-sm text-slate-600">{previousMonthLabel}</p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {previousMonthTopThree.map((item, index) => (
              <div key={item.userId} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base">{index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}</span>
                  <span className="truncate font-medium text-slate-700">{item.userName}</span>
                </div>
                <span className="text-xs font-semibold text-slate-500">{item.score} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
