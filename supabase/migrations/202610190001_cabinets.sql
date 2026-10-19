-- A cabinet is the owner's real-world storage location for medications.
-- Existing medications are preserved in a single default cabinet per owner.

create table public.cabinets (
  id text primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.cabinets add unique (id, owner_id);

alter table public.medications add column cabinet_id text;

insert into public.cabinets (id, owner_id, name)
select 'default-cabinet-' || owner_id::text, owner_id, 'Домашняя аптечка'
from public.medications
group by owner_id
on conflict (id) do nothing;

update public.medications
set cabinet_id = 'default-cabinet-' || owner_id::text
where cabinet_id is null;

alter table public.medications alter column cabinet_id set not null;
alter table public.medications add constraint medications_cabinet_owner_fkey foreign key (cabinet_id, owner_id) references public.cabinets (id, owner_id);

create index cabinets_owner_updated_idx on public.cabinets (owner_id, updated_at);
create index medications_cabinet_updated_idx on public.medications (owner_id, cabinet_id, updated_at);

create trigger cabinets_set_updated_at before update on public.cabinets for each row execute function public.set_updated_at();

alter table public.cabinets enable row level security;
grant select, insert, update on public.cabinets to authenticated;
create policy "Users read own cabinets" on public.cabinets for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Users insert own cabinets" on public.cabinets for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Users update own cabinets" on public.cabinets for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
