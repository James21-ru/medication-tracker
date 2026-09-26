/**
 * End-to-end check of the telegram-login function against a local Supabase stack and
 * mock-telegram-oidc.ts. It walks the same steps as the iOS app. See docs/telegram-login.md.
 */
import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { createClient } from 'npm:@supabase/supabase-js@2.117.0';
import postgres from 'npm:postgres@3.4.9';

import { randomToken, sha256Base64Url } from '../../telegram-login/crypto.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'http://127.0.0.1:55421';
const ANON_KEY = Deno.env.get('ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;
const DB_URL = Deno.env.get('DB_URL') ?? 'postgresql://postgres:postgres@127.0.0.1:55422/postgres';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/telegram-login`;
const APP_REDIRECT = 'lifecare://auth/telegram';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// Direct database access: the stack runs without the Data API, like the Mini App's project.
async function query<T>(run: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(DB_URL, { max: 1 });
  try {
    return await run(sql);
  } finally {
    await sql.end();
  }
}

function appClient() {
  return createClient(SUPABASE_URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function follow(url: string): Promise<string> {
  const response = await fetch(url, { redirect: 'manual' });
  await response.body?.cancel();
  assertEquals(response.status, 302, `${url} → ${response.status}`);
  return response.headers.get('location')!;
}

/** What ASWebAuthenticationSession does: follow redirects until the app scheme comes back. */
async function browserLogin(telegramFlags: Record<string, string>, redirectUri = APP_REDIRECT) {
  const verifier = randomToken();
  const start = `${FUNCTION_URL}/start?${new URLSearchParams({
    redirect_uri: redirectUri,
    code_challenge: await sha256Base64Url(verifier),
    code_challenge_method: 'S256',
  })}`;
  const telegramAuth = new URL((await follow(start)).replace('host.docker.internal', '127.0.0.1'));
  for (const [key, value] of Object.entries(telegramFlags)) telegramAuth.searchParams.set(key, value);
  const callback = await follow(telegramAuth.toString());
  assert(callback.startsWith(`${FUNCTION_URL}/callback?`), callback);
  const appUrl = await follow(callback);
  assert(appUrl.startsWith(`${APP_REDIRECT}?`), appUrl);
  return { params: new URL(appUrl).searchParams, verifier };
}

async function exchange(code: string, verifier: string) {
  const response = await fetch(`${FUNCTION_URL}/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier }),
  });
  return { status: response.status, body: await response.json() };
}

async function signIn(telegramUserId: number) {
  const { params, verifier } = await browserLogin({ test_user: String(telegramUserId) });
  const code = params.get('code');
  assert(code, `no code: ${params}`);
  const { status, body } = await exchange(code, verifier);
  assertEquals(status, 200, JSON.stringify(body));
  const client = appClient();
  const { data, error } = await client.auth.verifyOtp({ token_hash: body.token_hash, type: body.type });
  assertEquals(error, null);
  assert(data.session && data.user);
  return { client, session: data.session, user: data.user };
}

async function usersWithEmail(email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  assertEquals(error, null);
  return data.users.filter((user) => user.email === email);
}

const run = Date.now() % 1_000_000_000;
const newUserId = 7_000_000_000 + run;
const legacyUserId = 8_000_000_000 + run;

Deno.test('a new Telegram user gets one account, a profile and a restorable session', async () => {
  const { client, session, user } = await signIn(newUserId);
  assertEquals(user.email, `telegram-${newUserId}@telegram.lifecare.invalid`);
  assertEquals(user.user_metadata.telegram_id, newUserId);
  assertEquals(user.user_metadata.full_name, `Test User ${newUserId}`);

  const accounts = await query((sql) =>
    sql`
    select user_id, telegram_user_id, display_name from mobile_auth.telegram_accounts where telegram_user_id = ${newUserId}`
  );
  assertEquals(
    accounts.map((row) => ({ user_id: row.user_id, telegram_user_id: Number(row.telegram_user_id), display_name: row.display_name })),
    [
      { user_id: user.id, telegram_user_id: newUserId, display_name: `Test User ${newUserId}` },
    ],
  );
  assert(client);

  // What the app does after a restart: restore from the refresh token.
  const restored = appClient();
  const { data: refreshed, error } = await restored.auth.refreshSession({ refresh_token: session.refresh_token });
  assertEquals(error, null);
  assertEquals(refreshed.user?.id, user.id);

  const again = await signIn(newUserId);
  assertEquals(again.user.id, user.id);
  assertEquals((await usersWithEmail(user.email!)).length, 1);
});

