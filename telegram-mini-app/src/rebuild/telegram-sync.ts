import type { LifeCareData } from './domain/models';
import { telegramApp } from '../telegram';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '');
const endpoint = supabaseUrl ? `${supabaseUrl}/functions/v1/telegram-mini-session` : null;

type SyncResult = { status: 'synced'; has_data?: boolean; state?: LifeCareData };

export function telegramSyncAvailable() {
  return Boolean(endpoint && telegramApp()?.initData);
}

async function callBotSync(mutation: Record<string, unknown>): Promise<SyncResult> {
  const initData = telegramApp()?.initData;
  if (!endpoint || !initData) throw new Error('Синхронизация доступна только внутри Telegram.');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ init_data: initData, mutation }),
  });
  if (!response.ok) throw new Error('Не удалось синхронизировать данные с ботом.');
  return response.json() as Promise<SyncResult>;
}

export const telegramSync = {
  load: () => callBotSync({ type: 'get_rebuild_state' }),
  save: (state: LifeCareData) => callBotSync({ type: 'sync_rebuild_state', state, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow' }),
};
