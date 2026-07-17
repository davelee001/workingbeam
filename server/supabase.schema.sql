create table if not exists public.workingbeam_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workingbeam_state enable row level security;

drop policy if exists "workingbeam_state_service_role_all" on public.workingbeam_state;

create policy "workingbeam_state_service_role_all"
on public.workingbeam_state
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create or replace function public.touch_workingbeam_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workingbeam_state_touch_updated_at on public.workingbeam_state;

create trigger workingbeam_state_touch_updated_at
before update on public.workingbeam_state
for each row
execute function public.touch_workingbeam_state_updated_at();
