import React, { useEffect, useState } from 'react';
import { store } from '../services/store';
import { CalendarException, Holiday, TimesheetEntry, TimesheetPeriod, TimesheetPeriodEvent, User, UserGamificationProfile, UserLoginActivity } from '../types';
import { Trophy, Flame, ScrollText, ShieldCheck, Loader2, Medal, Crown } from 'lucide-react';
import { buildGamificationProfiles } from '../utils/gamification';

export const AchievementsHub: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<UserGamificationProfile[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserGamificationProfile | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const currentUser = store.getCurrentUser();
      if (!currentUser) return;

      const [users, entries, periods, loginActivities, periodEvents, holidays, exceptions] = await Promise.all([
        store.getUsers(),
        store.getEntries(),
        store.getTimesheetPeriods(),
        store.getLoginActivity(),
        store.getPeriodEvents(),
        store.getHolidays(),
        store.getExceptions()
      ]);

      const gamifiedProfiles = buildGamificationProfiles({
        users,
        entries,
        periods,
        loginActivities,
        periodEvents,
        holidays,
        exceptions
      });

      setProfiles(gamifiedProfiles);
      setCurrentUserProfile(gamifiedProfiles.find((profile) => profile.userId === currentUser.id) || null);
      setLoading(false);
    };

    loadData();
  }, []);

  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-brand-600" size={48} /></div>;
  }

  const loginLeaders = [...profiles].sort((a, b) => b.bestLoginStreak - a.bestLoginStreak).slice(0, 5);
  const loggingLeaders = [...profiles].sort((a, b) => b.bestLoggingStreak - a.bestLoggingStreak).slice(0, 5);
  const currentRank = currentUserProfile ? profiles.findIndex((profile) => profile.userId === currentUserProfile.userId) + 1 : null;
  const earnedAchievements = currentUserProfile?.achievements.filter((achievement) => achievement.earned) || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Ranking & Conquistas</h1>
          <p className="text-slate-500">Uma vitrine leve do que está redondo, consistente e bem feito nos registros.</p>
        </div>
        {currentUserProfile && (
          <div className="rounded-2xl border border-brand-100 bg-brand-50 px-5 py-4">
            <p className="text-xs font-bold uppercase text-brand-700">Sua posição</p>
            <p className="text-2xl font-bold text-brand-900 mt-1">#{currentRank}</p>
            <p className="text-sm text-brand-700 mt-1">{currentUserProfile.score} pontos</p>
          </div>
        )}
      </div>

      {currentUserProfile && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-amber-100 text-amber-700"><Flame size={22} /></div>
              <div>
                <p className="text-sm text-slate-500">Streak de login</p>
                <p className="text-2xl font-bold text-slate-900">{currentUserProfile.loginStreak} dias</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3">Melhor sequência: {currentUserProfile.bestLoginStreak} dias úteis</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-100 text-emerald-700"><Medal size={22} /></div>
              <div>
                <p className="text-sm text-slate-500">Lançando no dia certo</p>
                <p className="text-2xl font-bold text-slate-900">{currentUserProfile.loggingStreak} dias</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3">Melhor sequência: {currentUserProfile.bestLoggingStreak} dias úteis</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-sky-100 text-sky-700"><ScrollText size={22} /></div>
              <div>
                <p className="text-sm text-slate-500">Descrições boas</p>
                <p className="text-2xl font-bold text-slate-900">{currentUserProfile.detailedDescriptions}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3">{currentUserProfile.perfectMonths} mês(es) perfeitos</p>
          </div>
        </div>
      )}

      {currentUserProfile && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-800">Suas conquistas</h2>
            <p className="text-sm text-slate-500 mt-1">Aqui só aparecem as que você já desbloqueou. O resto continua escondido como easter egg.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-5">
            {earnedAchievements.map((achievement) => (
              <div
                key={achievement.key}
                className={`rounded-xl border p-4 ${
                  achievement.tone === 'negative'
                    ? 'border-red-200 bg-red-50'
                    : achievement.tone === 'warning'
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-emerald-200 bg-emerald-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-800">{achievement.title}</p>
                    <p className="text-sm text-slate-600 mt-1">{achievement.description}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold uppercase text-slate-500">Conquistada</span>
                    <p className="text-sm font-bold text-slate-800 mt-2">x{achievement.earnedCount}</p>
                  </div>
                </div>
                {achievement.progressText && (
                  <p className="text-xs text-slate-500 mt-3">{achievement.progressText}</p>
                )}
              </div>
            ))}
            {earnedAchievements.length === 0 && (
              <div className="md:col-span-2 xl:col-span-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Ainda não apareceu nenhuma conquista por aqui. Quando a primeira cair, ela já aparece neste painel.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center gap-2">
            <Trophy className="text-amber-500" size={20} />
            <h2 className="text-lg font-bold text-slate-800">Ranking Geral</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 font-semibold">
                <tr>
                  <th className="px-6 py-3">Posição</th>
                  <th className="px-6 py-3">Pessoa</th>
                  <th className="px-6 py-3">Pontos</th>
                  <th className="px-6 py-3">Streak Login</th>
                  <th className="px-6 py-3">Streak Registros</th>
                  <th className="px-6 py-3">Conquistas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {profiles.map((profile, index) => (
                  <tr key={profile.userId} className={index < 3 ? 'bg-amber-50/40' : 'hover:bg-slate-50'}>
                    <td className="px-6 py-4 font-bold text-slate-800">{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-800">{profile.userName}</div>
                      <div className="text-xs text-slate-400">{profile.role}</div>
                    </td>
                    <td className="px-6 py-4 font-bold text-brand-700">{profile.score}</td>
                    <td className="px-6 py-4">{profile.bestLoginStreak} dias</td>
                    <td className="px-6 py-4">{profile.bestLoggingStreak} dias</td>
                    <td className="px-6 py-4">
                      {profile.achievements.filter((achievement) => achievement.earned).length} desbloqueadas
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Crown className="text-amber-500" size={18} />
              <h3 className="font-bold text-slate-800">Top Login</h3>
            </div>
            <div className="space-y-3">
              {loginLeaders.map((profile, index) => (
                <div key={profile.userId} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800">{index + 1}. {profile.userName}</p>
                    <p className="text-xs text-slate-400">{profile.role}</p>
                  </div>
                  <span className="font-bold text-amber-700">{profile.bestLoginStreak}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="text-brand-600" size={18} />
              <h3 className="font-bold text-slate-800">Top Registro no Dia</h3>
            </div>
            <div className="space-y-3">
              {loggingLeaders.map((profile, index) => (
                <div key={profile.userId} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800">{index + 1}. {profile.userName}</p>
                    <p className="text-xs text-slate-400">{profile.role}</p>
                  </div>
                  <span className="font-bold text-brand-700">{profile.bestLoggingStreak}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
