import { constantTimeEqual, randomToken, sha256Base64Url } from './crypto.ts';

/**
 * Telegram login for the native app, in three steps:
 *
 * 1. GET  /start    — the app opens this in ASWebAuthenticationSession with its redirect URI
 *                     and a PKCE challenge; we redirect to Telegram's OIDC authorization page.
 * 2. GET  /callback — Telegram returns an authorization code; we exchange it with our client
 *                     secret, verify the ID token, prepare a Supabase login token and redirect
 *                     back to the app with a one-time code.
 * 3. POST /session  — the app sends the one-time code with its PKCE verifier and receives the
 *                     Supabase token hash for verifyOtp().
 *
 * The app-side PKCE pair means a code intercepted on the way back to the app is useless
 * without the verifier that never left the app. The client secret never leaves the server.
 */

export type TelegramIdentity = {
  telegramUserId: number;
  name: string | null;
  username: string | null;
  picture: string | null;
};

export type NewAttempt = {
  state: string;
  appRedirectUri: string;
  appCodeChallenge: string;
  telegramCodeVerifier: string;
  nonce: string;
  expiresAt: Date;
};

export type ClaimedAttempt = {
  appRedirectUri: string;
  telegramCodeVerifier: string;
  nonce: string;
};

export interface AttemptStore {
  purgeExpired(before: Date): Promise<void>;
  create(attempt: NewAttempt): Promise<void>;
  /** Marks the attempt as called back. Returns null if unknown, expired or already used. */
  claimForCallback(state: string, now: Date): Promise<ClaimedAttempt | null>;
  finish(state: string, result: { appCodeHash: string; tokenHash: string; telegramUserId: number; expiresAt: Date }): Promise<void>;
  /** Removes and returns a finished attempt. Returns null if unknown, expired or already used. */
  consume(appCodeHash: string, now: Date): Promise<{ appCodeChallenge: string; tokenHash: string } | null>;
}

export interface TelegramOidc {
  authorizationUrl(params: { state: string; nonce: string; codeChallenge: string }): Promise<string>;
  exchangeCode(code: string, codeVerifier: string): Promise<string>;
  verifyIdToken(idToken: string, expectedNonce: string): Promise<TelegramIdentity>;
}

export interface Accounts {
  /** Finds or creates the Supabase user for this Telegram user and returns a one-time login token hash. */
  issueLoginToken(identity: TelegramIdentity): Promise<string>;
}

export type FlowConfig = {
  allowedAppRedirectUris: string[];
  attemptTtlMs: number;
  appCodeTtlMs: number;
};

export type FlowDeps = {
  store: AttemptStore;
  oidc: TelegramOidc;
  accounts: Accounts;
  config: FlowConfig;
  now?: () => Date;
  log?: (message: string) => void;
};

export const DEFAULT_FLOW_CONFIG: Omit<FlowConfig, 'allowedAppRedirectUris'> = {
  attemptTtlMs: 10 * 60 * 1000,
  appCodeTtlMs: 2 * 60 * 1000,
};

/** Error codes the app understands; see mobile/src/services/telegram-auth.ts. */
export type AppErrorCode = 'access_denied' | 'login_failed';

const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/;
const PKCE_VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
const PURGE_AFTER_MS = 60 * 60 * 1000;

