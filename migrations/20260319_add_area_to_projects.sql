-- Migration: adiciona area aos trabalhos/projetos
-- Objetivo: permitir relacionar horas orçadas por area na tela de capacity

begin;

alter table public.projects
  add column if not exists area text;

alter table public.projects
  drop constraint if exists projects_area_check;

alter table public.projects
  add constraint projects_area_check
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

commit;