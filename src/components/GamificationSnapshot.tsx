import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { store } from '../services/store';
import { CalendarException, Holiday, TimesheetEntry, TimesheetPeriod, TimesheetPeriodEvent, User, UserGamificationProfile, UserLoginActivity } from '../types';
import { Flame, Medal, Trophy, Loader2 } from 'lucide-react';
import { buildGamificationProfiles } from '../utils/gamification';

export const GamificationSnapshot: React.FC<{ userId: string }> = ({ userId }) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserGamificationProfile | null>(null);

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

      setProfile(profiles.find((item) => item.userId === userId) || null);
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
    </div>
  );
};
