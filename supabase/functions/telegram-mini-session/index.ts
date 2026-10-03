import { createClient } from 'npm:@supabase/supabase-js@2.117.0';
import postgres from 'npm:postgres@3.4.9';

type TelegramUser = { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string };

const encoder = new TextEncoder();
const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'content-type': 'application/json; charset=utf-8',
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  const key = keys.default ?? Object.values(keys)[0];
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEYS is not configured');
  return key;
}

async function hmac(key: Uint8Array | string, value: string) {
  const rawKey = typeof key === 'string' ? encoder.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value)));
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function verifyInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  const userText = params.get('user');
  if (!receivedHash || !Number.isInteger(authDate) || !userText) throw new Error('invalid init data');
  const now = Math.floor(Date.now() / 1000);
  if (authDate > now + 300 || now - authDate > 86_400) throw new Error('expired init data');
  params.delete('hash');
  const dataCheckString = [...params.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = await hmac('WebAppData', botToken);
  if (hex(await hmac(secret, dataCheckString)) !== receivedHash) throw new Error('invalid init data signature');
  const user = JSON.parse(userText) as TelegramUser;
  if (!Number.isSafeInteger(user.id) || user.id <= 0) throw new Error('invalid Telegram user');
  return user;
}

async function issueLoginToken(client: ReturnType<typeof createClient>, sql: ReturnType<typeof postgres>, user: TelegramUser) {
  const email = `telegram-${user.id}@telegram.lifecare.invalid`;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;
  const metadata = { full_name: name, telegram_id: user.id, telegram_username: user.username ?? null, avatar_url: user.photo_url ?? null };
  const { error: createError } = await client.auth.admin.createUser({ email, email_confirm: true, user_metadata: metadata });
  if (createError && createError.code !== 'email_exists') throw new Error(`create user: ${createError.message}`);
  const { data, error } = await client.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !data?.user || !tokenHash) throw new Error(`generate link: ${error?.message ?? 'empty response'}`);
  const { error: updateError } = await client.auth.admin.updateUserById(data.user.id, { user_metadata: metadata });
  if (updateError) throw new Error(`update user: ${updateError.message}`);
  await sql`
    insert into mobile_auth.telegram_accounts (user_id, telegram_user_id, display_name)
    values (${data.user.id}, ${user.id}, ${name})
    on conflict (user_id) do update
      set telegram_user_id = excluded.telegram_user_id,
          display_name = excluded.display_name,
          updated_at = now()`;
  return tokenHash;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: corsHeaders });
  try {
    const body = await request.json() as { init_data?: unknown };
    if (typeof body.init_data !== 'string') throw new Error('missing init data');
    const user = await verifyInitData(body.init_data, requiredEnv('TELEGRAM_BOT_TOKEN'));
    const supabase = createClient(requiredEnv('SUPABASE_URL'), serviceKey(), { auth: { autoRefreshToken: false, persistSession: false } });
    const sql = postgres(requiredEnv('SUPABASE_DB_URL'), { prepare: false, max: 1, idle_timeout: 20 });
    const tokenHash = await issueLoginToken(supabase, sql, user);
    await sql.end({ timeout: 1 });
    return new Response(JSON.stringify({ token_hash: tokenHash }), { headers: corsHeaders });
  } catch (error) {
    console.error(`[telegram-mini-session] ${error instanceof Error ? error.message : String(error)}`);
    return new Response(JSON.stringify({ error: 'authentication_failed' }), { status: 401, headers: corsHeaders });
  }
});
