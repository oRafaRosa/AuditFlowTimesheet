-- Migration: cria tabela de agendamento de ferias e folgas por colaborador

begin;

create table if not exists public.team_leave_events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) not null,
  leave_type_code text not null,
  start_date date not null,
  end_date date not null,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone default timezone('utc'::text, now()),
  constraint team_leave_events_date_range_check check (end_date >= start_date)
);

create index if not exists idx_team_leave_events_user_date
  on public.team_leave_events (user_id, start_date, end_date);

commit;
