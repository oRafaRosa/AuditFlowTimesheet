import React from 'react';
import { Calendar } from 'lucide-react';
import { BirthdayListItem } from '../utils/birthdays';
import { BirthdayBalloons } from './BirthdayBalloons';

interface BirthdaySidebarCardProps {
  monthlyBirthdays: BirthdayListItem[];
  upcomingBirthdays: BirthdayListItem[];
  title?: string;
  subtitle?: string;
  showBirthdayBalloons?: boolean;
}

export const BirthdaySidebarCard: React.FC<BirthdaySidebarCardProps> = ({
  monthlyBirthdays,
  upcomingBirthdays,
  title = 'Aniversariantes do Mês',
  subtitle = 'Resumo rápido do mês',
  showBirthdayBalloons = false
}) => {
  const previousInMonth = monthlyBirthdays.filter((person) => person.daysUntil < 0 && !person.isToday);
  const upcomingInMonth = monthlyBirthdays.filter((person) => person.daysUntil >= 0 || person.isToday);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2 relative">
        <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
          <Calendar size={16} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          <p className="text-[11px] text-slate-500">{subtitle}</p>
        </div>

        {showBirthdayBalloons && (
          <BirthdayBalloons className="pointer-events-none absolute right-3 top-1/2 h-10 w-16 -translate-y-1/2" />
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Anteriores</p>
          {previousInMonth.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {previousInMonth.slice(0, 4).map((person) => (
                <div key={person.id} className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="truncate">{person.name}</span>
                  <span className="whitespace-nowrap">{person.dateLabel}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">Sem registros.</p>
          )}
        </div>

        <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-brand-700">Do mês</p>
          {upcomingInMonth.length > 0 ? (
            <div className="mt-2 space-y-2">
              {upcomingInMonth.slice(0, 4).map((person) => (
                <div key={person.id} className="rounded-md border border-brand-100 bg-white px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-slate-800">{person.name}</span>
                    <span className={`text-[11px] font-bold whitespace-nowrap ${person.isToday ? 'text-rose-600' : 'text-brand-700'}`}>
                      {person.isToday ? 'Hoje' : person.dateLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{person.area ? person.area.replace(/_/g, ' ') : 'Área não informada'}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">Sem próximos neste mês.</p>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Próximos</p>
          {upcomingBirthdays.length > 0 ? (
            <div className="mt-2 space-y-1.5">
              {upcomingBirthdays.slice(0, 3).map((person) => (
                <div key={person.id} className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="truncate">{person.name}</span>
                  <span className="whitespace-nowrap">{person.dateLabel}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-slate-500">Sem próximos aniversários.</p>
          )}
        </div>
      </div>
    </div>
  );
};