Deno.test('an account created by the previous widget login is reused', async () => {
  const email = `telegram-${legacyUserId}@telegram.lifecare.invalid`;
  const { data: legacy, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { telegram_id: legacyUserId, display_name: 'Legacy' },
  });
  assertEquals(error, null);

  const { user } = await signIn(legacyUserId);
  assertEquals(user.id, legacy.user!.id);
  assertEquals(user.user_metadata.full_name, `Test User ${legacyUserId}`);
  assertEquals((await usersWithEmail(email)).length, 1);
});

Deno.test('the Data API is off and client roles cannot reach mobile_auth', async () => {
  const rest = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: ANON_KEY } });
  await rest.body?.cancel();
  assertNotEquals(rest.status, 200, 'run the stack without PostgREST: supabase start -x postgrest,...');

  const [privileges] = await query((sql) =>
    sql`
    select has_schema_privilege('anon', 'mobile_auth', 'USAGE') as anon_schema,
           has_schema_privilege('authenticated', 'mobile_auth', 'USAGE') as auth_schema,
           has_table_privilege('anon', 'mobile_auth.login_attempts', 'SELECT,INSERT,UPDATE,DELETE') as anon_attempts,
           has_table_privilege('authenticated', 'mobile_auth.login_attempts', 'SELECT,INSERT,UPDATE,DELETE') as auth_attempts,
           has_table_privilege('anon', 'mobile_auth.telegram_accounts', 'SELECT,INSERT,UPDATE,DELETE') as anon_accounts,
           has_table_privilege('authenticated', 'mobile_auth.telegram_accounts', 'SELECT,INSERT,UPDATE,DELETE') as auth_accounts`
  );
  assertEquals(Object.values(privileges), [false, false, false, false, false, false]);
});

Deno.test('the login needs no sign-ups: the project keeps public sign-up disabled', async () => {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: `probe-${run}@example.com`, password: 'probe-password-123' }),
  });
  const body = await response.json();
  assertNotEquals(response.status, 200, `sign-up must be disabled for this test run: ${JSON.stringify(body)}`);
  // …and signing in through Telegram still works for a brand new user.
  const { user } = await signIn(9_000_000_000 + run);
  assertEquals(user.email, `telegram-${9_000_000_000 + run}@telegram.lifecare.invalid`);
});

Deno.test('the app code needs the app verifier and works once', async () => {
  const { params, verifier } = await browserLogin({ test_user: String(newUserId) });
  const code = params.get('code')!;
  const wrong = await exchange(code, randomToken());
  assertEquals(wrong, { status: 400, body: { error: 'invalid_code' } });
  const right = await exchange(code, verifier);
  assertEquals(right.status, 400, 'a burned code must not work with the right verifier either');

  const second = await browserLogin({ test_user: String(newUserId) });
  assertEquals((await exchange(second.params.get('code')!, second.verifier)).status, 200);
  assertEquals((await exchange(second.params.get('code')!, second.verifier)).status, 400);
});

Deno.test('declining in Telegram and untrusted tokens do not sign in', async () => {
  assertEquals((await browserLogin({ deny: '1' })).params.get('error'), 'access_denied');
  for (const flag of ['bad_audience', 'bad_nonce']) {
    const { params } = await browserLogin({ test_user: String(newUserId), [flag]: '1' });
    assertEquals(params.get('error'), 'login_failed', flag);
    assertEquals(params.get('code'), null);
  }
});

Deno.test('unknown app redirects are refused before Telegram is involved', async () => {
  const response = await fetch(
    `${FUNCTION_URL}/start?${new URLSearchParams({
      redirect_uri: 'evil://steal',
      code_challenge: await sha256Base64Url(randomToken()),
      code_challenge_method: 'S256',
    })}`,
    { redirect: 'manual' },
  );
  await response.body?.cancel();
  assertEquals(response.status, 400);
});

Deno.test('a replayed Telegram callback is refused', async () => {
  const verifier = randomToken();
  const start = `${FUNCTION_URL}/start?${new URLSearchParams({
    redirect_uri: APP_REDIRECT,
    code_challenge: await sha256Base64Url(verifier),
    code_challenge_method: 'S256',
  })}`;
  const telegramAuth = new URL((await follow(start)).replace('host.docker.internal', '127.0.0.1'));
  telegramAuth.searchParams.set('test_user', String(newUserId));
  const callback = await follow(telegramAuth.toString());
  await follow(callback);
  const replay = await fetch(callback, { redirect: 'manual' });
  await replay.body?.cancel();
  assertEquals(replay.status, 400);
  assertNotEquals(replay.headers.get('location')?.startsWith(APP_REDIRECT), true);
});
