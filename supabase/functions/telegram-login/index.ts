import { createClient } from 'npm:@supabase/supabase-js@2';

const maxAuthorizationAgeMs = 5 * 60 * 1000;

Deno.serve(async (request) => {
  if (request.method !== 'GET') return response('Method not allowed', 405);

  const url = new URL(request.url);
  if (!url.searchParams.has('id')) return loginPage();

  try {
    const payload = Object.fromEntries(url.searchParams.entries());
    const telegramUser = await verifyTelegramPayload(payload);
    const supabase = createServiceClient();
    const email = `telegram-${telegramUser.id}@telegram.lifecare.invalid`;
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        data: {
          telegram_id: telegramUser.id,
          telegram_username: telegramUser.username ?? null,
          display_name: [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ') || null,
        },
      },
    });
    if (linkError || !linkData.user || !linkData.properties.hashed_token) throw new Error('Unable to create a secure session.');

    const { error: profileError } = await supabase.from('lifecare_profiles').upsert({
      id: linkData.user.id,
      telegram_user_id: Number(telegramUser.id),
      display_name: [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ') || null,
    });
    if (profileError) throw new Error('Unable to save the account profile.');

    const redirectUrl = new URL(Deno.env.get('APP_REDIRECT_URL') ?? 'mobile://auth/telegram');
    redirectUrl.searchParams.set('token_hash', linkData.properties.hashed_token);
    redirectUrl.searchParams.set('type', 'email');
    return Response.redirect(redirectUrl, 302);
  } catch (error) {
    console.error(error);
    return response('Не удалось подтвердить вход через Telegram. Вернитесь в приложение и попробуйте ещё раз.', 401);
  }
});

async function loginPage() {
  const botUsername = await getTelegramBotUsername();
  const callbackUrl = `${requiredEnv('SUPABASE_URL')}/functions/v1/telegram-login`;
  const escapedBotUsername = escapeHtml(botUsername);
  const escapedCallbackUrl = escapeHtml(callbackUrl);
  return new Response(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Вход в LifeCare</title></head><body><main><h1>Войти в LifeCare</h1><p>Подтвердите вход в Telegram. Мы не получаем доступ к вашим сообщениям.</p><script async src="https://telegram.org/js/telegram-widget.js?22" data-telegram-login="${escapedBotUsername}" data-size="large" data-radius="12" data-auth-url="${escapedCallbackUrl}"></script></main></body></html>`, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'referrer-policy': 'no-referrer' },
  });
}

async function getTelegramBotUsername() {
  const response = await fetch(`https://api.telegram.org/bot${requiredEnv('TELEGRAM_BOT_TOKEN')}/getMe`);
  const body = await response.json() as { ok?: boolean; result?: { username?: string } };
  if (!response.ok || !body.ok || !body.result?.username) throw new Error('Telegram bot username could not be resolved.');
  return body.result.username;
}

async function verifyTelegramPayload(payload: Record<string, string>) {
  const hash = payload.hash;
  const authDate = Number(payload.auth_date);
  if (!hash || !payload.id || !Number.isSafeInteger(authDate) || Math.abs(Date.now() - authDate * 1000) > maxAuthorizationAgeMs) throw new Error('Telegram authorization is invalid or expired.');

  const dataCheckString = Object.entries(payload)
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const tokenBytes = new TextEncoder().encode(requiredEnv('TELEGRAM_BOT_TOKEN'));
  const secretKey = new Uint8Array(await crypto.subtle.digest('SHA-256', tokenBytes));
  const signature = await crypto.subtle.sign('HMAC', await crypto.subtle.importKey('raw', secretKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']), new TextEncoder().encode(dataCheckString));
  if (!constantTimeEqual(toHex(new Uint8Array(signature)), hash)) throw new Error('Telegram signature did not match.');

  return payload as TelegramUser;
}

function createServiceClient() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function response(message: string, status: number) {
  return new Response(message, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

type TelegramUser = {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
};
