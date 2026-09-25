/**
 * Client side of the Telegram login served by supabase/functions/telegram-login.
 * Kept free of React Native imports so it can run under `node --test`.
 */

export const TELEGRAM_AUTH_PATH = 'auth/telegram';

export type PkcePair = { verifier: string; challenge: string };

export type CryptoDeps = {
  randomBytes: (count: number) => Uint8Array;
  sha256: (data: Uint8Array<ArrayBuffer>) => Promise<ArrayBuffer>;
};

export type TelegramCallback = { code: string } | { error: string };

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function base64UrlEncode(bytes: Uint8Array): string {
  let output = '';
  let index = 0;
  for (; index + 2 < bytes.length; index += 3) {
    const chunk = (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
    output += BASE64URL_ALPHABET[(chunk >> 18) & 63] + BASE64URL_ALPHABET[(chunk >> 12) & 63] +
      BASE64URL_ALPHABET[(chunk >> 6) & 63] + BASE64URL_ALPHABET[chunk & 63];
  }
  const rest = bytes.length - index;
  if (rest === 1) {
    const chunk = bytes[index] << 16;
    output += BASE64URL_ALPHABET[(chunk >> 18) & 63] + BASE64URL_ALPHABET[(chunk >> 12) & 63];
  } else if (rest === 2) {
    const chunk = (bytes[index] << 16) | (bytes[index + 1] << 8);
    output += BASE64URL_ALPHABET[(chunk >> 18) & 63] + BASE64URL_ALPHABET[(chunk >> 12) & 63] + BASE64URL_ALPHABET[(chunk >> 6) & 63];
  }
  return output;
}

/** RFC 7636 S256 pair; the verifier stays in the app and only its hash leaves it. */
export async function createPkcePair({ randomBytes, sha256 }: CryptoDeps): Promise<PkcePair> {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(new Uint8Array(await sha256(new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

export function telegramLoginFunctionUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/telegram-login`;
}

export function telegramLoginStartUrl(functionUrl: string, redirectUri: string, codeChallenge: string): string {
  const query = new URLSearchParams({ redirect_uri: redirectUri, code_challenge: codeChallenge, code_challenge_method: 'S256' });
  return `${functionUrl}/start?${query.toString()}`;
}

export function parseTelegramCallback(url: string): TelegramCallback {
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '';
  const params = new URLSearchParams(query);
  const code = params.get('code');
  if (code) return { code };
  return { error: params.get('error') ?? 'login_failed' };
}

export function telegramLoginErrorMessage(error: string): string {
  if (error === 'access_denied') return 'Вход отменён в Telegram.';
  if (error === 'invalid_code') return 'Срок входа истёк. Попробуйте ещё раз.';
  if (error === 'network') return 'Нет соединения с сервером входа. Проверьте интернет и повторите попытку.';
  return 'Не удалось войти через Telegram. Попробуйте ещё раз.';
}

export class TelegramLoginError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(telegramLoginErrorMessage(code));
    this.code = code;
  }
}

/** Trades the one-time code from the callback for a Supabase token hash (for verifyOtp). */
export async function exchangeTelegramCode(
  functionUrl: string,
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(`${functionUrl}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier }),
    });
  } catch {
    throw new TelegramLoginError('network');
  }
  const body = await response.json().catch(() => null) as { token_hash?: unknown; error?: unknown } | null;
  if (response.ok && typeof body?.token_hash === 'string') return body.token_hash;
  throw new TelegramLoginError(typeof body?.error === 'string' ? body.error : 'login_failed');
}
