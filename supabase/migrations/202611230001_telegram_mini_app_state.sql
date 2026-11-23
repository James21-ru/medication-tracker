-- The Mini App remains local-first, while this encrypted server-side mirror
-- lets the bot send reminders and reflect actions made in either interface.
create table mobile_auth.telegram_mini_app_states (
  telegram_user_id bigint primary key references mobile_auth.telegram_accounts (telegram_user_id) on delete cascade,
  payload jsonb not null,
  time_zone text not null default 'Europe/Moscow' check (char_length(time_zone) between 1 and 64),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger telegram_mini_app_states_set_updated_at
  before update on mobile_auth.telegram_mini_app_states
  for each row execute function public.set_updated_at();

alter table mobile_auth.telegram_mini_app_states enable row level security;
revoke all on mobile_auth.telegram_mini_app_states from public, anon, authenticated;
