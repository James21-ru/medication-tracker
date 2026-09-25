import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'npm:jose@6.2.12';

import type { TelegramIdentity, TelegramOidc } from './flow.ts';

export const TELEGRAM_ISSUER = 'https://oauth.telegram.org';

// Telegram also offers ES256K, which jose does not verify; keep BotFather on the RS256 default.
const ALLOWED_ALGORITHMS = ['RS256', 'ES256', 'EdDSA'];

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

export type TelegramOidcConfig = {
  issuer: string;
  /** The bot ID shown by @BotFather; also the expected ID token audience. */
  clientId: string;
  clientSecret: string;
  /** This function's /callback URL, registered as an Allowed URL in @BotFather. */
  redirectUri: string;
  fetch?: typeof fetch;
  /** Overrides the JWKS fetched from discovery; used by tests. */
  keySet?: JWTVerifyGetKey;
};

export function createTelegramOidc(config: TelegramOidcConfig): TelegramOidc {
  const fetchImpl = config.fetch ?? fetch;
  let discovery: Promise<Discovery> | null = null;
  let keySet: JWTVerifyGetKey | null = config.keySet ?? null;

  function getDiscovery(): Promise<Discovery> {
    discovery ??= (async () => {
      const response = await fetchImpl(`${config.issuer}/.well-known/openid-configuration`);
      if (!response.ok) throw new Error(`OIDC discovery failed with ${response.status}`);
      const document = await response.json() as Discovery;
      if (document.issuer !== config.issuer) throw new Error('OIDC discovery issuer mismatch');
      return document;
    })().catch((error) => {
      discovery = null;
      throw error;
    });
    return discovery;
  }

  return {
    async authorizationUrl({ state, nonce, codeChallenge }) {
      const url = new URL((await getDiscovery()).authorization_endpoint);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'openid profile',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }).toString();
      return url.toString();
    },

    async exchangeCode(code, codeVerifier) {
      const response = await fetchImpl((await getDiscovery()).token_endpoint, {
        method: 'POST',
        headers: {
          authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.redirectUri,
          client_id: config.clientId,
          code_verifier: codeVerifier,
        }),
      });
      if (!response.ok) throw new Error(`Token endpoint returned ${response.status}`);
      const body = await response.json() as { id_token?: unknown };
      if (typeof body.id_token !== 'string') throw new Error('Token response has no id_token');
      return body.id_token;
    },

    async verifyIdToken(idToken, expectedNonce) {
      keySet ??= createRemoteJWKSet(new URL((await getDiscovery()).jwks_uri));
      const { payload } = await jwtVerify(idToken, keySet, {
        issuer: config.issuer,
        audience: config.clientId,
        algorithms: ALLOWED_ALGORITHMS,
        requiredClaims: ['exp', 'iat'],
        clockTolerance: 30,
      });
      if (payload.nonce !== undefined && payload.nonce !== expectedNonce) throw new Error('ID token nonce mismatch');

      const telegramUserId = typeof payload.id === 'string' ? Number(payload.id) : payload.id;
      if (typeof telegramUserId !== 'number' || !Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) {
        throw new Error('ID token has no Telegram user id; request the profile scope');
      }
      return {
        telegramUserId,
        name: stringClaim(payload.name) ?? joinName(payload.given_name, payload.family_name),
        username: stringClaim(payload.preferred_username),
        picture: stringClaim(payload.picture),
      } satisfies TelegramIdentity;
    },
  };
}

function stringClaim(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function joinName(given: unknown, family: unknown): string | null {
  return [stringClaim(given), stringClaim(family)].filter(Boolean).join(' ') || null;
}
