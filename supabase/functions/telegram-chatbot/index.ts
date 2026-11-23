import postgres from 'npm:postgres@3.4.9';

type TelegramMessage = {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number };
  text?: string;
};
type TelegramUpdate = {
  message?: TelegramMessage;
  callback_query?: { id: string; data?: string; from: { id: number }; message?: TelegramMessage };
};
type DueDose = {
  telegram_user_id: number;
  chat_id: number;
  dose_id: string;
  medication_id: string;
  medication_name: string;
  scheduled_time: string;
  quantity: number;
  unit: string;
  form: string;
  amount: string;
};
type MiniState = { version: 2; medications: Array<{ id: string; name: string; form: string; packageDose?: string | null }>; packages: Array<{ medicationId: string; quantity: number; unit: string; expiresOn: string | null }>; schedules: Array<{ id: string; medicationId: string; frequency: string; startOn: string; endOn: string | null; weekdays: number[]; intervalDays: number | null; activeDays: number | null; restDays: number | null; active: boolean; times: Array<{ id: string; time: string; quantity: number; unit: string }> }>; doseRecords: Array<{ slotId: string; status: 'taken' | 'skipped'; medicationId: string; date: string; time: string; quantity: number; unit: string; completedAt: string }> };
type SubscriptionState = { telegram_user_id: number; chat_id: number; time_zone: string; payload: MiniState };

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function equals(left: string | null, right: string) {
  if (!left || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

function sqlClient() {
  return postgres(Deno.env.get('LIFECARE_DB_URL') ?? requiredEnv('SUPABASE_DB_URL'), { prepare: false, max: 1, idle_timeout: 20 });
}

async function telegram(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${requiredEnv('TELEGRAM_BOT_TOKEN')}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const result = await response.json() as { ok?: boolean; result?: { message_id?: number } };
  if (!response.ok || !result.ok) throw new Error(`telegram ${method} failed`);
  return result.result;
}

const appButton = () => {
  const url = Deno.env.get('MINI_APP_URL');
  return url ? { inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url } }]] } : undefined;
};

async function sendWelcome(chatId: number) {
  await telegram('sendMessage', {
    chat_id: chatId,
    text: 'Добро пожаловать в LifeCare!\n\nЯ буду бережно напоминать о запланированных приёмах. В сообщении можно сразу отметить «Принять» или отложить напоминание — запас и история обновятся в приложении.\n\nНастройте препараты и график в мини-приложении. Отключить уведомления можно командой /stop.',
    reply_markup: appButton(),
  });
}

async function handleMessage(sql: ReturnType<typeof postgres>, message: TelegramMessage) {
  if (message.chat.type !== 'private' || !message.from) return;
  const command = message.text?.trim().split(/\s+/)[0]?.replace(/@[^\s]+$/, '') ?? '';
  if (command === '/start') {
    await sql`
      insert into mobile_auth.telegram_notification_subscriptions (telegram_user_id, chat_id, active)
      values (${message.from.id}, ${message.chat.id}, true)
      on conflict (telegram_user_id) do update
      set chat_id = excluded.chat_id, active = true, updated_at = now()`;
    await sendWelcome(message.chat.id);
    return;
  }
  if (command === '/stop') {
    await sql`update mobile_auth.telegram_notification_subscriptions set active = false, updated_at = now() where telegram_user_id = ${message.from.id} and chat_id = ${message.chat.id}`;
    await telegram('sendMessage', { chat_id: message.chat.id, text: 'Напоминания остановлены. Вернуть их можно командой /start.', reply_markup: appButton() });
    return;
  }
  if (command === '/notifications') {
    const rows = await sql<{ active: boolean }[]>`select active from mobile_auth.telegram_notification_subscriptions where telegram_user_id = ${message.from.id} and chat_id = ${message.chat.id}`;
    await telegram('sendMessage', { chat_id: message.chat.id, text: rows[0]?.active ? 'Напоминания включены. Чтобы остановить их, отправьте /stop.' : 'Напоминания выключены. Чтобы включить их, отправьте /start.', reply_markup: appButton() });
  }
}

