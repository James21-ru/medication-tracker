import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import { emptyData, type LifeCareData } from '../src/rebuild/domain/models.ts';
import { createBrowserSyncStorage, readLegacyData } from '../src/rebuild/domain/storage.ts';
import { createSyncController, syncStorageKey, type SyncEnvelope } from '../src/rebuild/domain/sync-controller.ts';

const copy = <T>(value: T): T => structuredClone(value);
const endpoint = 'https://example.test/functions/v1/telegram-mini-session';
const data = (...ids: string[]): LifeCareData => ({ ...emptyData(), cabinets: ids.map((id) => ({ id, name: id, createdAt: '2026-11-26T08:00:00.000Z' })) });
const envelope = (value: LifeCareData, sequence = 1, pending = false): SyncEnvelope => ({ version: 1, data: copy(value), base: pending ? emptyData() : copy(value), revision: pending ? null : 1, pending, sequence });

function browserStorage(t: TestContext) {
  const local = new Map<string, string>();
  const indexed = new Map<string, unknown>();
  const availability = { local: true, indexed: true };
  const previousLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const previousIndexed = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem(key: string) { if (!availability.local) throw new Error('Хранилище недоступно'); return local.get(key) ?? null; },
    setItem(key: string, value: string) { if (!availability.local) throw new Error('Хранилище недоступно'); local.set(key, value); },
    removeItem(key: string) { if (!availability.local) throw new Error('Хранилище недоступно'); local.delete(key); },
  } });
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {
    open() {
      const request: Record<string, any> = {};
      queueMicrotask(() => {
        if (!availability.indexed) { request.error = new Error('База недоступна'); request.onerror?.(); return; }
        request.result = {
          close() {},
          transaction() {
            const transaction: Record<string, any> = {};
            transaction.objectStore = () => ({
              get(key: string) {
                const read: Record<string, any> = {};
                queueMicrotask(() => { read.result = copy(indexed.get(key)); read.onsuccess?.(); });
                return read;
              },
              put(value: unknown, key: string) { indexed.set(key, copy(value)); queueMicrotask(() => transaction.oncomplete?.()); },
              delete(key: string) { indexed.delete(key); queueMicrotask(() => transaction.oncomplete?.()); },
            });
            return transaction;
          },
        };
        request.onsuccess?.();
      });
      return request;
    },
  } });
  t.after(() => {
    if (previousLocal) Object.defineProperty(globalThis, 'localStorage', previousLocal);
    else Reflect.deleteProperty(globalThis, 'localStorage');
    if (previousIndexed) Object.defineProperty(globalThis, 'indexedDB', previousIndexed);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  });
  return { local, indexed, availability };
}

test('Два аккаунта в одном браузере загружают только свои сохраненные аптечки', async (t) => {
  browserStorage(t);
  const first = createBrowserSyncStorage(syncStorageKey(endpoint, '1001'));
  const second = createBrowserSyncStorage(syncStorageKey(endpoint, '1002'));
  const otherServer = createBrowserSyncStorage(syncStorageKey('https://other.test/functions/v1/telegram-mini-session', '1001'));
  await first.save(envelope(data('first')));
  assert.equal(await second.load(), null);
  await second.save(envelope(data('second'), 4, true));
  assert.deepEqual((await first.load())!.data, data('first'));
  assert.deepEqual((await second.load())!.data, data('second'));
  assert.equal(await otherServer.load(), null);
});

test('Старые аптечки доступны для явного импорта и не присваиваются вошедшему аккаунту', async (t) => {
  const { local, indexed } = browserStorage(t);
  const legacyLocal = data('legacy-local');
  const legacyIndexed = data('legacy-indexed');
  local.set('lifecare-mini-app-v1-fallback', JSON.stringify(legacyLocal));
  indexed.set('current', copy(legacyIndexed));
  const storage = createBrowserSyncStorage(syncStorageKey(endpoint, '1001'));
  const writes: LifeCareData[] = [];
  const controller = createSyncController({ storage, transport: {
    async load() { return { has_data: false, revision: 0 }; },
    async save(value) { writes.push(copy(value)); return { revision: 1 }; },
  } });
  t.after(() => controller.dispose());
  await controller.start();
  assert.deepEqual(controller.getSnapshot().data, emptyData());
  assert.deepEqual(writes, []);
  assert.deepEqual(await readLegacyData(), [legacyLocal, legacyIndexed]);
  assert.deepEqual(JSON.parse(local.get('lifecare-mini-app-v1-fallback')!), legacyLocal);
  assert.deepEqual(indexed.get('current'), legacyIndexed);
});

test('Более новая меньшая копия имеет приоритет над старой копией с удаленными записями', async (t) => {
  const { local, indexed } = browserStorage(t);
  const key = syncStorageKey(endpoint, '1001');
  const current = envelope(data('home'), 9, true);
  const old = envelope(data('home', 'removed'), 8);
  local.set(key, JSON.stringify(current));
  indexed.set(key, old);
  const loaded = await createBrowserSyncStorage(key).load();
  assert.deepEqual(loaded, current);
  assert.equal(loaded!.pending, true);
});

test('Потеря одной локальной копии не теряет несинхронизированные изменения', async (t) => {
  const { local, availability } = browserStorage(t);
  const key = syncStorageKey(endpoint, '1001');
  const current = envelope(data('pending'), 7, true);
  await createBrowserSyncStorage(key).save(current);
  local.clear();
  assert.deepEqual(await createBrowserSyncStorage(key).load(), current);
  await createBrowserSyncStorage(key).save(current);
  availability.indexed = false;
  assert.deepEqual(await createBrowserSyncStorage(key).load(), current);
});

test('Две несовместимые локальные копии одной версии не выбираются по числу записей', async (t) => {
  const { local, indexed } = browserStorage(t);
  const key = syncStorageKey(endpoint, '1001');
  const first = envelope(data('first'), 4, true);
  const second = envelope(data('second', 'more'), 4, true);
  local.set(key, JSON.stringify(first));
  indexed.set(key, copy(second));
  await assert.rejects(createBrowserSyncStorage(key).load());
  assert.deepEqual(JSON.parse(local.get(key)!), first);
  assert.deepEqual(indexed.get(key), second);
});

test('Недоступность обоих локальных хранилищ не считается успешным сохранением', async (t) => {
  const { availability } = browserStorage(t);
  availability.local = false;
  availability.indexed = false;
  const storage = createBrowserSyncStorage(syncStorageKey(endpoint, '1001'));
  await assert.rejects(storage.save(envelope(data('pending'), 3, true)));
  await assert.rejects(storage.load());
});

test('Очистка текущего аккаунта сохраняет чужую аптечку и записи прежней версии', async (t) => {
  const { local, indexed } = browserStorage(t);
  const first = createBrowserSyncStorage(syncStorageKey(endpoint, '1001'));
  const second = createBrowserSyncStorage(syncStorageKey(endpoint, '1002'));
  local.set('lifecare-mini-app-v1-fallback', JSON.stringify(data('legacy')));
  indexed.set('current', data('legacy'));
  await first.save(envelope(data('first')));
  await second.save(envelope(data('second')));
  await first.clear!();
  assert.equal(await first.load(), null);
  assert.deepEqual((await second.load())!.data, data('second'));
  assert.deepEqual(await readLegacyData(), [data('legacy')]);
});
