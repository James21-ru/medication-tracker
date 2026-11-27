import assert from 'node:assert/strict';
import test from 'node:test';
import postgres from 'postgres';
import { createSyncController, type SyncEnvelope } from '../../../telegram-mini-app/src/rebuild/domain/sync-controller.ts';
import { emptyData, type LifeCareData } from '../../../telegram-mini-app/src/rebuild/domain/models.ts';
import { loadRebuildState, saveRebuildState, type Query } from '../telegram-mini-session/state-sync.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
const cabinet = (id: string) => ({ id, name: id, createdAt: '2026-11-26T00:00:00.000Z' });
const ids = (data: LifeCareData) => data.cabinets.map((item) => item.id).sort();

test('Два независимых устройства согласуют аптечки через настоящий PostgreSQL', { skip: !databaseUrl }, async (t) => {
  const target = new URL(databaseUrl!);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
  assert.equal(target.pathname, '/lifecare_sync_test');
  const sql = postgres(databaseUrl!, { max: 6, prepare: false });
  const query: Query = async (statement, parameters) => await sql.unsafe(statement, parameters);
  const owner = 9_100_000_001;
  const clients: ReturnType<typeof createSyncController>[] = [];

  function device(saved: { value: SyncEnvelope | null } = { value: null }) {
    const network = { online: true, saves: 0, conflicts: 0, beforeSave: null as null | (() => Promise<void>) };
    const controller = createSyncController({
      storage: {
        async load() { return structuredClone(saved.value); },
        async save(value) { saved.value = structuredClone(value); },
      },
      transport: {
        async load() {
          if (!network.online) throw new TypeError('Нет сети');
          const result = await loadRebuildState(query, owner);
          return { has_data: result.has_data, revision: result.revision, state: result.state as LifeCareData | undefined };
        },
        async save(state, expectedRevision) {
          if (!network.online) throw new TypeError('Нет сети');
          network.saves += 1;
          await network.beforeSave?.();
          try { return await saveRebuildState(query, owner, state, expectedRevision, 'Europe/Moscow'); }
          catch (error) { if ((error as { status?: number }).status === 409) network.conflicts += 1; throw error; }
        },
      },
    });
    clients.push(controller);
    return { controller, network, saved };
  }

  try {
    await sql`create schema if not exists mobile_auth`;
    await sql`create table if not exists mobile_auth.telegram_mini_app_states (
      telegram_user_id bigint primary key, payload jsonb not null,
      time_zone text not null default 'Europe/Moscow', revision integer not null default 1,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now()
    )`;
    await sql`delete from mobile_auth.telegram_mini_app_states where telegram_user_id = ${owner}`;
    const phone = device();
    const laptop = device();

    await t.test('Созданная на телефоне аптечка появляется на чистом ноутбуке без пустой записи', async () => {
      await phone.controller.start();
      await phone.controller.update((data) => ({ ...data, cabinets: [cabinet('Учебная')] }));
      await phone.controller.sync();
      await laptop.controller.start();
      assert.deepEqual(ids(laptop.controller.getSnapshot().data), ['Учебная']);
      assert.equal(laptop.network.saves, 0);
      const [row] = await sql`select jsonb_typeof(payload) as kind, revision from mobile_auth.telegram_mini_app_states where telegram_user_id = ${owner}`;
      assert.equal(row.kind, 'object', 'JSON должен храниться объектом, а не повторно сериализованной строкой');
      assert.equal(row.revision, 1);
    });

    await t.test('Конкурирующие записи вызывают конфликт и сохраняют оба независимых добавления', async () => {
      let entered!: () => void;
      let release!: () => void;
      const waiting = new Promise<void>((resolve) => { entered = resolve; });
      const gate = new Promise<void>((resolve) => { release = resolve; });
      laptop.network.beforeSave = async () => { entered(); await gate; };
      await laptop.controller.update((data) => ({ ...data, cabinets: [...data.cabinets, cabinet('Поездка')] }));
      const laptopSync = laptop.controller.sync();
      await waiting;
      try {
        await phone.controller.update((data) => ({ ...data, cabinets: [...data.cabinets, cabinet('Работа')] }));
        await phone.controller.sync();
      } finally { laptop.network.beforeSave = null; release(); }
      await laptopSync;
      await Promise.all([phone.controller.sync(), laptop.controller.sync()]);
      assert.ok(laptop.network.conflicts > 0);
      const remote = await loadRebuildState(query, owner);
      assert.deepEqual(ids(remote.state as LifeCareData), ['Поездка', 'Работа', 'Учебная']);
      assert.deepEqual(phone.controller.getSnapshot().data, laptop.controller.getSnapshot().data);
    });

    await t.test('Очередь переживает закрытие без сети, а удаленная аптечка не восстанавливается', async () => {
      laptop.network.online = false;
      await laptop.controller.update((data) => ({ ...data, cabinets: [...data.cabinets, cabinet('Запасная')] }));
      await laptop.controller.sync();
      laptop.controller.dispose();
      await phone.controller.update((data) => ({ ...data, cabinets: data.cabinets.filter((item) => item.id !== 'Работа') }));
      await phone.controller.sync();
      const reopened = device(laptop.saved);
      await reopened.controller.start();
      await phone.controller.sync();
      assert.deepEqual(ids(phone.controller.getSnapshot().data), ['Запасная', 'Поездка', 'Учебная']);
      assert.deepEqual(phone.controller.getSnapshot().data, reopened.controller.getSnapshot().data);
      assert.equal(reopened.saved.value?.pending, false);
    });

    await t.test('Старая строковая JSON-копия читается без изменения данных сервера', async () => {
      const legacy = { ...emptyData(), cabinets: [cabinet('Старая аптечка')] };
      await sql`update mobile_auth.telegram_mini_app_states set payload = ${JSON.stringify(legacy)}::jsonb, revision = revision + 1 where telegram_user_id = ${owner}`;
      const legacyDevice = device();
      await legacyDevice.controller.start();
      assert.deepEqual(ids(legacyDevice.controller.getSnapshot().data), ['Старая аптечка']);
      assert.equal(legacyDevice.network.saves, 0);
      const [row] = await sql`select jsonb_typeof(payload) as kind from mobile_auth.telegram_mini_app_states where telegram_user_id = ${owner}`;
      assert.equal(row.kind, 'string');
      await legacyDevice.controller.update((data) => ({ ...data, cabinets: [...data.cabinets, cabinet('Новая аптечка')] }));
      await legacyDevice.controller.sync();
      const [updated] = await sql`select jsonb_typeof(payload) as kind from mobile_auth.telegram_mini_app_states where telegram_user_id = ${owner}`;
      assert.equal(updated.kind, 'object');
    });
  } finally {
    for (const client of clients) client.dispose();
    await sql`delete from mobile_auth.telegram_mini_app_states where telegram_user_id = ${owner}`;
    await sql.end();
  }
});
