/**
 * Walks the real Telegram login once, end to end, without the app: PKCE, Telegram's page in your
 * browser, the one-time code, and a Supabase session from verifyOtp. Use it with a test bot and a
 * test Telegram account. It needs only public values:
 *
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=<publishable or anon key> \
 *     deno run --allow-net --allow-env supabase/functions/tests/manual/telegram-login-check.ts
 *
 * The function must allow the local return URL while you test:
 *   APP_REDIRECT_URIS=lifecare://auth/telegram,http://127.0.0.1:8765/callback
 */
import { createClient } from 'npm:@supabase/supabase-js@2.117.0';

import { randomToken, sha256Base64Url } from '../../telegram-login/crypto.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const PUBLISHABLE_KEY = Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
if (!SUPABASE_URL || !PUBLISHABLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
  Deno.exit(2);
}

const PORT = Number(Deno.env.get('CALLBACK_PORT') ?? '8765');
const redirectUri = `http://127.0.0.1:${PORT}/callback`;
const functionUrl = `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/telegram-login`;
const verifier = randomToken();
const startUrl = `${functionUrl}/start?${new URLSearchParams({
  redirect_uri: redirectUri,
  code_challenge: await sha256Base64Url(verifier),
  code_challenge_method: 'S256',
})}`;

const result = Promise.withResolvers<{ code?: string; error?: string }>();
const server = Deno.serve({ hostname: '127.0.0.1', port: PORT, onListen: () => {} }, (request) => {
  const url = new URL(request.url);
  if (url.pathname !== '/callback') return new Response('not found', { status: 404 });
  result.resolve({ code: url.searchParams.get('code') ?? undefined, error: url.searchParams.get('error') ?? undefined });
  return new Response('<meta charset="utf-8"><p>Готово, окно можно закрыть и вернуться в терминал.</p>', {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
});

console.log(`Open this URL in a browser and sign in with the TEST Telegram account:\n\n${startUrl}\n`);
const timeout = setTimeout(() => result.resolve({ error: 'timeout (5 minutes)' }), 5 * 60 * 1000);
const callback = await result.promise;
clearTimeout(timeout);
await server.shutdown();

if (!callback.code) {
  console.error(`Login did not complete: ${callback.error ?? 'no code'}`);
  Deno.exit(1);
}

const response = await fetch(`${functionUrl}/session`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: callback.code, code_verifier: verifier }),
});
const body = await response.json();
if (!response.ok || typeof body.token_hash !== 'string') {
  console.error(`Code exchange failed (${response.status}): ${JSON.stringify(body)}`);
  Deno.exit(1);
}

const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await client.auth.verifyOtp({ token_hash: body.token_hash, type: 'email' });
if (error || !data.user || !data.session) {
  console.error(`verifyOtp failed: ${error?.message ?? 'no session'}`);
  Deno.exit(1);
}
console.log('Signed in.');
console.log(`  user id:       ${data.user.id}`);
console.log(`  email:         ${data.user.email}`);
console.log(`  telegram id:   ${data.user.user_metadata.telegram_id}`);
console.log(`  name:          ${data.user.user_metadata.full_name}`);
await client.auth.signOut();
console.log('Session signed out again.');
