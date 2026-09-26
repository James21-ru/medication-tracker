import { createClient } from 'npm:@supabase/supabase-js@2.117.0';
import postgres from 'npm:postgres@3.4.9';

import { createHandler, DEFAULT_FLOW_CONFIG } from './flow.ts';
import { createPostgresAttemptStore, createSupabaseAccounts } from './supabase-adapters.ts';
import { createTelegramOidc, TELEGRAM_ISSUER } from './telegram-oidc.ts';

// Provided by Supabase to every Edge Function:
//   SUPABASE_URL, SUPABASE_DB_URL, and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEYS
// Secrets (set with `supabase secrets set`, never shipped in the app):
//   TELEGRAM_CLIENT_ID      bot ID from @BotFather → Bot Settings → Login Widget
//   TELEGRAM_CLIENT_SECRET  client secret from the same screen
// Settings:
//   TELEGRAM_REDIRECT_URI   this function's /callback URL, also added as an Allowed URL in @BotFather
//   APP_REDIRECT_URIS       comma-separated app return URLs (default lifecare://auth/telegram)
//   TELEGRAM_OIDC_ISSUER    only for local tests against a mock provider
//
// The function uses the Auth API (/auth/v1) and a direct Postgres connection, never the Data API
// (/rest/v1, /graphql/v1), so it works in projects where the Data API is switched off.

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

/** The legacy service_role key, or the default key from the newer secret-keys dictionary. */
function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  const key = keys.default ?? Object.values(keys)[0];
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEYS is not configured');
  return key;
}

function buildHandler() {
  const supabaseUrl = requiredEnv('SUPABASE_URL');
  const service = createClient(supabaseUrl, serviceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // prepare: false keeps the connection usable through Supabase's transaction pooler.
  const sql = postgres(requiredEnv('SUPABASE_DB_URL'), { prepare: false, max: 1, idle_timeout: 20 });
  return createHandler({
    store: createPostgresAttemptStore(sql),
    accounts: createSupabaseAccounts(service, sql),
    oidc: createTelegramOidc({
      issuer: Deno.env.get('TELEGRAM_OIDC_ISSUER') ?? TELEGRAM_ISSUER,
      clientId: requiredEnv('TELEGRAM_CLIENT_ID'),
      clientSecret: requiredEnv('TELEGRAM_CLIENT_SECRET'),
      redirectUri: Deno.env.get('TELEGRAM_REDIRECT_URI') ?? `${supabaseUrl}/functions/v1/telegram-login/callback`,
    }),
    config: {
      ...DEFAULT_FLOW_CONFIG,
      allowedAppRedirectUris: (Deno.env.get('APP_REDIRECT_URIS') ?? 'lifecare://auth/telegram')
        .split(',')
        .map((uri) => uri.trim())
        .filter(Boolean),
    },
  });
}

let handler: ((request: Request) => Promise<Response>) | null = null;

Deno.serve((request) => {
  try {
    handler ??= buildHandler();
  } catch (error) {
    console.error(`[telegram-login] ${error instanceof Error ? error.message : String(error)}`);
    return new Response('Вход через Telegram пока не настроен.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  return handler(request);
});
