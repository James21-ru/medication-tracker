import assert from 'node:assert/strict';
import test from 'node:test';

import { emptyData, type LifeCareData } from '../src/rebuild/domain/models.ts';
import { bindSyncEvents, createSyncController, syncStorageKey } from '../src/rebuild/domain/sync-controller.ts';

type Options = Parameters<typeof createSyncController>[0];
type Envelope = NonNullable<Awaited<ReturnType<Options['storage']['load']>>>;
type RemoteSnapshot = Awaited<ReturnType<NonNullable<Options['transport']>['load']>>;

const copy = <T>(value: T): T => structuredClone(value);
const date = '2026-11-26T08:00:00.000Z';
const cabinet = (id: string, name = id) => ({ id, name, createdAt: date });
const withCabinets = (...ids: string[]): LifeCareData => ({ ...emptyData(), cabinets: ids.map((id) => cabinet(id)) });
const ids = (data: LifeCareData) => data.cabinets.map((item) => item.id).sort();

function inventory(): LifeCareData {
  return {
    ...withCabinets('home'),
    medications: [{ id: 'medicine', cabinetId: 'home', name: 'Препарат', category: null, form: 'Таблетка', packageDose: null, barcode: null, createdAt: date }],
    packages: [{ id: 'package', medicationId: 'medicine', quantity: 10, unit: 'шт.', expiresOn: '2027-12-31', createdAt: date }],
  };
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function until(predicate: () => boolean, message: string) {
  for (let turn = 0; turn < 100; turn += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.ok(predicate(), message);
}

class MemoryStorage {
  value: Envelope | null = null;
  writes: Envelope[] = [];
  async load() { return copy(this.value); }
  async save(value: Envelope) { this.value = copy(value); this.writes.push(copy(value)); }
  async clear() { this.value = null; }
}

type Request = { client: string; method: 'GET' | 'PUT'; revision?: number; data?: LifeCareData; outcome?: 'saved' | 'conflict' | 'failed' };

class SharedServer {
  state: LifeCareData | null;
  revision: number;
  requests: Request[] = [];
  constructor(state: LifeCareData | null = null) { this.state = copy(state); this.revision = state ? 1 : 0; }
  snapshot(): RemoteSnapshot {
    return { has_data: this.state !== null, state: this.state === null ? undefined : copy(this.state), revision: this.revision };
  }
  saves() { return this.requests.filter((request) => request.method === 'PUT' && request.outcome === 'saved'); }
}

function device(server: SharedServer, name: string, storage = new MemoryStorage()) {
  const network = {
    online: true,
    error: null as unknown,
    beforeLoad: null as null | (() => Promise<void>),
    beforeSave: null as null | (() => Promise<void>),
    afterSave: null as null | (() => Promise<void>),
    activeWrites: 0,
    maxActiveWrites: 0,
  };
  const transport: Options['transport'] = {
    async load() {
      server.requests.push({ client: name, method: 'GET' });
      if (!network.online) throw new TypeError('Сеть недоступна');
      if (network.error) throw network.error;
      const response = server.snapshot();
      await network.beforeLoad?.();
      return response;
    },
    async save(data, expectedRevision) {
      const request: Request = { client: name, method: 'PUT', revision: expectedRevision, data: copy(data) };
      server.requests.push(request);
      if (!network.online) { request.outcome = 'failed'; throw new TypeError('Сеть недоступна'); }
      if (network.error) { request.outcome = 'failed'; throw network.error; }
      network.activeWrites += 1;
      network.maxActiveWrites = Math.max(network.maxActiveWrites, network.activeWrites);
      try {
        await network.beforeSave?.();
        if (expectedRevision !== server.revision) {
          request.outcome = 'conflict';
          throw Object.assign(new Error('Версия изменилась'), { status: 409 });
        }
        server.state = copy(data);
        server.revision += 1;
        request.outcome = 'saved';
        const revision = server.revision;
        await network.afterSave?.();
        return { revision };
      } finally { network.activeWrites -= 1; }
    },
  };
  const controller = createSyncController({ storage, transport });
  return { controller, storage, network };
}

test('Пустое второе устройство получает общую аптечку без отправки пустого снимка', async (t) => {
  const server = new SharedServer();
  const first = device(server, 'first');
  const second = device(server, 'second');
  t.after(() => { first.controller.dispose(); second.controller.dispose(); });
  await first.controller.start();
  assert.equal(server.saves().length, 0);
  await first.controller.update((data) => ({ ...data, cabinets: [cabinet('home', 'Домашняя')] }));
  await first.controller.sync();
  await second.controller.start();
  assert.deepEqual(second.controller.getSnapshot().data, first.controller.getSnapshot().data);
  assert.deepEqual(ids(server.state!), ['home']);
  assert.equal(server.requests.filter((request) => request.client === 'second' && request.method === 'PUT').length, 0);
  assert.notEqual(first.storage, second.storage);
});

test('Запоздалая загрузка сервера сохраняет изменения пользователя во время открытия', async (t) => {
  const server = new SharedServer(withCabinets('remote'));
  const client = device(server, 'phone');
  const gate = deferred();
  client.network.beforeLoad = () => gate.promise;
  t.after(() => { gate.resolve(); client.controller.dispose(); });
  const starting = client.controller.start();
  await until(() => server.requests.some((request) => request.method === 'GET'), 'Загрузка сервера не началась');
  await client.controller.update((data) => ({ ...data, cabinets: [...data.cabinets, cabinet('local')] }));
  assert.deepEqual(ids(client.storage.value!.data), ['local']);
  assert.equal(client.storage.value!.pending, true);
  assert.equal(server.saves().length, 0);
  client.network.beforeLoad = null;
  gate.resolve();
  await starting;
  await client.controller.sync();
  assert.deepEqual(ids(client.controller.getSnapshot().data), ['local', 'remote']);
  assert.deepEqual(ids(server.state!), ['local', 'remote']);
});

test('Изменения без сети сохраняются на диске и отправляются после повторного открытия', async (t) => {
  const server = new SharedServer(withCabinets('home'));
  const storage = new MemoryStorage();
  const original = device(server, 'original', storage);
  await original.controller.start();
  original.network.online = false;
  await original.controller.update((data) => ({ ...data, cabinets: [...data.cabinets, cabinet('travel')] }));
  await original.controller.sync();
  assert.equal(storage.value!.pending, true);
  original.controller.dispose();

  const reopened = device(server, 'reopened', storage);
  reopened.network.online = false;
  t.after(() => reopened.controller.dispose());
  await reopened.controller.start();
  assert.deepEqual(ids(reopened.controller.getSnapshot().data), ['home', 'travel']);
  assert.equal(reopened.controller.getSnapshot().pending, true);
  assert.equal(server.saves().length, 0);
  reopened.network.online = true;
  await reopened.controller.sync();
  assert.deepEqual(ids(server.state!), ['home', 'travel']);
  assert.equal(storage.value!.pending, false);
});

test('Два устройства объединяют независимые добавления после конфликта версии сервера', async (t) => {
  const server = new SharedServer(withCabinets('home'));
  const first = device(server, 'first');
  const second = device(server, 'second');
  const gate = deferred();
  t.after(() => { gate.resolve(); first.controller.dispose(); second.controller.dispose(); });
  await Promise.all([first.controller.start(), second.controller.start()]);
  second.network.beforeSave = () => gate.promise;
  await second.controller.update((data) => ({ ...data, cabinets: [...data.cabinets, cabinet('second')] }));
  const secondSync = second.controller.sync();
  await until(() => second.network.activeWrites === 1, 'Вторая запись не началась');
  await first.controller.update((data) => ({ ...data, cabinets: [...data.cabinets, cabinet('first')] }));
  await first.controller.sync();
  second.network.beforeSave = null;
  gate.resolve();
  await secondSync;
  await second.controller.sync();
  await first.controller.sync();
  assert.ok(server.requests.some((request) => request.client === 'second' && request.outcome === 'conflict'));
  assert.deepEqual(ids(server.state!), ['first', 'home', 'second']);
  assert.deepEqual(first.controller.getSnapshot().data, second.controller.getSnapshot().data);
});

test('Старая более заполненная копия не возвращает удаленный препарат', async (t) => {
  const server = new SharedServer(inventory());
  const first = device(server, 'first');
  const second = device(server, 'second');
  t.after(() => { first.controller.dispose(); second.controller.dispose(); });
  await Promise.all([first.controller.start(), second.controller.start()]);
  second.network.online = false;
  await second.controller.update((data) => ({ ...data, cabinets: [...data.cabinets, cabinet('travel')] }));
  await second.controller.sync();
  await first.controller.update((data) => ({ ...data, medications: [], packages: [], schedules: [], doseRecords: [] }));
  await first.controller.sync();
  second.network.online = true;
  await second.controller.sync();
  assert.deepEqual(ids(server.state!), ['home', 'travel']);
  assert.deepEqual(server.state!.medications, []);
  assert.deepEqual(server.state!.packages, []);
  assert.deepEqual(second.controller.getSnapshot().data.medications, []);
});

test('Одновременное изменение одного названия требует решения и не затирает сервер', async (t) => {
  const server = new SharedServer(withCabinets('home', 'travel'));
  const first = device(server, 'first');
  const second = device(server, 'second');
  t.after(() => { first.controller.dispose(); second.controller.dispose(); });
  await Promise.all([first.controller.start(), second.controller.start()]);
  second.network.online = false;
  await second.controller.update((data) => ({ ...data, cabinets: data.cabinets.map((item) => item.id === 'home' ? { ...item, name: 'Мой вариант' } : item) }));
  await second.controller.sync();
  await first.controller.update((data) => ({ ...data, cabinets: data.cabinets.map((item) => item.id === 'home' ? { ...item, name: 'Другой вариант' } : item) }));
  await first.controller.sync();
  const saved = copy(server.state);
  const saves = server.saves().length;
  second.network.online = true;
  await second.controller.sync();
  assert.equal(second.controller.getSnapshot().status, 'conflict');
  assert.equal(second.controller.getSnapshot().pending, true);
  assert.ok(second.controller.getSnapshot().conflicts.length > 0);
  assert.deepEqual(server.state, saved);
  assert.equal(server.saves().length, saves);
  assert.equal(second.storage.value!.data.cabinets.find((item) => item.id === 'home')!.name, 'Мой вариант');
});

test('Несовместимые изменения остатка не складываются и не перезаписываются автоматически', async (t) => {
  const server = new SharedServer(inventory());
  const first = device(server, 'first');
  const second = device(server, 'second');
  t.after(() => { first.controller.dispose(); second.controller.dispose(); });
  await Promise.all([first.controller.start(), second.controller.start()]);
  second.network.online = false;
  await second.controller.update((data) => ({ ...data, packages: data.packages.map((item) => ({ ...item, quantity: 9 })) }));
  await second.controller.sync();
  await first.controller.update((data) => ({ ...data, packages: data.packages.map((item) => ({ ...item, quantity: 8 })) }));
  await first.controller.sync();
  second.network.online = true;
  await second.controller.sync();
  assert.equal(second.controller.getSnapshot().status, 'conflict');
  assert.equal(server.state!.packages[0].quantity, 8);
  assert.equal(second.storage.value!.data.packages[0].quantity, 9);
});

test('Одинаковый остаток после разных приемов не скрывает двойное списание', async (t) => {
  const server = new SharedServer(inventory());
  const first = device(server, 'first');
  const second = device(server, 'second');
  t.after(() => { first.controller.dispose(); second.controller.dispose(); });
  await Promise.all([first.controller.start(), second.controller.start()]);
  const take = (data: LifeCareData, slot: string): LifeCareData => ({
    ...data,
    packages: data.packages.map((item) => ({ ...item, quantity: 9 })),
    doseRecords: [...data.doseRecords, { id: `dose-${slot}`, slotId: slot, medicationId: 'medicine', date: '2026-11-26', time: '08:00', quantity: 1, unit: 'шт.', status: 'taken', completedAt: date }],
  });
  second.network.online = false;
  await second.controller.update((data) => take(data, 'second'));
  await second.controller.sync();
  await first.controller.update((data) => take(data, 'first'));
  await first.controller.sync();
  second.network.online = true;
  await second.controller.sync();
  assert.equal(second.controller.getSnapshot().status, 'conflict');
  assert.equal(server.state!.packages[0].quantity, 9);
  assert.deepEqual(server.state!.doseRecords.map((record) => record.slotId), ['first']);
  assert.deepEqual(second.storage.value!.data.doseRecords.map((record) => record.slotId), ['second']);
});

test('Удаление препарата и его редактирование на другом устройстве не принимаются молча', async (t) => {
  const server = new SharedServer(inventory());
  const first = device(server, 'first');
  const second = device(server, 'second');
  t.after(() => { first.controller.dispose(); second.controller.dispose(); });
  await Promise.all([first.controller.start(), second.controller.start()]);
  second.network.online = false;
  await second.controller.update((data) => ({ ...data, medications: data.medications.map((item) => ({ ...item, name: 'Новое название' })) }));
  await second.controller.sync();
  await first.controller.update((data) => ({ ...data, medications: [], packages: [] }));
  await first.controller.sync();
  second.network.online = true;
  await second.controller.sync();
  assert.equal(second.controller.getSnapshot().status, 'conflict');
  assert.deepEqual(server.state!.medications, []);
  assert.equal(second.storage.value!.data.medications[0].name, 'Новое название');
});

test('Один прием в боте и приложении объединяется без второго списания и ложного конфликта', async (t) => {
  const server = new SharedServer(inventory());
  const bot = device(server, 'bot');
  const phone = device(server, 'phone');
  t.after(() => { bot.controller.dispose(); phone.controller.dispose(); });
  await Promise.all([bot.controller.start(), phone.controller.start()]);
  const take = (data: LifeCareData, id: string, completedAt: string): LifeCareData => ({
    ...data,
    packages: data.packages.map((item) => ({ ...item, quantity: 9 })),
    doseRecords: [{ id, slotId: 'same-slot', medicationId: 'medicine', date: '2026-11-26', time: '08:00', quantity: 1, unit: 'шт.', status: 'taken', completedAt }],
  });
  phone.network.online = false;
  await phone.controller.update((data) => take(data, 'old-random-id', '2026-11-26T08:00:03.000Z'));
  await phone.controller.sync();
  await bot.controller.update((data) => take(data, 'dose:same-slot', '2026-11-26T08:00:01.000Z'));
  await bot.controller.sync();
  phone.network.online = true;
  await phone.controller.sync();
  assert.equal(phone.controller.getSnapshot().status, 'ready');
  assert.equal(phone.controller.getSnapshot().pending, false);
  assert.equal(server.state!.packages[0].quantity, 9);
  assert.equal(server.state!.doseRecords.length, 1);
  assert.deepEqual(phone.controller.getSnapshot().data, server.state);
});

test('Повтор после освобождения места сохраняет ожидающее изменение без повторного создания', async (t) => {
  const server = new SharedServer(withCabinets('home'));
  const storage = new MemoryStorage();
  const save = storage.save.bind(storage);
  let full = false;
  storage.save = async (value) => { if (full) throw new Error('Недостаточно места'); await save(value); };
  const client = device(server, 'phone', storage);
  t.after(() => client.controller.dispose());
  await client.controller.start();
  full = true;
  await assert.rejects(client.controller.update((data) => ({ ...data, cabinets: [...data.cabinets, cabinet('pending')] })));
  assert.equal(client.controller.getSnapshot().pending, true);
  assert.deepEqual(ids(storage.value!.data), ['home']);
  assert.equal(server.saves().length, 0);
  full = false;
  await client.controller.sync();
  assert.deepEqual(ids(storage.value!.data), ['home', 'pending']);
  assert.deepEqual(ids(server.state!), ['home', 'pending']);
  assert.equal(client.controller.getSnapshot().pending, false);
  assert.equal(client.controller.getSnapshot().status, 'ready');
});

for (const status of [401, 403, 503]) {
  test(`Ошибка ${status} не превращается в успешную пустую загрузку`, async (t) => {
    const server = new SharedServer(withCabinets('home'));
    const client = device(server, 'phone');
    t.after(() => client.controller.dispose());
    await client.controller.start();
    client.network.error = Object.assign(new Error(`HTTP ${status}`), { status });
    await client.controller.sync();
    assert.deepEqual(ids(client.controller.getSnapshot().data), ['home']);
    assert.notEqual(client.controller.getSnapshot().status, 'ready');
    assert.ok(client.controller.getSnapshot().error);
    assert.equal(server.saves().length, 0);
  });
}

test('Ошибка первой загрузки не разрешает отправку до получения серверной версии', async (t) => {
  const server = new SharedServer(withCabinets('remote'));
  const client = device(server, 'phone');
  client.network.online = false;
  t.after(() => client.controller.dispose());
  await client.controller.start();
  await client.controller.update((data) => ({ ...data, cabinets: [cabinet('local')] }));
  await client.controller.sync();
  assert.equal(client.controller.getSnapshot().remoteLoaded, false);
  assert.equal(server.requests.filter((request) => request.method === 'PUT').length, 0);
  assert.equal(client.storage.value!.pending, true);
  client.network.online = true;
  await client.controller.sync();
  assert.deepEqual(ids(server.state!), ['local', 'remote']);
});

test('Изменение во время отправки не теряется и записи одного устройства выполняются последовательно', async (t) => {
  const server = new SharedServer(withCabinets('home'));
  const client = device(server, 'phone');
  const gate = deferred();
  t.after(() => { gate.resolve(); client.controller.dispose(); });
  await client.controller.start();
  client.network.beforeSave = () => gate.promise;
  await client.controller.update((data) => ({ ...data, cabinets: [...data.cabinets, cabinet('first')] }));
  const sending = client.controller.sync();
  await until(() => client.network.activeWrites === 1, 'Запись не началась');
  await client.controller.update((data) => ({ ...data, cabinets: [...data.cabinets, cabinet('second')] }));
  assert.deepEqual(ids(client.storage.value!.data), ['first', 'home', 'second']);
  client.network.beforeSave = null;
  gate.resolve();
  await sending;
  await client.controller.sync();
  assert.equal(client.network.maxActiveWrites, 1);
  assert.deepEqual(ids(server.state!), ['first', 'home', 'second']);
  assert.equal(client.controller.getSnapshot().pending, false);
});

test('Потерянный ответ успешной записи восстанавливается без потери последующего изменения', async (t) => {
  const server = new SharedServer(withCabinets('home'));
  const client = device(server, 'phone');
  t.after(() => client.controller.dispose());
  await client.controller.start();
  client.network.afterSave = async () => { client.network.afterSave = null; throw new TypeError('Ответ потерян'); };
  await client.controller.update((data) => ({ ...data, cabinets: [...data.cabinets, cabinet('saved')] }));
  await until(() => client.controller.getSnapshot().status === 'offline' || client.controller.getSnapshot().status === 'error', 'Ошибка сети не показана');
  assert.equal(client.storage.value!.pending, true);
  assert.deepEqual(ids(server.state!), ['home', 'saved']);
  await client.controller.update((data) => ({ ...data, cabinets: [...data.cabinets, cabinet('later')] }));
  await client.controller.sync();
  assert.deepEqual(ids(server.state!), ['home', 'later', 'saved']);
  assert.equal(client.controller.getSnapshot().pending, false);
});

test('Закрытый контроллер игнорирует ответ предыдущего аккаунта', async () => {
  const server = new SharedServer(withCabinets('account-a'));
  const storage = new MemoryStorage();
  const client = device(server, 'account-a', storage);
  const gate = deferred();
  client.network.beforeLoad = () => gate.promise;
  const starting = client.controller.start();
  await until(() => server.requests.length > 0, 'Загрузка не началась');
  client.controller.dispose();
  const before = copy(storage.value);
  gate.resolve();
  await starting;
  assert.deepEqual(storage.value, before);
  assert.equal(server.saves().length, 0);
});

test('Локальные ключи разделяют аккаунты, серверы и локальные данные прежней версии', () => {
  const endpoint = 'https://example.test/functions/v1/telegram-mini-session';
  const first = syncStorageKey(endpoint, '1001');
  assert.notEqual(first, syncStorageKey(endpoint, '1002'));
  assert.notEqual(first, syncStorageKey('https://other.test/functions/v1/telegram-mini-session', '1001'));
  assert.notEqual(first, 'lifecare-mini-app-v1-fallback');
  assert.notEqual(first, 'lifecare-mini-app-data-v2');
  assert.throws(() => syncStorageKey(endpoint, ''));
  assert.throws(() => syncStorageKey(endpoint, 'NaN'));
});

test('Очистка локальной копии не отправляет удаление общей аптечки', async (t) => {
  const server = new SharedServer(inventory());
  const client = device(server, 'phone');
  t.after(() => client.controller.dispose());
  await client.controller.start();
  const before = copy(server.state);
  await client.controller.clearLocal();
  assert.deepEqual(server.state, before);
  assert.equal(server.saves().length, 0);
});

test('Возврат в приложение и восстановление сети запускают реальную синхронизацию', async (t) => {
  const server = new SharedServer(withCabinets('home'));
  const first = device(server, 'first');
  const second = device(server, 'second');
  const windowEvents = new EventTarget();
  const documentEvents = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const unbind = bindSyncEvents(second.controller, { window: windowEvents, document: documentEvents });
  t.after(() => { unbind(); first.controller.dispose(); second.controller.dispose(); });
  await Promise.all([first.controller.start(), second.controller.start()]);
  await first.controller.update((data) => ({ ...data, cabinets: [...data.cabinets, cabinet('travel')] }));
  await first.controller.sync();
  windowEvents.dispatchEvent(new Event('focus'));
  await until(() => second.controller.getSnapshot().data.cabinets.some((item) => item.id === 'travel'), 'Возврат в окно не загрузил изменения');

  second.network.online = false;
  await second.controller.update((data) => ({ ...data, cabinets: [...data.cabinets, cabinet('offline')] }));
  await second.controller.sync();
  second.network.online = true;
  windowEvents.dispatchEvent(new Event('online'));
  await until(() => !second.controller.getSnapshot().pending, 'Восстановление сети не отправило сохраненные изменения');
  assert.deepEqual(ids(server.state!), ['home', 'offline', 'travel']);

  documentEvents.visibilityState = 'hidden';
  const beforeHidden = server.requests.length;
  documentEvents.dispatchEvent(new Event('visibilitychange'));
  windowEvents.dispatchEvent(new Event('focus'));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(server.requests.length, beforeHidden);
  await first.controller.update((data) => ({ ...data, cabinets: [...data.cabinets, cabinet('latest')] }));
  await first.controller.sync();
  documentEvents.visibilityState = 'visible';
  documentEvents.dispatchEvent(new Event('visibilitychange'));
  await until(() => second.controller.getSnapshot().data.cabinets.some((item) => item.id === 'latest'), 'Возврат видимости не загрузил изменения');

  unbind();
  await second.controller.sync();
  const beforeUnbound = server.requests.length;
  windowEvents.dispatchEvent(new Event('focus'));
  windowEvents.dispatchEvent(new Event('online'));
  documentEvents.dispatchEvent(new Event('visibilitychange'));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(server.requests.length, beforeUnbound);
});

test('Повторное открытие сохраняет конфликт и обе версии до явного решения', async (t) => {
  const server = new SharedServer(withCabinets('home'));
  const first = device(server, 'first');
  const storage = new MemoryStorage();
  const second = device(server, 'second', storage);
  t.after(() => { first.controller.dispose(); second.controller.dispose(); });
  await Promise.all([first.controller.start(), second.controller.start()]);
  second.network.online = false;
  await second.controller.update((data) => ({ ...data, cabinets: [cabinet('home', 'Локальная')] }));
  await second.controller.sync();
  await first.controller.update((data) => ({ ...data, cabinets: [cabinet('home', 'Серверная')] }));
  await first.controller.sync();
  second.network.online = true;
  await second.controller.sync();
  assert.equal(second.controller.getSnapshot().status, 'conflict');
  second.controller.dispose();
  const reopened = device(server, 'reopened', storage);
  t.after(() => reopened.controller.dispose());
  const saves = server.saves().length;
  await reopened.controller.start();
  assert.equal(reopened.controller.getSnapshot().status, 'conflict');
  assert.equal(reopened.controller.getSnapshot().data.cabinets[0].name, 'Локальная');
  assert.equal(server.state!.cabinets[0].name, 'Серверная');
  assert.equal(server.saves().length, saves);
  await reopened.controller.acceptRemote();
  assert.equal(reopened.controller.getSnapshot().data.cabinets[0].name, 'Серверная');
  assert.equal(reopened.storage.value!.backups?.at(-1)?.cabinets[0].name, 'Локальная');
  assert.equal(server.saves().length, saves);
});

test('Принятие серверной версии после ошибки места требует сохраненной резервной копии', async (t) => {
  const server = new SharedServer(withCabinets('home'));
  const first = device(server, 'first');
  const storage = new MemoryStorage();
  const save = storage.save.bind(storage);
  let full = false;
  storage.save = async (value) => { if (full) throw new Error('Недостаточно места'); await save(value); };
  const second = device(server, 'second', storage);
  t.after(() => { first.controller.dispose(); second.controller.dispose(); });
  await Promise.all([first.controller.start(), second.controller.start()]);
  second.network.online = false;
  await second.controller.update((data) => ({ ...data, cabinets: [cabinet('home', 'Локальная')] }));
  await second.controller.sync();
  await first.controller.update((data) => ({ ...data, cabinets: [cabinet('home', 'Серверная')] }));
  await first.controller.sync();
  second.network.online = true;
  await second.controller.sync();
  assert.equal(second.controller.getSnapshot().status, 'conflict');
  const saves = server.saves().length;
  const durableBefore = copy(storage.value);

  full = true;
  await assert.rejects(second.controller.acceptRemote(), /Недостаточно места/);
  assert.deepEqual(storage.value, durableBefore);
  await assert.rejects(second.controller.acceptRemote(), /Недостаточно места/);
  assert.deepEqual(storage.value, durableBefore);
  assert.notEqual(second.controller.getSnapshot().status, 'ready');

  full = false;
  await second.controller.acceptRemote();
  assert.equal(second.controller.getSnapshot().status, 'ready');
  assert.equal(storage.value!.data.cabinets[0].name, 'Серверная');
  assert.equal(storage.value!.backups?.length, 1);
  assert.equal(storage.value!.backups![0].cabinets[0].name, 'Локальная');
  assert.equal(server.saves().length, saves);
});
