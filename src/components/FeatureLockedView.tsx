import React from 'react';
import { Lock } from 'lucide-react';
import {
  GAMIFICATION_DISABLED_MESSAGE,
  GAMIFICATION_DISABLED_TITLE
} from '../config/features';

interface FeatureLockedViewProps {
  compact?: boolean;
}

export const FeatureLockedView: React.FC<FeatureLockedViewProps> = ({ compact = false }) => {
  if (compact) {
    return (
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="pointer-events-none blur-[2px]">
          <div className="grid grid-cols-3 gap-3 p-5">
            <div className="h-24 rounded-xl border border-amber-100 bg-amber-50" />
            <div className="h-24 rounded-xl border border-brand-100 bg-brand-50" />
            <div className="h-24 rounded-xl border border-emerald-100 bg-emerald-50" />
          </div>
          <div className="px-5 pb-5">
            <div className="h-4 w-40 rounded bg-slate-100" />
            <div className="mt-3 h-24 rounded-xl border border-slate-100 bg-slate-50" />
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center bg-white/65 p-5 text-center backdrop-blur-sm">
          <div className="max-w-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white">
              <Lock size={20} />
            </div>
            <p className="mt-4 text-base font-bold text-slate-900">{GAMIFICATION_DISABLED_TITLE}</p>
            <p className="mt-2 text-xs text-slate-500">{GAMIFICATION_DISABLED_MESSAGE}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="pointer-events-none blur-[4px]">
        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
          <div className="h-32 rounded-2xl border border-slate-100 bg-slate-50" />
          <div className="h-32 rounded-2xl border border-slate-100 bg-slate-50" />
          <div className="h-32 rounded-2xl border border-slate-100 bg-slate-50" />
        </div>
        <div className="grid grid-cols-1 gap-6 px-6 pb-6 xl:grid-cols-3">
          <div className="h-80 rounded-2xl border border-slate-100 bg-slate-50 xl:col-span-2" />
          <div className="space-y-6">
            <div className="h-36 rounded-2xl border border-slate-100 bg-slate-50" />
            <div className="h-36 rounded-2xl border border-slate-100 bg-slate-50" />
          </div>
        </div>
      </div>

      <div className="absolute inset-0 flex items-center justify-center bg-white/70 p-6 text-center backdrop-blur-sm">
        <div className="max-w-md">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm">
            <Lock size={22} />
          </div>
          <p className="mt-4 text-xl font-bold text-slate-900">{GAMIFICATION_DISABLED_TITLE}</p>
          <p className="mt-2 text-sm text-slate-600">Esta visao foi temporariamente bloqueada.</p>
          <p className="mt-3 text-xs text-slate-500">{GAMIFICATION_DISABLED_MESSAGE}</p>
        </div>
      </div>
    </div>
  );
};
