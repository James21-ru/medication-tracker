import { createClient } from 'npm:@supabase/supabase-js@2.117.0';

import { createHandler, DEFAULT_FLOW_CONFIG } from './flow.ts';
import { createSupabaseAccounts, createSupabaseAttemptStore } from './supabase-adapters.ts';
import { createTelegramOidc, TELEGRAM_ISSUER } from './telegram-oidc.ts';

// Secrets (set with `supabase secrets set`, never shipped in the app):
//   TELEGRAM_CLIENT_ID      bot ID from @BotFather → Bot Settings → Login Widget
//   TELEGRAM_CLIENT_SECRET  client secret from the same screen
// Settings:
//   TELEGRAM_REDIRECT_URI   this function's /callback URL, also added as an Allowed URL in @BotFather
//   APP_REDIRECT_URIS       comma-separated app return URLs (default lifecare://auth/telegram)
//   TELEGRAM_OIDC_ISSUER    only for local tests against a mock provider

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function buildHandler() {
  const supabaseUrl = requiredEnv('SUPABASE_URL');
  const service = createClient(supabaseUrl, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return createHandler({
    store: createSupabaseAttemptStore(service),
    accounts: createSupabaseAccounts(service),
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
