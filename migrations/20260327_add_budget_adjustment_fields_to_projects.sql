-- Migration: adiciona metadados de ajuste de horas nos trabalhos
-- Objetivo: registrar justificativa e data do ultimo ajuste no projeto
-- e manter histórico auditável de todas as mudanças de orçamento

begin;

alter table public.projects
  add column if not exists budget_adjustment_justification text;

alter table public.projects
  add column if not exists budget_adjusted_at timestamptz;

create table if not exists public.project_budget_adjustments (
  id uuid default gen_random_uuid() primary key,
  project_id uuid not null references public.projects(id),
  old_budgeted_hours numeric not null,
  new_budgeted_hours numeric not null,
  delta_hours numeric not null,
  justification text,
  adjusted_by uuid references public.profiles(id),
  adjusted_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_project_budget_adjustments_project_date
  on public.project_budget_adjustments (project_id, adjusted_at desc);

commit;
