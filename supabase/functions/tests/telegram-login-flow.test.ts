// Fakes implement async interfaces without awaiting anything.
// deno-lint-ignore-file require-await
import { assert, assertEquals, assertMatch } from 'jsr:@std/assert@1';

import { sha256Base64Url } from '../telegram-login/crypto.ts';
import { type AttemptStore, createHandler, DEFAULT_FLOW_CONFIG, type NewAttempt, type TelegramIdentity } from '../telegram-login/flow.ts';

const APP_REDIRECT = 'lifecare://auth/telegram';
const BASE = 'http://functions.test/telegram-login';

type Row = NewAttempt & {
  completedAt?: Date;
  appCodeHash?: string;
  tokenHash?: string;
  telegramUserId?: number;
};

function memoryStore(): AttemptStore & { rows: Map<string, Row> } {
  const rows = new Map<string, Row>();
  return {
    rows,
    async purgeExpired(before) {
      for (const [state, row] of rows) if (row.expiresAt < before) rows.delete(state);
    },
    async create(attempt) {
      rows.set(attempt.state, { ...attempt });
    },
    async claimForCallback(state, now) {
      const row = rows.get(state);
      if (!row || row.completedAt || row.expiresAt <= now) return null;
      row.completedAt = now;
      return { appRedirectUri: row.appRedirectUri, telegramCodeVerifier: row.telegramCodeVerifier, nonce: row.nonce };
    },
    async finish(state, result) {
      Object.assign(rows.get(state)!, result);
    },
    async consume(appCodeHash, now) {
      for (const [state, row] of rows) {
        if (row.appCodeHash === appCodeHash && row.tokenHash && row.expiresAt > now) {
          rows.delete(state);
          return { appCodeChallenge: row.appCodeChallenge, tokenHash: row.tokenHash };
        }
      }
      return null;
    },
  };
}

const identity: TelegramIdentity = { telegramUserId: 987654321, name: 'Test User', username: 'test', picture: null };

