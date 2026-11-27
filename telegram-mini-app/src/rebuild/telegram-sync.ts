import type { LifeCareData } from './domain/models';
import { syncStorageKey, type RemoteState, type SyncTransport } from './domain/sync-controller';
import { telegramApp } from '../telegram';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, '');
const endpoint = supabaseUrl ? `${supabaseUrl}/functions/v1/telegram-mini-session` : null;
export type TelegramSyncIdentity = { key: string; userId: string; endpoint: string };

export function telegramSyncIdentity(): TelegramSyncIdentity | null {
  if (!endpoint) return null;
  try {
    const initData = telegramApp()?.initData;
    if (!initData) return null;
    const user = JSON.parse(new URLSearchParams(initData).get('user') ?? 'null') as { id?: unknown } | null;
    const id = user?.id;
    if (!(typeof id === 'number' && Number.isSafeInteger(id) && id > 0) && !(typeof id === 'string' && /^[1-9]\d*$/.test(id))) return null;
    const userId = String(id);
    return { key: syncStorageKey(endpoint, userId), userId, endpoint };
  } catch { return null; }
}

export function createTelegramSync(identity: TelegramSyncIdentity): SyncTransport {
  async function request(mutation: Record<string, unknown>) {
    const current = telegramSyncIdentity();
    if (current?.key !== identity.key) throw new Error('Аккаунт Telegram изменился. Откройте приложение заново.');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(identity.endpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ init_data: telegramApp()!.initData, mutation }),
      });
      if (!response.ok) {
        const error = new Error(response.status === 401 || response.status === 403 ? 'Не удалось подтвердить аккаунт. Закройте приложение и откройте через Telegram.' : response.status === 409 ? 'Данные изменились на другом устройстве.' : 'Сервер не подтвердил сохранение. Изменения остаются на устройстве.') as Error & { status: number };
        error.status = response.status;
        throw error;
      }
      if (telegramSyncIdentity()?.key !== identity.key) throw new Error('Аккаунт Telegram изменился.');
      return await response.json();
    } finally { window.clearTimeout(timeout); }
  }
  return {
    load: () => request({ type: 'get_rebuild_state' }) as Promise<RemoteState>,
    save: (state: LifeCareData, expectedRevision: number) => request({ type: 'sync_rebuild_state', state, expected_revision: expectedRevision, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow' }) as Promise<{ revision: number }>,
  };
}
