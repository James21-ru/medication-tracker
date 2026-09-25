// Fakes implement async interfaces without awaiting anything.
// deno-lint-ignore-file require-await
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload, SignJWT } from 'npm:jose@6.2.12';

import { createTelegramOidc } from '../telegram-login/telegram-oidc.ts';

const ISSUER = 'https://oauth.telegram.org';
const CLIENT_ID = '123456789';
const CLIENT_SECRET = 'test-client-secret';
const REDIRECT_URI = 'https://project.supabase.co/functions/v1/telegram-login/callback';

const telegramKey = await generateKeyPair('RS256');
const otherKey = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(telegramKey.publicKey)), kid: 'tg-1', alg: 'RS256' };
const keySet = createLocalJWKSet({ keys: [jwk] });

const discovery = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/auth`,
  token_endpoint: `${ISSUER}/token`,
  jwks_uri: `${ISSUER}/.well-known/jwks.json`,
};

function stubFetch(handleToken?: (request: Request) => Response | Promise<Response>): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    if (request.url === `${ISSUER}/.well-known/openid-configuration`) return Response.json(discovery);
    if (request.url === discovery.token_endpoint && handleToken) return handleToken(request);
    return new Response('unexpected', { status: 500 });
  };
}

function oidc(fetchImpl = stubFetch()) {
  return createTelegramOidc({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
    fetch: fetchImpl,
    keySet,
  });
}

async function idToken(claims: JWTPayload, options: { key?: CryptoKey; issuer?: string; audience?: string; expiresIn?: string } = {}) {
  return await new SignJWT({ id: 987654321, name: 'Test User', preferred_username: 'tester', nonce: 'nonce-1', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'tg-1' })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? CLIENT_ID)
    .setSubject('1234123412341234123')
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '1h')
    .sign(options.key ?? telegramKey.privateKey);
}

Deno.test('authorization URL requests openid profile with PKCE and our callback', async () => {
  const url = new URL(await oidc().authorizationUrl({ state: 's', nonce: 'n', codeChallenge: 'c' }));
  assertEquals(url.origin + url.pathname, discovery.authorization_endpoint);
  assertEquals(Object.fromEntries(url.searchParams), {
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid profile',
    state: 's',
    nonce: 'n',
    code_challenge: 'c',
    code_challenge_method: 'S256',
  });
});

Deno.test('code exchange uses Basic auth, the callback URL and the PKCE verifier', async () => {
  let seen: { authorization: string | null; body: Record<string, string> } | null = null;
  const client = oidc(stubFetch(async (request) => {
    seen = { authorization: request.headers.get('authorization'), body: Object.fromEntries(new URLSearchParams(await request.text())) };
    return Response.json({ id_token: 'the-token', token_type: 'Bearer', expires_in: 3600 });
  }));
  assertEquals(await client.exchangeCode('auth-code', 'verifier-1'), 'the-token');
  assertEquals(seen, {
    authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
    body: {
      grant_type: 'authorization_code',
      code: 'auth-code',
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: 'verifier-1',
    },
  });
});

Deno.test('a failed code exchange throws', async () => {
  const client = oidc(stubFetch(() => Response.json({ error: 'invalid_grant' }, { status: 400 })));
  await assertRejects(() => client.exchangeCode('auth-code', 'verifier-1'), Error, '400');
});

Deno.test('a valid ID token yields the numeric Telegram id, not sub', async () => {
  const identity = await oidc().verifyIdToken(await idToken({}), 'nonce-1');
  assertEquals(identity, { telegramUserId: 987654321, name: 'Test User', username: 'tester', picture: null });
});

Deno.test('a numeric string id and a missing nonce are accepted', async () => {
  const identity = await oidc().verifyIdToken(await idToken({ id: '42', nonce: undefined }), 'nonce-1');
  assertEquals(identity.telegramUserId, 42);
});

Deno.test('ID tokens that must not be trusted are rejected', async () => {
  const client = oidc();
  const cases: [string, Promise<string>][] = [
    ['foreign signing key', idToken({}, { key: otherKey.privateKey })],
    ['other issuer', idToken({}, { issuer: 'https://evil.example' })],
    ['token for another bot', idToken({}, { audience: '999' })],
    ['expired', idToken({}, { expiresIn: '-5m' })],
    ['nonce from another login', idToken({ nonce: 'nonce-2' })],
    ['no Telegram id', idToken({ id: undefined })],
    ['non-numeric id', idToken({ id: 'abc' })],
  ];
  for (const [label, token] of cases) {
    await assertRejects(async () => await client.verifyIdToken(await token, 'nonce-1'), Error, undefined, label);
  }
});

Deno.test('discovery for another issuer is rejected', async () => {
  const client = createTelegramOidc({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
    fetch: async () => Response.json({ ...discovery, issuer: 'https://evil.example' }),
  });
  await assertRejects(() => client.authorizationUrl({ state: 's', nonce: 'n', codeChallenge: 'c' }), Error, 'issuer');
});
