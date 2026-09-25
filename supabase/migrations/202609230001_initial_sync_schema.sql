-- Cloud backup and sync schema. Device IDs stay TEXT to preserve existing SQLite IDs.
-- Every user-owned record is isolated by owner_id through RLS.

create table public.lifecare_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  telegram_user_id bigint unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.medications (
  id text primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  form text not null,
  amount text not null,
  unit text not null,
  color text not null,
  barcode text,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.medications add unique (id, owner_id);

create table public.medication_packages (
  id text primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  medication_id text not null,
  quantity_initial numeric not null check (quantity_initial >= 0),
  quantity_remaining numeric not null check (quantity_remaining >= 0),
  unit text not null,
  expires_on date,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.medication_packages add constraint packages_medication_owner_fkey foreign key (medication_id, owner_id) references public.medications (id, owner_id);

create table public.medication_schedules (
  id text primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  medication_id text not null,
  kind text not null,
  weekdays_json jsonb not null,
  scheduled_time time not null,
  dose_quantity numeric not null check (dose_quantity > 0),
  dose_unit text not null,
  start_on date not null,
  end_on date,
  interval_days integer not null default 1 check (interval_days > 0),
  cycle_on_days integer not null default 1 check (cycle_on_days > 0),
  cycle_off_days integer not null default 0 check (cycle_off_days >= 0),
  active boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (end_on is null or end_on >= start_on)
);

alter table public.medication_schedules add unique (id, owner_id);
alter table public.medication_schedules add constraint schedules_medication_owner_fkey foreign key (medication_id, owner_id) references public.medications (id, owner_id);

create table public.dose_events (
  id text primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  schedule_id text,
  medication_id text not null,
  scheduled_on date not null,
  scheduled_time time not null,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  status text not null check (status in ('pending', 'taken', 'skipped')),
  source text not null check (source in ('schedule', 'manual')),
  completed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.dose_events add constraint dose_events_schedule_owner_fkey foreign key (schedule_id, owner_id) references public.medication_schedules (id, owner_id);
alter table public.dose_events add constraint dose_events_medication_owner_fkey foreign key (medication_id, owner_id) references public.medications (id, owner_id);

create table public.notification_settings (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  dose_reminders boolean not null default false,
  repeated_reminders boolean not null default false,
  time_zone_aware boolean not null default true,
  updated_at timestamptz not null default now()
);

create index medications_owner_updated_idx on public.medications (owner_id, updated_at);
create index packages_owner_updated_idx on public.medication_packages (owner_id, updated_at);
create index schedules_owner_updated_idx on public.medication_schedules (owner_id, updated_at);
create index dose_events_owner_updated_idx on public.dose_events (owner_id, updated_at);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger lifecare_profiles_set_updated_at before update on public.lifecare_profiles for each row execute function public.set_updated_at();
create trigger medications_set_updated_at before update on public.medications for each row execute function public.set_updated_at();
create trigger packages_set_updated_at before update on public.medication_packages for each row execute function public.set_updated_at();
create trigger schedules_set_updated_at before update on public.medication_schedules for each row execute function public.set_updated_at();
create trigger dose_events_set_updated_at before update on public.dose_events for each row execute function public.set_updated_at();
create trigger notification_settings_set_updated_at before update on public.notification_settings for each row execute function public.set_updated_at();

alter table public.lifecare_profiles enable row level security;
alter table public.medications enable row level security;
alter table public.medication_packages enable row level security;
alter table public.medication_schedules enable row level security;
alter table public.dose_events enable row level security;
alter table public.notification_settings enable row level security;

revoke all on public.lifecare_profiles, public.medications, public.medication_packages, public.medication_schedules, public.dose_events, public.notification_settings from anon;
grant select, insert, update on public.lifecare_profiles, public.medications, public.medication_packages, public.medication_schedules, public.dose_events, public.notification_settings to authenticated;

create policy "Users manage their own profile" on public.lifecare_profiles for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Users read own medications" on public.medications for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Users insert own medications" on public.medications for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Users update own medications" on public.medications for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Users read own packages" on public.medication_packages for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Users insert own packages" on public.medication_packages for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Users update own packages" on public.medication_packages for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Users read own schedules" on public.medication_schedules for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Users insert own schedules" on public.medication_schedules for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Users update own schedules" on public.medication_schedules for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Users read own dose events" on public.dose_events for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Users insert own dose events" on public.dose_events for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Users update own dose events" on public.dose_events for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Users manage own notification settings" on public.notification_settings for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