export function createHandler(deps: FlowDeps): (request: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message: string) => console.error(message));

  return async (request) => {
    const url = new URL(request.url);
    const step = url.pathname.replace(/\/+$/, '').split('/').pop();
    try {
      if (step === 'start') return request.method === 'GET' ? await start(url) : methodNotAllowed();
      if (step === 'callback') return request.method === 'GET' ? await callback(url) : methodNotAllowed();
      if (step === 'session') return request.method === 'POST' ? await session(request) : methodNotAllowed();
      return text('Not found', 404);
    } catch (error) {
      log(`[telegram-login] ${step}: ${error instanceof Error ? error.message : String(error)}`);
      return text('Сервис входа временно недоступен. Попробуйте ещё раз.', 500);
    }
  };

  async function start(url: URL): Promise<Response> {
    const appRedirectUri = url.searchParams.get('redirect_uri') ?? '';
    const appCodeChallenge = url.searchParams.get('code_challenge') ?? '';
    if (!deps.config.allowedAppRedirectUris.includes(appRedirectUri)) return text('Unknown redirect_uri', 400);
    if (url.searchParams.get('code_challenge_method') !== 'S256' || !BASE64URL_43.test(appCodeChallenge)) {
      return text('A S256 code_challenge is required', 400);
    }

    const current = now();
    await deps.store.purgeExpired(new Date(current.getTime() - PURGE_AFTER_MS)).catch((error) => {
      log(`[telegram-login] purge failed: ${error instanceof Error ? error.message : String(error)}`);
    });

    const state = randomToken();
    const nonce = randomToken();
    const telegramCodeVerifier = randomToken();
    await deps.store.create({
      state,
      appRedirectUri,
      appCodeChallenge,
      telegramCodeVerifier,
      nonce,
      expiresAt: new Date(current.getTime() + deps.config.attemptTtlMs),
    });
    const location = await deps.oidc.authorizationUrl({
      state,
      nonce,
      codeChallenge: await sha256Base64Url(telegramCodeVerifier),
    });
    return redirect(location);
  }

  async function callback(url: URL): Promise<Response> {
    const state = url.searchParams.get('state');
    if (!state) return text('Missing state', 400);
    const current = now();
    const attempt = await deps.store.claimForCallback(state, current);
    if (!attempt) return text('Ссылка входа устарела. Вернитесь в приложение и попробуйте ещё раз.', 400);

    if (url.searchParams.has('error')) {
      const denied = url.searchParams.get('error') === 'access_denied';
      return redirectToApp(attempt.appRedirectUri, { error: denied ? 'access_denied' : 'login_failed' });
    }
    const code = url.searchParams.get('code');
    if (!code) return redirectToApp(attempt.appRedirectUri, { error: 'login_failed' });

    try {
      const idToken = await deps.oidc.exchangeCode(code, attempt.telegramCodeVerifier);
      const identity = await deps.oidc.verifyIdToken(idToken, attempt.nonce);
      const tokenHash = await deps.accounts.issueLoginToken(identity);
      const appCode = randomToken();
      await deps.store.finish(state, {
        appCodeHash: await sha256Base64Url(appCode),
        tokenHash,
        telegramUserId: identity.telegramUserId,
        expiresAt: new Date(current.getTime() + deps.config.appCodeTtlMs),
      });
      return redirectToApp(attempt.appRedirectUri, { code: appCode });
    } catch (error) {
      log(`[telegram-login] callback failed: ${error instanceof Error ? error.message : String(error)}`);
      return redirectToApp(attempt.appRedirectUri, { error: 'login_failed' });
    }
  }

  async function session(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid_request' }, 400);
    }
    const { code, code_verifier: codeVerifier } = (body ?? {}) as Record<string, unknown>;
    if (typeof code !== 'string' || !BASE64URL_43.test(code) || typeof codeVerifier !== 'string' || !PKCE_VERIFIER.test(codeVerifier)) {
      return json({ error: 'invalid_request' }, 400);
    }

    // Consuming first makes every code single-use, even when the verifier is wrong.
    const attempt = await deps.store.consume(await sha256Base64Url(code), now());
    if (!attempt) return json({ error: 'invalid_code' }, 400);
    if (!constantTimeEqual(await sha256Base64Url(codeVerifier), attempt.appCodeChallenge)) {
      return json({ error: 'invalid_code' }, 400);
    }
    return json({ token_hash: attempt.tokenHash, type: 'email' }, 200);
  }
}

function redirectToApp(appRedirectUri: string, params: { code: string } | { error: AppErrorCode }): Response {
  const location = new URL(appRedirectUri);
  for (const [key, value] of Object.entries(params)) location.searchParams.set(key, value);
  return redirect(location.toString());
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
}

function methodNotAllowed(): Response {
  return text('Method not allowed', 405);
}

function text(message: string, status: number): Response {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
