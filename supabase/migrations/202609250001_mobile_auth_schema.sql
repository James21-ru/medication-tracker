-- Server-side state for the telegram-login Edge Function, kept in its own schema so it can
-- live next to other apps' tables (the Mini App's project uses `public`) without touching
-- them. The function reaches these tables over a direct Postgres connection (SUPABASE_DB_URL),
-- so it works with the Data API switched off. No client role can reach the schema.

create schema if not exists mobile_auth;
revoke all on schema mobile_auth from public, anon, authenticated;

-- One-time state for a Telegram OIDC login attempt.
create table mobile_auth.login_attempts (
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
  token_hash text
);

create index login_attempts_expires_at_idx on mobile_auth.login_attempts (expires_at);

-- Which Supabase user a Telegram user signs in as.
create table mobile_auth.telegram_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  telegram_user_id bigint not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table mobile_auth.login_attempts enable row level security;
alter table mobile_auth.telegram_accounts enable row level security;
revoke all on all tables in schema mobile_auth from public, anon, authenticated;