async function completeDose(sql: ReturnType<typeof postgres>, telegramUserId: number, doseId: string, status: 'taken' | 'skipped') {
  const saved = await completeMiniAppDose(sql, telegramUserId, doseId, status);
  if (saved) return saved;
  const account = await sql<{ user_id: string }[]>`select user_id from mobile_auth.telegram_accounts where telegram_user_id = ${telegramUserId}`;
  const ownerId = account[0]?.user_id;
  if (!ownerId) return { ok: false, message: 'Сначала откройте мини-приложение, чтобы связать чат с аптечкой.' };
  return await sql.begin(async (transaction) => {
    const rows = await transaction<{ medication_id: string; quantity: number; unit: string; status: 'pending' | 'taken' | 'skipped' }[]>`
      select medication_id, quantity, unit, status from public.dose_events
      where id = ${doseId} and owner_id = ${ownerId} for update`;
    const dose = rows[0];
    if (!dose) return { ok: false, message: 'Этот приём уже недоступен.' };
    if (dose.status !== 'pending') return { ok: true, message: dose.status === 'taken' ? 'Этот приём уже отмечен как принятый.' : 'Этот приём уже отмечен как пропущенный.' };
    if (status === 'skipped') {
      await transaction`update public.dose_events set status = 'skipped', completed_at = now() where id = ${doseId} and owner_id = ${ownerId}`;
      return { ok: true, message: 'Приём отмечен как пропущенный.' };
    }
    const packs = await transaction<{ id: string; quantity_remaining: number }[]>`
      select id, quantity_remaining from public.medication_packages
      where medication_id = ${dose.medication_id} and owner_id = ${ownerId} and unit = ${dose.unit}
        and quantity_remaining > 0 and (expires_on is null or expires_on >= current_date) and deleted_at is null
      order by expires_on nulls last for update`;
    const available = packs.reduce((sum, item) => sum + Number(item.quantity_remaining), 0);
    if (available < Number(dose.quantity)) return { ok: false, message: `Недостаточно препарата в аптечке: доступно ${available} ${dose.unit}.` };
    await transaction`update public.dose_events set status = 'taken', completed_at = now() where id = ${doseId} and owner_id = ${ownerId}`;
    let remaining = Number(dose.quantity);
    for (const pack of packs) {
      if (remaining <= 0) break;
      const used = Math.min(remaining, Number(pack.quantity_remaining));
      await transaction`update public.medication_packages set quantity_remaining = quantity_remaining - ${used} where id = ${pack.id} and owner_id = ${ownerId}`;
      remaining -= used;
    }
    return { ok: true, message: 'Приём отмечен как принятый.' };
  });
}

function dateInZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function occursOn(schedule: MiniState['schedules'][number], date: string) {
  if (!schedule.active || schedule.frequency === 'as-needed' || date < schedule.startOn || (schedule.endOn && date > schedule.endOn)) return false;
  if (schedule.frequency === 'daily') return true;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (schedule.frequency === 'weekdays') return schedule.weekdays.includes(weekday);
  const days = Math.floor((new Date(`${date}T12:00:00Z`).getTime() - new Date(`${schedule.startOn}T12:00:00Z`).getTime()) / 86_400_000);
  if (schedule.frequency === 'interval') return days >= 0 && days % Math.max(2, schedule.intervalDays ?? 2) === 0;
  const active = Math.max(1, schedule.activeDays ?? 1);
  const rest = Math.max(1, schedule.restDays ?? 1);
  return days >= 0 && days % (active + rest) < active;
}

