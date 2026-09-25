import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';

import {
  base64UrlEncode,
  createPkcePair,
  exchangeTelegramCode,
  parseTelegramCallback,
  TelegramLoginError,
  telegramLoginFunctionUrl,
  telegramLoginStartUrl,
} from './telegram-auth.ts';

const sha256 = (data: Uint8Array) => webcrypto.subtle.digest('SHA-256', data);

test('PKCE pair matches the RFC 7636 appendix B example', async () => {
  const octets = Uint8Array.from([116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121]);
  const pair = await createPkcePair({ randomBytes: () => octets, sha256 });
  assert.deepEqual(pair, {
    verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  });
});

test('base64url encoding matches Node for every tail length', () => {
  for (let length = 0; length < 40; length += 1) {
    const bytes = webcrypto.getRandomValues(new Uint8Array(length));
    assert.equal(base64UrlEncode(bytes), Buffer.from(bytes).toString('base64url'));
  }
});

test('a fresh verifier is 43 characters and different every time', async () => {
  const randomBytes = (count: number) => webcrypto.getRandomValues(new Uint8Array(count));
  const first = await createPkcePair({ randomBytes, sha256 });
  const second = await createPkcePair({ randomBytes, sha256 });
  assert.match(first.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first.verifier, second.verifier);
});

test('start URL carries the app redirect and challenge, never the verifier', () => {
  const functionUrl = telegramLoginFunctionUrl('https://abc.supabase.co/');
  assert.equal(functionUrl, 'https://abc.supabase.co/functions/v1/telegram-login');
  const url = new URL(telegramLoginStartUrl(functionUrl, 'lifecare://auth/telegram', 'challenge-1'));
  assert.equal(url.pathname, '/functions/v1/telegram-login/start');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    redirect_uri: 'lifecare://auth/telegram',
    code_challenge: 'challenge-1',
    code_challenge_method: 'S256',
  });
});

test('callback URLs are parsed into a code or an error', () => {
  assert.deepEqual(parseTelegramCallback('lifecare://auth/telegram?code=abc_-1'), { code: 'abc_-1' });
  assert.deepEqual(parseTelegramCallback('lifecare://auth/telegram?error=access_denied'), { error: 'access_denied' });
  assert.deepEqual(parseTelegramCallback('lifecare://auth/telegram'), { error: 'login_failed' });
  assert.deepEqual(parseTelegramCallback('lifecare://auth/telegram?code=x#fragment'), { code: 'x' });
});

test('code exchange posts the verifier and returns the token hash', async () => {
  let request: { url: string; body: unknown } | null = null;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    request = { url, body: JSON.parse(String(init.body)) };
    return Response.json({ token_hash: 'hash-1', type: 'email' });
  }) as unknown as typeof fetch;
  assert.equal(await exchangeTelegramCode('https://fn', 'code-1', 'verifier-1', fetchImpl), 'hash-1');
  assert.deepEqual(request, { url: 'https://fn/session', body: { code: 'code-1', code_verifier: 'verifier-1' } });
});

test('code exchange failures become user-facing errors', async () => {
  const rejected = (async () => Response.json({ error: 'invalid_code' }, { status: 400 })) as unknown as typeof fetch;
  await assert.rejects(exchangeTelegramCode('https://fn', 'c', 'v', rejected), (error: unknown) =>
    error instanceof TelegramLoginError && error.code === 'invalid_code' && error.message === 'Срок входа истёк. Попробуйте ещё раз.');

  const offline = (async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch;
  await assert.rejects(exchangeTelegramCode('https://fn', 'c', 'v', offline), (error: unknown) =>
    error instanceof TelegramLoginError && error.code === 'network');

  const broken = (async () => new Response('<html>', { status: 502 })) as unknown as typeof fetch;
  await assert.rejects(exchangeTelegramCode('https://fn', 'c', 'v', broken), (error: unknown) =>
    error instanceof TelegramLoginError && error.code === 'login_failed');
});
