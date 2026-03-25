import React from 'react';
import { Calendar } from 'lucide-react';
import { BirthdayListItem } from '../utils/birthdays';

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

  const Balloon = ({ bodyClass, stringClass }: { bodyClass: string; stringClass: string }) => (
    <span className="inline-flex flex-col items-center justify-start" aria-hidden="true">
      <span className={`inline-block w-2.5 h-3.5 rounded-[999px] ${bodyClass}`} />
      <span className={`inline-block w-1 h-1 -mt-[1px] rotate-45 ${bodyClass}`} />
      <span className={`inline-block w-px h-2 -mt-[1px] ${stringClass}`} />
    </span>
  );

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
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-end gap-1.5" aria-hidden="true">
            <Balloon bodyClass="bg-rose-400" stringClass="bg-rose-300" />
            <Balloon bodyClass="bg-amber-400" stringClass="bg-amber-300" />
            <Balloon bodyClass="bg-brand-500" stringClass="bg-brand-300" />
          </div>
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