async function completeMiniAppDose(sql: ReturnType<typeof postgres>, telegramUserId: number, doseId: string, status: 'taken' | 'skipped') {
  return await sql.begin(async (transaction) => {
    const rows = await transaction<{ payload: MiniState }[]>`select payload from mobile_auth.telegram_mini_app_states where telegram_user_id = ${telegramUserId} for update`;
    const state = rows[0]?.payload;
    if (!state) return null;
    const match = /^(.+):([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(doseId);
    const schedule = match ? state.schedules.find((item) => item.id === match[1]) : undefined;
    const time = schedule?.times.find((item) => item.id === match?.[2]);
    if (!schedule || !time || !match) return { ok: false, message: 'Этот приём уже недоступен.' };
    const existing = state.doseRecords.find((item) => item.slotId === doseId);
    if (existing) return { ok: true, message: existing.status === 'taken' ? 'Этот приём уже отмечен как принятый.' : 'Этот приём уже отмечен как пропущенный.' };
    if (status === 'taken') {
      const today = match[3];
      const packages = state.packages.filter((item) => item.medicationId === schedule.medicationId && item.unit === time.unit && item.quantity > 0 && (!item.expiresOn || item.expiresOn >= today));
      const available = packages.reduce((sum, item) => sum + Number(item.quantity), 0);
      if (available < Number(time.quantity)) return { ok: false, message: `Недостаточно препарата в аптечке: доступно ${available} ${time.unit}.` };
      let remaining = Number(time.quantity);
      for (const pack of packages.sort((left, right) => (left.expiresOn ?? '9999-12-31').localeCompare(right.expiresOn ?? '9999-12-31'))) { const used = Math.min(remaining, Number(pack.quantity)); pack.quantity -= used; remaining -= used; }
    }
    state.doseRecords.push({ slotId: doseId, status, medicationId: schedule.medicationId, date: match[3], time: time.time, quantity: time.quantity, unit: time.unit, completedAt: new Date().toISOString() });
    await transaction`update mobile_auth.telegram_mini_app_states set payload = ${JSON.stringify(state)}::jsonb, revision = revision + 1, updated_at = now() where telegram_user_id = ${telegramUserId}`;
    return { ok: true, message: status === 'taken' ? 'Приём отмечен как принятый.' : 'Приём отмечен как пропущенный.' };
  });
}

async function handleCallback(sql: ReturnType<typeof postgres>, callback: NonNullable<TelegramUpdate['callback_query']>) {
  const match = /^(taken|skipped|defer):(.{1,160})$/.exec(callback.data ?? '');
  if (!match) return;
  const [, action, doseId] = match;
  if (action === 'defer') {
    await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: 'Хорошо, напомню ещё раз через 20 минут.' });
    return;
  }
  const result = await completeDose(sql, callback.from.id, doseId, action === 'taken' ? 'taken' : 'skipped');
  await telegram('answerCallbackQuery', { callback_query_id: callback.id, text: result.message, show_alert: !result.ok });
  if (callback.message) await telegram('editMessageReplyMarkup', { chat_id: callback.message.chat.id, message_id: callback.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
}

async function deliverDose(sql: ReturnType<typeof postgres>, dose: DueDose, kind: 'dose' | 'repeat') {
  const text = kind === 'dose'
    ? `Время приёма: ${dose.medication_name}\n${dose.quantity} ${dose.unit} · ${dose.form}${dose.amount ? ` ${dose.amount}` : ''}\nЗапланировано на ${dose.scheduled_time.slice(0, 5)}.`
    : `Напоминание: отметьте приём «${dose.medication_name}», когда будете готовы.`;
  const result = await telegram('sendMessage', {
    chat_id: dose.chat_id,
    text,
    reply_markup: { inline_keyboard: [[
      { text: 'Принять', callback_data: `taken:${dose.dose_id}` },
      { text: 'Отложить', callback_data: `defer:${dose.dose_id}` },
    ], ...(appButton()?.inline_keyboard ?? [])] },
  });
  await sql`
    insert into mobile_auth.telegram_notification_deliveries (telegram_user_id, dose_event_id, kind, telegram_message_id)
    values (${dose.telegram_user_id}, ${dose.dose_id}, ${kind}, ${result?.message_id ?? null})
    on conflict (telegram_user_id, dose_event_id, kind) do nothing`;
}

async function runScheduler(sql: ReturnType<typeof postgres>) {
  // A two-minute window tolerates cron delays; delivery keys make each
  // notification idempotent even if more than one scheduler invocation runs.
  const subscriptions = await sql<SubscriptionState[]>`
    select s.telegram_user_id, s.chat_id, s.time_zone, state.payload
    from mobile_auth.telegram_notification_subscriptions s
    join mobile_auth.telegram_mini_app_states state on state.telegram_user_id = s.telegram_user_id
    where s.active and s.dose_reminders`;
  const due: DueDose[] = [];
  for (const subscription of subscriptions) {
    const now = new Intl.DateTimeFormat('en-GB', { timeZone: subscription.time_zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    const date = dateInZone(subscription.time_zone);
    for (const schedule of subscription.payload.schedules.filter((item) => occursOn(item, date))) {
      const medication = subscription.payload.medications.find((item) => item.id === schedule.medicationId);
      if (!medication) continue;
      for (const time of schedule.times) {
        const doseId = `${schedule.id}:${time.id}:${date}`;
        if (time.time !== now || subscription.payload.doseRecords.some((record) => record.slotId === doseId)) continue;
        due.push({ telegram_user_id: subscription.telegram_user_id, chat_id: subscription.chat_id, dose_id: doseId, medication_id: medication.id, medication_name: medication.name, scheduled_time: time.time, quantity: time.quantity, unit: time.unit, form: medication.form, amount: medication.packageDose ?? '' });
      }
    }
  }
  for (const dose of due) await deliverDose(sql, dose, 'dose');
  const repeatCandidates = await sql<Array<SubscriptionState & { dose_id: string }>>`
    select s.telegram_user_id, s.chat_id, s.time_zone, state.payload, main.dose_event_id as dose_id
    from mobile_auth.telegram_notification_subscriptions s
    join mobile_auth.telegram_mini_app_states state on state.telegram_user_id = s.telegram_user_id
    join mobile_auth.telegram_notification_deliveries main on main.telegram_user_id = s.telegram_user_id and main.kind = 'dose' and main.created_at <= now() - interval '20 minutes'
    left join mobile_auth.telegram_notification_deliveries repeated on repeated.telegram_user_id = s.telegram_user_id and repeated.dose_event_id = main.dose_event_id and repeated.kind = 'repeat'
    where s.active and s.repeated_reminders and repeated.id is null`;
  const repeats: DueDose[] = repeatCandidates.flatMap((candidate) => {
    if (candidate.payload.doseRecords.some((record) => record.slotId === candidate.dose_id)) return [];
    const match = /^(.+):([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(candidate.dose_id);
    const schedule = match ? candidate.payload.schedules.find((item) => item.id === match[1]) : undefined;
    const time = schedule?.times.find((item) => item.id === match?.[2]);
    const medication = schedule ? candidate.payload.medications.find((item) => item.id === schedule.medicationId) : undefined;
    return schedule && time && medication ? [{ telegram_user_id: candidate.telegram_user_id, chat_id: candidate.chat_id, dose_id: candidate.dose_id, medication_id: medication.id, medication_name: medication.name, scheduled_time: time.time, quantity: time.quantity, unit: time.unit, form: medication.form, amount: medication.packageDose ?? '' }] : [];
  });
  for (const dose of repeats) await deliverDose(sql, dose, 'repeat');
  return { delivered: due.length, repeated: repeats.length };
}

Deno.serve(async (request) => {
  let sql: ReturnType<typeof postgres> | null = null;
  try {
    const route = new URL(request.url).pathname.split('/').at(-1);
    if (request.method === 'GET' && route === 'health') return json({ ok: true });
    sql = sqlClient();
    if (route === 'cron') {
      if (!equals(request.headers.get('x-lifecare-cron-secret'), requiredEnv('CHATBOT_CRON_SECRET'))) return json({ error: 'unauthorized' }, 401);
      return json(await runScheduler(sql));
    }
    if (route === 'webhook' && request.method === 'POST') {
      if (!equals(request.headers.get('x-telegram-bot-api-secret-token'), requiredEnv('TELEGRAM_WEBHOOK_SECRET'))) return json({ error: 'unauthorized' }, 401);
      const update = await request.json() as TelegramUpdate;
      if (update.message) await handleMessage(sql, update.message);
      if (update.callback_query) await handleCallback(sql, update.callback_query);
      return json({ ok: true });
    }
    return json({ error: 'not_found' }, 404);
  } catch (error) {
    console.error(`[telegram-chatbot] ${error instanceof Error ? error.message : String(error)}`);
    return json({ error: 'temporary_failure' }, 503);
  } finally {
    if (sql) await sql.end({ timeout: 1 });
  }
});
