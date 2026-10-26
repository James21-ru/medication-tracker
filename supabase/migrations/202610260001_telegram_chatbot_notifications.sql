-- Telegram chat-bot delivery state.  This stays outside the public schema:
-- only Edge Functions using a direct database connection may access it.

create table mobile_auth.telegram_notification_subscriptions (
  telegram_user_id bigint primary key,
  chat_id bigint not null unique,
  time_zone text not null default 'Europe/Moscow' check (char_length(time_zone) between 1 and 64),
  dose_reminders boolean not null default true,
  repeated_reminders boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table mobile_auth.telegram_notification_deliveries (
  id bigint generated always as identity primary key,
  telegram_user_id bigint not null references mobile_auth.telegram_notification_subscriptions (telegram_user_id) on delete cascade,
  dose_event_id text not null references public.dose_events (id) on delete cascade,
  kind text not null check (kind in ('dose', 'repeat')),
  telegram_message_id bigint,
  created_at timestamptz not null default now(),
  unique (telegram_user_id, dose_event_id, kind)
);

create index telegram_notification_deliveries_due_idx
  on mobile_auth.telegram_notification_deliveries (dose_event_id, kind, created_at);

create trigger telegram_notification_subscriptions_set_updated_at
  before update on mobile_auth.telegram_notification_subscriptions
  for each row execute function public.set_updated_at();

alter table mobile_auth.telegram_notification_subscriptions enable row level security;
alter table mobile_auth.telegram_notification_deliveries enable row level security;
revoke all on mobile_auth.telegram_notification_subscriptions, mobile_auth.telegram_notification_deliveries from public, anon, authenticated;