function setup(options: { verifyFails?: boolean } = {}) {
  let clock = new Date('2026-09-25T12:00:00Z');
  const store = memoryStore();
  const exchanged: { code: string; verifier: string }[] = [];
  const handler = createHandler({
    store,
    config: { ...DEFAULT_FLOW_CONFIG, allowedAppRedirectUris: [APP_REDIRECT] },
    now: () => clock,
    log: () => {},
    oidc: {
      async authorizationUrl({ state, nonce, codeChallenge }) {
        return `https://oauth.test/auth?${new URLSearchParams({ state, nonce, code_challenge: codeChallenge })}`;
      },
      async exchangeCode(code, verifier) {
        exchanged.push({ code, verifier });
        return 'id-token';
      },
      async verifyIdToken() {
        if (options.verifyFails) throw new Error('bad signature');
        return identity;
      },
    },
    accounts: {
      async issueLoginToken(received) {
        assertEquals(received, identity);
        return 'supabase-token-hash';
      },
    },
  });
  return {
    store,
    exchanged,
    advance(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
    get: (path: string) => handler(new Request(`${BASE}/${path}`)),
    post: (path: string, body: unknown) =>
      handler(new Request(`${BASE}/${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) })),
  };
}

async function appPkce() {
  const verifier = 'app-verifier-' + 'x'.repeat(40);
  return { verifier, challenge: await sha256Base64Url(verifier) };
}

async function startLogin(t: ReturnType<typeof setup>, challenge: string) {
  const response = await t.get(
    `start?${new URLSearchParams({ redirect_uri: APP_REDIRECT, code_challenge: challenge, code_challenge_method: 'S256' })}`,
  );
  assertEquals(response.status, 302);
  return new URL(response.headers.get('location')!);
}

function appRedirect(response: Response) {
  assertEquals(response.status, 302);
  const location = response.headers.get('location')!;
  assert(location.startsWith(`${APP_REDIRECT}?`), location);
  return new URL(location).searchParams;
}

Deno.test('full login returns a Supabase token hash only to the app holding the verifier', async () => {
  const t = setup();
  const { verifier, challenge } = await appPkce();
  const telegramAuth = await startLogin(t, challenge);
  const state = telegramAuth.searchParams.get('state')!;

  const back = appRedirect(await t.get(`callback?code=tg-code&state=${state}`));
  const appCode = back.get('code')!;
  assertMatch(appCode, /^[A-Za-z0-9_-]{43}$/);

  // Our own PKCE pair with Telegram: the verifier we send matches the challenge Telegram saw.
  assertEquals(t.exchanged, [{ code: 'tg-code', verifier: t.exchanged[0].verifier }]);
  assertEquals(await sha256Base64Url(t.exchanged[0].verifier), telegramAuth.searchParams.get('code_challenge'));
  assert(t.exchanged[0].verifier !== verifier, 'the app verifier must never reach Telegram');

  const session = await t.post('session', { code: appCode, code_verifier: verifier });
  assertEquals(session.status, 200);
  assertEquals(await session.json(), { token_hash: 'supabase-token-hash', type: 'email' });
});

Deno.test('start accepts only allow-listed app redirects and S256 challenges', async () => {
  const t = setup();
  const { challenge } = await appPkce();
  const cases: Record<string, string>[] = [
    { redirect_uri: 'evil://auth/telegram', code_challenge: challenge, code_challenge_method: 'S256' },
    { redirect_uri: 'https://evil.example/cb', code_challenge: challenge, code_challenge_method: 'S256' },
    { redirect_uri: APP_REDIRECT, code_challenge: challenge, code_challenge_method: 'plain' },
    { redirect_uri: APP_REDIRECT, code_challenge: 'short', code_challenge_method: 'S256' },
    { redirect_uri: APP_REDIRECT },
  ];
  for (const params of cases) {
    const response = await t.get(`start?${new URLSearchParams(params)}`);
    assertEquals(response.status, 400, JSON.stringify(params));
    await response.body?.cancel();
  }
  assertEquals(t.store.rows.size, 0);
});

Deno.test('a callback state works only once', async () => {
  const t = setup();
  const { challenge } = await appPkce();
  const state = (await startLogin(t, challenge)).searchParams.get('state')!;
  appRedirect(await t.get(`callback?code=tg-code&state=${state}`));
  const replay = await t.get(`callback?code=tg-code&state=${state}`);
  assertEquals(replay.status, 400);
  assertEquals(t.exchanged.length, 1);
});

Deno.test('unknown state is rejected without contacting Telegram', async () => {
  const t = setup();
  const response = await t.get('callback?code=tg-code&state=forged');
  assertEquals(response.status, 400);
  assertEquals(t.exchanged.length, 0);
});

Deno.test('an app code works only once, and a wrong verifier burns it', async () => {
  const t = setup();
  const { verifier, challenge } = await appPkce();
  const state = (await startLogin(t, challenge)).searchParams.get('state')!;
  const appCode = appRedirect(await t.get(`callback?code=tg-code&state=${state}`)).get('code')!;

  const wrong = await t.post('session', { code: appCode, code_verifier: 'attacker-verifier-' + 'y'.repeat(40) });
  assertEquals(wrong.status, 400);
  assertEquals(await wrong.json(), { error: 'invalid_code' });

  const afterWrong = await t.post('session', { code: appCode, code_verifier: verifier });
  assertEquals(afterWrong.status, 400);
  await afterWrong.body?.cancel();
});

Deno.test('a used app code cannot be exchanged twice', async () => {
  const t = setup();
  const { verifier, challenge } = await appPkce();
  const state = (await startLogin(t, challenge)).searchParams.get('state')!;
  const appCode = appRedirect(await t.get(`callback?code=tg-code&state=${state}`)).get('code')!;
  assertEquals((await t.post('session', { code: appCode, code_verifier: verifier })).status, 200);
  const replay = await t.post('session', { code: appCode, code_verifier: verifier });
  assertEquals(replay.status, 400);
  await replay.body?.cancel();
});

Deno.test('expired login attempts and app codes are rejected', async () => {
  const t = setup();
  const { verifier, challenge } = await appPkce();

  const stale = (await startLogin(t, challenge)).searchParams.get('state')!;
  t.advance(DEFAULT_FLOW_CONFIG.attemptTtlMs + 1);
  const late = await t.get(`callback?code=tg-code&state=${stale}`);
  assertEquals(late.status, 400);
  await late.body?.cancel();

  const state = (await startLogin(t, challenge)).searchParams.get('state')!;
  const appCode = appRedirect(await t.get(`callback?code=tg-code&state=${state}`)).get('code')!;
  t.advance(DEFAULT_FLOW_CONFIG.appCodeTtlMs + 1);
  const session = await t.post('session', { code: appCode, code_verifier: verifier });
  assertEquals(session.status, 400);
  await session.body?.cancel();
});

Deno.test('declining in Telegram returns access_denied to the app', async () => {
  const t = setup();
  const { challenge } = await appPkce();
  const state = (await startLogin(t, challenge)).searchParams.get('state')!;
  const back = appRedirect(await t.get(`callback?error=access_denied&state=${state}`));
  assertEquals(back.get('error'), 'access_denied');
  assertEquals(back.get('code'), null);
});

Deno.test('an invalid Telegram identity returns login_failed and no code', async () => {
  const t = setup({ verifyFails: true });
  const { challenge } = await appPkce();
  const state = (await startLogin(t, challenge)).searchParams.get('state')!;
  const back = appRedirect(await t.get(`callback?code=tg-code&state=${state}`));
  assertEquals(back.get('error'), 'login_failed');
  assertEquals(back.get('code'), null);
});

Deno.test('malformed requests are rejected', async () => {
  const t = setup();
  for (const body of ['not json', { code: 'x' }, { code: 'a'.repeat(43), code_verifier: 'short' }]) {
    const response = await t.post('session', body);
    assertEquals(response.status, 400);
    await response.body?.cancel();
  }
  for (
    const [response, status] of [
      [await t.get('session'), 405],
      [await t.post('start', {}), 405],
      [await t.get(''), 404],
    ] as const
  ) {
    assertEquals(response.status, status);
    await response.body?.cancel();
  }
});
