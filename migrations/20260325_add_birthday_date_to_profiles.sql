-- Migration: adiciona data de aniversario na tabela de usuarios (profiles)

begin;

alter table public.profiles
  add column if not exists birthday_date date;

commit;
