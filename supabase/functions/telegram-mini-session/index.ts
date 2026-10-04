import { createClient } from 'npm:@supabase/supabase-js@2.117.0';
import postgres from 'npm:postgres@3.4.9';

type TelegramUser = { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string };
type Mutation =
  | { type: 'create_medication'; medication_id: string; package_id: string; name: string; form: string; amount: string; medication_unit: string; color: string; quantity: number; stock_unit: string; expires_on: string | null; schedules: Array<{ id: string; time: string; quantity: number }>; start_on: string }
  | { type: 'add_package'; medication_id: string; package_id: string; quantity: number; stock_unit: string; expires_on: string | null }
  | { type: 'complete_dose'; dose_id: string; status: 'taken' | 'skipped' };

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
  const legacy = Deno.env.get('LIFECARE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get('LIFECARE_SECRET_KEYS') ?? Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  const key = keys.default ?? Object.values(keys)[0];
  if (!key) throw new Error('LIFECARE_SERVICE_ROLE_KEY / LIFECARE_SECRET_KEYS is not configured');
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

async function ensureTelegramAccount(client: ReturnType<typeof createClient>, sql: ReturnType<typeof postgres>, user: TelegramUser) {
  const email = `telegram-${user.id}@telegram.lifecare.invalid`;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;
  const metadata = { full_name: name, telegram_id: user.id, telegram_username: user.username ?? null, avatar_url: user.photo_url ?? null };
  const accounts = await sql<{ user_id: string }[]>`select user_id from mobile_auth.telegram_accounts where telegram_user_id = ${user.id}`;
  let userId = accounts[0]?.user_id;
  if (!userId) {
    const { data: created, error: createError } = await client.auth.admin.createUser({ email, email_confirm: true, user_metadata: metadata });
    if (createError && createError.code !== 'email_exists') throw new Error(`create user: ${createError.message}`);
    if (created.user) userId = created.user.id;
    else {
      // A legacy account can predate telegram_accounts. Resolve it once and
      // establish the mapping; future mutations never issue a login link.
      const { data, error } = await client.auth.admin.generateLink({ type: 'magiclink', email });
      if (error || !data?.user) throw new Error(`resolve user: ${error?.message ?? 'empty response'}`);
      userId = data.user.id;
    }
  }
  const { error: updateError } = await client.auth.admin.updateUserById(userId, { user_metadata: metadata });
  if (updateError) throw new Error(`update user: ${updateError.message}`);
  await sql`
    insert into mobile_auth.telegram_accounts (user_id, telegram_user_id, display_name)
    values (${userId}, ${user.id}, ${name})
    on conflict (user_id) do update
      set telegram_user_id = excluded.telegram_user_id,
          display_name = excluded.display_name,
          updated_at = now()`;
  return { email, userId };
}

async function issueLoginToken(client: ReturnType<typeof createClient>, sql: ReturnType<typeof postgres>, user: TelegramUser) {
  const account = await ensureTelegramAccount(client, sql, user);
  const { data, error } = await client.auth.admin.generateLink({ type: 'magiclink', email: account.email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) throw new Error(`generate link: ${error?.message ?? 'empty response'}`);
  return { tokenHash, userId: account.userId };
}

function nonEmpty(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`invalid ${field}`);
  return value.trim();
}

function identifier(value: unknown, field: string) {
  const result = nonEmpty(value, field);
  if (result.length > 160) throw new Error(`invalid ${field}`);
  return result;
}

function dateOnly(value: unknown, field: string) {
  const result = nonEmpty(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error(`invalid ${field}`);
  const [year, month, day] = result.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw new Error(`invalid ${field}`);
  return result;
}

function timeOnly(value: unknown, field: string) {
  const result = nonEmpty(value, field);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) throw new Error(`invalid ${field}`);
  return result;
}

function parseMutation(value: unknown): Mutation {
  if (!value || typeof value !== 'object') throw new Error('invalid mutation');
  const input = value as Record<string, unknown>;
  if (input.type === 'create_medication' || input.type === 'add_package') {
    const quantity = Number(input.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('invalid quantity');
    let expiresOn: string | null;
    if (input.expires_on === null) expiresOn = null;
    else if (typeof input.expires_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.expires_on)) expiresOn = input.expires_on;
    else throw new Error('invalid expires_on');
    const medicationId = identifier(input.medication_id, 'medication_id');
    const packageId = identifier(input.package_id, 'package_id');
    const stockUnit = nonEmpty(input.stock_unit, 'stock_unit');
    if (input.type === 'add_package') return { type: 'add_package', medication_id: medicationId, package_id: packageId, quantity, stock_unit: stockUnit, expires_on: expiresOn };
    if (!Array.isArray(input.schedules) || input.schedules.length === 0 || input.schedules.length > 8) throw new Error('invalid schedules');
    const schedules = input.schedules.map((schedule, index) => {
      if (!schedule || typeof schedule !== 'object') throw new Error('invalid schedule');
      const value = schedule as Record<string, unknown>;
      const doseQuantity = Number(value.quantity);
      if (!Number.isFinite(doseQuantity) || doseQuantity <= 0) throw new Error(`invalid schedules[${index}].quantity`);
      return { id: identifier(value.id, `schedules[${index}].id`), time: timeOnly(value.time, `schedules[${index}].time`), quantity: doseQuantity };
    });
    if (new Set(schedules.map((schedule) => schedule.id)).size !== schedules.length) throw new Error('duplicate schedule ids');
    return { type: 'create_medication', medication_id: medicationId, package_id: packageId, name: nonEmpty(input.name, 'name'), form: nonEmpty(input.form, 'form'), amount: nonEmpty(input.amount, 'amount'), medication_unit: nonEmpty(input.medication_unit, 'medication_unit'), color: nonEmpty(input.color, 'color'), quantity, stock_unit: stockUnit, expires_on: expiresOn, schedules, start_on: dateOnly(input.start_on, 'start_on') };
  }
  if (input.type === 'complete_dose' && (input.status === 'taken' || input.status === 'skipped')) return { type: 'complete_dose', dose_id: identifier(input.dose_id, 'dose_id'), status: input.status };
  throw new Error('invalid mutation');
}

async function runMutation(sql: ReturnType<typeof postgres>, ownerId: string, mutation: Mutation) {
  if (mutation.type === 'create_medication') {
    await sql.begin(async (transaction) => {
      await transaction`insert into public.medications (id, owner_id, name, form, amount, unit, color, created_at) values (${mutation.medication_id}, ${ownerId}, ${mutation.name}, ${mutation.form}, ${mutation.amount}, ${mutation.medication_unit}, ${mutation.color}, now())`;
      await transaction`insert into public.medication_packages (id, owner_id, medication_id, quantity_initial, quantity_remaining, unit, expires_on, created_at) values (${mutation.package_id}, ${ownerId}, ${mutation.medication_id}, ${mutation.quantity}, ${mutation.quantity}, ${mutation.stock_unit}, ${mutation.expires_on}, now())`;
      for (const schedule of mutation.schedules) {
        await transaction`insert into public.medication_schedules (id, owner_id, medication_id, kind, weekdays_json, scheduled_time, dose_quantity, dose_unit, start_on, interval_days, cycle_on_days, cycle_off_days, active, created_at) values (${schedule.id}, ${ownerId}, ${mutation.medication_id}, 'daily', ${JSON.stringify([0, 1, 2, 3, 4, 5, 6])}::jsonb, ${schedule.time}, ${schedule.quantity}, ${mutation.stock_unit}, ${mutation.start_on}, 1, 1, 0, true, now())`;
        await transaction`
          insert into public.dose_events (id, owner_id, schedule_id, medication_id, scheduled_on, scheduled_time, quantity, unit, status, source, created_at)
          select
            ${schedule.id} || '-dose-' || to_char(day, 'YYYYMMDD'),
            ${ownerId}, ${schedule.id}, ${mutation.medication_id}, day::date,
            ${schedule.time}, ${schedule.quantity}, ${mutation.stock_unit},
            'pending', 'schedule', now()
          from generate_series(${mutation.start_on}::date, ${mutation.start_on}::date + 365, interval '1 day') as days(day)
          on conflict (id) do nothing`;
      }
    });
    return { status: 'created' };
  }
  if (mutation.type === 'add_package') {
    await sql.begin(async (transaction) => {
      const medications = await transaction<{ id: string }[]>`select id from public.medications where id = ${mutation.medication_id} and owner_id = ${ownerId} and deleted_at is null for update`;
      if (!medications[0]) throw new Error('medication not found');
      await transaction`insert into public.medication_packages (id, owner_id, medication_id, quantity_initial, quantity_remaining, unit, expires_on, created_at) values (${mutation.package_id}, ${ownerId}, ${mutation.medication_id}, ${mutation.quantity}, ${mutation.quantity}, ${mutation.stock_unit}, ${mutation.expires_on}, now())`;
    });
    return { status: 'created' };
  }

  return await sql.begin(async (transaction) => {
    const doses = await transaction<{ medication_id: string; quantity: number; unit: string; status: string }[]>`select medication_id, quantity, unit, status from public.dose_events where id = ${mutation.dose_id} and owner_id = ${ownerId} for update`;
    const dose = doses[0];
    if (!dose) throw new Error('dose not found');
    if (dose.status !== 'pending') return { status: 'already_completed' };
    if (mutation.status === 'skipped') {
      await transaction`update public.dose_events set status = 'skipped', completed_at = now() where id = ${mutation.dose_id} and owner_id = ${ownerId} and status = 'pending'`;
      return { status: 'skipped' };
    }
    const packs = await transaction<{ id: string; quantity_remaining: number }[]>`select id, quantity_remaining from public.medication_packages where medication_id = ${dose.medication_id} and owner_id = ${ownerId} and unit = ${dose.unit} and quantity_remaining > 0 and (expires_on is null or expires_on >= current_date) and deleted_at is null order by expires_on nulls last for update`;
    const available = packs.reduce((sum, pack) => sum + Number(pack.quantity_remaining), 0);
    if (available < Number(dose.quantity)) return { status: 'insufficient_stock', available, unit: dose.unit };
    await transaction`update public.dose_events set status = 'taken', completed_at = now() where id = ${mutation.dose_id} and owner_id = ${ownerId} and status = 'pending'`;
    let remaining = Number(dose.quantity);
    for (const pack of packs) {
      if (remaining <= 0) break;
      const used = Math.min(remaining, Number(pack.quantity_remaining));
      await transaction`update public.medication_packages set quantity_remaining = quantity_remaining - ${used} where id = ${pack.id} and owner_id = ${ownerId}`;
      remaining -= used;
    }
    return { status: 'taken' };
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: corsHeaders });
  let sql: ReturnType<typeof postgres> | null = null;
  try {
    const body = await request.json() as { init_data?: unknown; mutation?: unknown };
    if (typeof body.init_data !== 'string') throw new Error('missing init data');
    const user = await verifyInitData(body.init_data, requiredEnv('TELEGRAM_BOT_TOKEN'));
    const supabase = createClient(requiredEnv('SUPABASE_URL'), serviceKey(), { auth: { autoRefreshToken: false, persistSession: false } });
    sql = postgres(Deno.env.get('LIFECARE_DB_URL') ?? requiredEnv('SUPABASE_DB_URL'), { prepare: false, max: 1, idle_timeout: 20 });
    if (body.mutation) {
      const account = await ensureTelegramAccount(supabase, sql, user);
      const result = await runMutation(sql, account.userId, parseMutation(body.mutation));
      return new Response(JSON.stringify(result), { headers: corsHeaders });
    }
    const session = await issueLoginToken(supabase, sql, user);
    return new Response(JSON.stringify({ token_hash: session.tokenHash }), { headers: corsHeaders });
  } catch (error) {
    console.error(`[telegram-mini-session] ${error instanceof Error ? error.message : String(error)}`);
    return new Response(JSON.stringify({ error: 'authentication_failed' }), { status: 401, headers: corsHeaders });
  } finally {
    if (sql) await sql.end({ timeout: 1 });
  }
});
