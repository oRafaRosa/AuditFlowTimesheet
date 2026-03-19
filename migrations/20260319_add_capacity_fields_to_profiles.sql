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
  alter column area drop default;

alter table public.profiles
  alter column admission_date set default date '2020-01-01';

alter table public.profiles
  drop constraint if exists profiles_area_check;

alter table public.profiles
  add constraint profiles_area_check
  check (
    area is null
    or area in (
      'AUDITORIA_INTERNA',
      'CONTROLES_INTERNOS',
      'COMPLIANCE',
      'CANAL_DENUNCIAS',
      'GESTAO_RISCOS_DIGITAIS',
      'OUTROS'
    )
  );

-- Backfill inicial solicitado: preenche somente quem ainda nao tem admissao.
update public.profiles
set admission_date = date '2020-01-01'
where admission_date is null;

commit;
