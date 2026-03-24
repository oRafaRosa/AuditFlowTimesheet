import React from 'react';

interface DashboardLoadingStateProps {
  title?: string;
  subtitle?: string;
}

export const DashboardLoadingState: React.FC<DashboardLoadingStateProps> = ({
  title = 'Preparando dashboard',
  subtitle = 'Carregando indicadores e organizando sua visao...'
}) => {
  return (
    <div className="min-h-[70vh] w-full">
      <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="h-5 w-40 animate-pulse rounded-md bg-slate-200" />
            <div className="mt-2 h-3 w-64 animate-pulse rounded-md bg-slate-100" />
          </div>
          <div className="h-9 w-24 animate-pulse rounded-lg bg-slate-100" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="rounded-xl border border-slate-100 bg-slate-50/80 p-5">
              <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
              <div className="mt-3 h-7 w-20 animate-pulse rounded bg-slate-300" />
              <div className="mt-4 h-2 w-full animate-pulse rounded-full bg-slate-200" />
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/70 p-5">
          <div className="h-4 w-44 animate-pulse rounded bg-slate-200" />
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-14 animate-pulse rounded-lg bg-white" />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center gap-3 text-slate-500">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
        <div>
          <p className="text-sm font-semibold text-slate-700">{title}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
    </div>
  );
};