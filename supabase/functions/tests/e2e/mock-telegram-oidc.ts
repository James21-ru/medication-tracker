/**
 * Local stand-in for https://oauth.telegram.org used by telegram-login.e2e.ts.
 * It follows the documented Telegram OIDC contract: discovery, JWKS, /auth with PKCE,
 * /token with Basic auth, and an RS256 ID token whose numeric user id is the `id` claim.
 *
 * Test-only query flags on /auth: test_user=<id>, deny=1, bad_audience=1, bad_nonce=1.
 */
import { exportJWK, generateKeyPair, SignJWT } from 'npm:jose@6.2.12';

import { sha256Base64Url } from '../../telegram-login/crypto.ts';

const port = Number(Deno.env.get('MOCK_OIDC_PORT') ?? '55480');
const issuer = Deno.env.get('MOCK_OIDC_ISSUER') ?? `http://host.docker.internal:${port}`;
const clientId = Deno.env.get('MOCK_OIDC_CLIENT_ID') ?? '123456789';
const clientSecret = Deno.env.get('MOCK_OIDC_CLIENT_SECRET') ?? 'mock-client-secret';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: 'mock-1', alg: 'RS256', use: 'sig' }] };

type Grant = { redirectUri: string; challenge: string; nonce: string; userId: number; badAudience: boolean; badNonce: boolean };
const grants = new Map<string, Grant>();

Deno.serve({ port, hostname: '0.0.0.0' }, async (request) => {
  const url = new URL(request.url);

  if (url.pathname === '/.well-known/openid-configuration') {
    return Response.json({
      issuer,
      authorization_endpoint: `${issuer}/auth`,
      token_endpoint: `${issuer}/token`,
      jwks_uri: `${issuer}/.well-known/jwks.json`,
    });
  }
  if (url.pathname === '/.well-known/jwks.json') return Response.json(jwks);

  if (url.pathname === '/auth') {
    const p = url.searchParams;
    const redirectUri = p.get('redirect_uri')!;
    const back = new URL(redirectUri);
    back.searchParams.set('state', p.get('state') ?? '');
    const valid = p.get('client_id') === clientId && p.get('response_type') === 'code' &&
      p.get('scope')?.split(' ').includes('profile') && p.get('code_challenge_method') === 'S256' && p.get('code_challenge');
    if (!valid) return new Response('invalid authorization request', { status: 400 });
    if (p.get('deny') === '1') {
      back.searchParams.set('error', 'access_denied');
    } else {
      const code = crypto.randomUUID();
      grants.set(code, {
        redirectUri,
        challenge: p.get('code_challenge')!,
        nonce: p.get('nonce') ?? '',
        userId: Number(p.get('test_user') ?? '111'),
        badAudience: p.get('bad_audience') === '1',
        badNonce: p.get('bad_nonce') === '1',
      });
      back.searchParams.set('code', code);
    }
    return new Response(null, { status: 302, headers: { location: back.toString() } });
  }

  if (url.pathname === '/token' && request.method === 'POST') {
    if (request.headers.get('authorization') !== `Basic ${btoa(`${clientId}:${clientSecret}`)}`) {
      return Response.json({ error: 'invalid_client' }, { status: 401 });
    }
    const body = new URLSearchParams(await request.text());
    const grant = grants.get(body.get('code') ?? '');
    grants.delete(body.get('code') ?? '');
    const pkceOk = grant && await sha256Base64Url(body.get('code_verifier') ?? '') === grant.challenge;
    if (!grant || !pkceOk || body.get('grant_type') !== 'authorization_code' || body.get('redirect_uri') !== grant.redirectUri) {
      return Response.json({ error: 'invalid_grant' }, { status: 400 });
    }
    const idToken = await new SignJWT({
      id: grant.userId,
      name: `Test User ${grant.userId}`,
      preferred_username: `user${grant.userId}`,
      nonce: grant.badNonce ? 'another-nonce' : grant.nonce,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'mock-1' })
      .setIssuer(issuer)
      .setAudience(grant.badAudience ? '999' : clientId)
      .setSubject(`sub-${grant.userId}-not-the-telegram-id`)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    return Response.json({ access_token: 'unused', token_type: 'Bearer', expires_in: 3600, id_token: idToken });
  }

  return new Response('not found', { status: 404 });
});
