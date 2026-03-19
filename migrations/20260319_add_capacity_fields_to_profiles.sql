-- Migration: campos de capacity no cadastro de usuarios (profiles)
-- Objetivo: habilitar area, data de admissao e data de desligamento

begin;

alter table public.profiles
  add column if not exists area text;

alter table public.profiles
  add column if not exists admission_date date;

alter table public.profiles
  add column if not exists termination_date date;

alter table public.profiles
  alter column area set default 'AUDITORIA_INTERNA';

alter table public.profiles
  alter column admission_date set default date '2020-01-01';

-- Backfill inicial solicitado: preenche somente quem ainda nao tem admissao.
update public.profiles
set admission_date = date '2020-01-01'
where admission_date is null;

-- Backfill de area para manter consistencia dos filtros de capacity.
update public.profiles
set area = 'AUDITORIA_INTERNA'
where area is null;

commit;
