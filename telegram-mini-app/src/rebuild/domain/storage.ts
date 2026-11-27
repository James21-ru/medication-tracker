import { normalizeLifeCareData, type LifeCareData } from './models.ts';
import { copy, equal } from './sync-merge.ts';
import { validData, type SyncEnvelope, type SyncStorage } from './sync-controller.ts';

const databaseName = 'lifecare-mini-app';
const storeName = 'state';

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Хранилище занято другим окном.'));
  });
}
async function read(key: string): Promise<unknown> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => { database.close(); resolve(request.result); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}
async function write(key: string, value?: SyncEnvelope) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    if (value) transaction.objectStore(storeName).put(value, key);
    else transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = transaction.onabort = () => { database.close(); reject(transaction.error); };
  });
}
function envelope(value: unknown): SyncEnvelope | null {
  if (value == null) return null;
  const saved = value as SyncEnvelope;
  if (saved.version !== 1 || !validData(saved.data) || !validData(saved.base) || !Number.isSafeInteger(saved.sequence) || saved.sequence < 0 || !(saved.revision === null || (Number.isSafeInteger(saved.revision) && saved.revision >= 0)) || typeof saved.pending !== 'boolean') throw new Error('Не удалось прочитать сохраненную копию. Исходные данные не изменены.');
  return saved;
}
export function createBrowserSyncStorage(key: string): SyncStorage {
  return {
    async load() {
      const copies: SyncEnvelope[] = [];
      let accessible = false;
      let malformed: unknown = null;
      try { const raw = localStorage.getItem(key); accessible = true; const saved = envelope(raw ? JSON.parse(raw) : null); if (saved) copies.push(saved); } catch (error) { malformed = error; }
      try { const raw = await read(key); accessible = true; const saved = envelope(raw); if (saved) copies.push(saved); } catch (error) { malformed ??= error; }
      if (!accessible || (!copies.length && malformed)) throw malformed ?? new Error('Хранилище устройства недоступно.');
      copies.sort((a, b) => b.sequence - a.sequence);
      if (copies.length === 2 && copies[0].sequence === copies[1].sequence && !equal(copies[0], copies[1])) throw new Error('На устройстве найдены две разные копии одной версии. Они сохранены без изменений.');
      return copies[0] ? copy(copies[0]) : null;
    },
    async save(value) {
      let saved = false;
      try { localStorage.setItem(key, JSON.stringify(value)); saved = true; } catch { /* Проверяем второе хранилище перед сообщением об ошибке. */ }
      try { await write(key, value); saved = true; } catch { /* Синхронная локальная копия могла уже сохраниться. */ }
      if (!saved) throw new Error('Не удалось сохранить изменения на устройстве. Освободите место и повторите попытку.');
    },
    async clear() {
      const results = await Promise.allSettled([Promise.resolve().then(() => localStorage.removeItem(key)), write(key)]);
      if (results.some((item) => item.status === 'rejected')) throw new Error('Не удалось полностью очистить копию на устройстве.');
    },
  };
}

function migrateLegacy(value: unknown): LifeCareData | null {
  if (validData(value)) return normalizeLifeCareData(value);
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || !Array.isArray(data.cabinets) || !Array.isArray(data.medications) || !Array.isArray(data.packages)) return null;
  return normalizeLifeCareData({ ...data, version: 2, schedules: [], doseRecords: [] });
}
export async function readLegacyData(): Promise<LifeCareData[]> {
  const found: LifeCareData[] = [];
  // У этих копий нет привязки к аккаунту. Импорт требует явного выбора.
  // Исходники не удаляются и не присваиваются пользователю автоматически.
  try { const raw = localStorage.getItem('lifecare-mini-app-v1-fallback'); const value = migrateLegacy(raw ? JSON.parse(raw) : null); if (value) found.push(value); } catch { /* Исходная копия сохранена без изменений. */ }
  try { const value = migrateLegacy(await read('current')); if (value && !found.some((item) => equal(item, value))) found.push(value); } catch { /* Исходная копия сохранена без изменений. */ }
  return found.filter((value) => value.cabinets.length || value.medications.length);
}
