-- One-time state for the Telegram OIDC login handled by the telegram-login Edge Function.
-- Only the service role touches this table: RLS is enabled without policies and
-- client roles have no grants.

create table public.telegram_login_attempts (
  state text primary key,
  app_redirect_uri text not null,
  app_code_challenge text not null,
  telegram_code_verifier text not null,
  nonce text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  -- Set once Telegram calls back; the attempt can complete only once.
  completed_at timestamptz,
  telegram_user_id bigint,
  -- SHA-256 of the one-time code returned to the app, and the Supabase token it unlocks.
  app_code_hash text unique,
  token_hash text,
  consumed_at timestamptz
);

create index telegram_login_attempts_expires_at_idx on public.telegram_login_attempts (expires_at);

alter table public.telegram_login_attempts enable row level security;
revoke all on table public.telegram_login_attempts from anon, authenticated;
