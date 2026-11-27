import assert from 'node:assert/strict';
import test from 'node:test';
import postgres from 'postgres';
import {
  decodeStoredRebuildState,
  doseRecordId,
  loadRebuildState,
  normalizeLegacyDoseRecords,
  parseExpectedRevision,
  RequestError,
  requestErrorResponse,
  saveRebuildState,
  type Query,
  type RebuildState,
} from '../telegram-mini-session/state-sync.ts';

function state(name = 'Аптечка'): RebuildState {
  return {
    version: 2,
    cabinets: [{ id: `cabinet-${name}`, name, createdAt: '2026-11-26T00:00:00.000Z' }],
    medications: [],
    packages: [],
    schedules: [],
    doseRecords: [],
  };
}

function conflict(error: unknown) {
  return error instanceof RequestError && error.status === 409 && error.code === 'revision_conflict';
}

test('writes without a valid revision never reach the database', async () => {
  let calls = 0;
  const query: Query = async () => { calls += 1; return []; };
  for (const revision of [undefined, null, '0', true, -1, 1.5, Infinity, NaN, 2_147_483_648]) {
    await assert.rejects(saveRebuildState(query, 1001, state(), revision, 'Europe/Moscow'),
      (error) => error instanceof RequestError && error.status === 400);
  }
  assert.equal(calls, 0);
  assert.equal(parseExpectedRevision(0), 0);
  assert.equal(parseExpectedRevision(42), 42);
});

test('invalid state is rejected before a write', async () => {
  let called = false;
  await assert.rejects(saveRebuildState(async () => { called = true; return []; }, 1001, {}, 0, 'Europe/Moscow'),
    (error) => error instanceof RequestError && error.status === 400);
  assert.equal(called, false);
});

test('missing remote state has revision zero', async () => {
  assert.deepEqual(await loadRebuildState(async () => [], 1001), { status: 'synced', has_data: false, revision: 0 });
});

test('legacy bot records gain stable ids without changing the source or existing ids', () => {
  const original = state();
  const legacy = { slotId: 'schedule:time:2026-11-26', status: 'taken', quantity: 1 };
  const identified = { id: 'existing', slotId: 'other:time:2026-11-26', status: 'skipped' };
  original.doseRecords = [legacy, identified];
  const normalized = normalizeLegacyDoseRecords(original);
  assert.deepEqual(normalized.doseRecords, [{ ...legacy, id: doseRecordId(legacy.slotId) }, identified]);
  assert.equal('id' in legacy, false);
  assert.deepEqual(normalizeLegacyDoseRecords(normalized), normalized);
});

test('stored legacy JSON strings decode once and invalid data stays a server failure', () => {
  const saved = state('Старая копия');
  assert.deepEqual(decodeStoredRebuildState(JSON.stringify(saved)), saved);
  for (const value of ['broken', JSON.stringify(JSON.stringify(saved)), { version: 2 }]) {
    assert.throws(() => decodeStoredRebuildState(value), (error) => requestErrorResponse(error).status === 500);
  }
});

test('HTTP errors distinguish validation, authentication, conflicts and server failures', () => {
  for (const [status, code] of [[400, 'invalid_state'], [401, 'authentication_failed'], [409, 'revision_conflict']] as const) {
    assert.deepEqual(requestErrorResponse(new RequestError(status, code)), { status, body: { error: code } });
  }
  assert.deepEqual(requestErrorResponse(new Error('private database details')), { status: 500, body: { error: 'server_error' } });
});

const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL keeps concurrent device writes isolated and versioned', { skip: !databaseUrl }, async (t) => {
  const target = new URL(databaseUrl!);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), 'Only a loopback test database is allowed');
  assert.equal(target.pathname, '/lifecare_sync_test', 'Use the dedicated empty test database');
  const sql = postgres(databaseUrl!, { max: 8, prepare: false });
  const query: Query = async (statement, parameters) => await sql.unsafe(statement, parameters);
  const owners = [9_000_000_001, 9_000_000_002, 9_000_000_003, 9_000_000_004, 9_000_000_005, 9_000_000_006];
  try {
    await sql`create schema if not exists mobile_auth`;
    await sql`
      create table if not exists mobile_auth.telegram_mini_app_states (
        telegram_user_id bigint primary key,
        payload jsonb not null,
        time_zone text not null default 'Europe/Moscow',
        revision integer not null default 1 check (revision > 0),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )`;
    await sql`delete from mobile_auth.telegram_mini_app_states where telegram_user_id in ${sql(owners)}`;

    await t.test('two first inserts produce one state and one conflict', async () => {
      const results = await Promise.allSettled([
        saveRebuildState(query, owners[0], state('Телефон'), 0, 'Europe/Moscow'),
        saveRebuildState(query, owners[0], state('Ноутбук'), 0, 'Europe/Moscow'),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      const rejected = results.find((result) => result.status === 'rejected');
      assert.ok(rejected?.status === 'rejected' && conflict(rejected.reason));
      const saved = await loadRebuildState(query, owners[0]);
      assert.equal(saved.revision, 1);
      const winner = results[0].status === 'fulfilled' ? 'Телефон' : 'Ноутбук';
      assert.deepEqual(saved.state, state(winner));
    });

    await t.test('concurrent updates from one revision cannot overwrite each other', async () => {
      const results = await Promise.allSettled([
        saveRebuildState(query, owners[0], state('Изменение A'), 1, 'Europe/Moscow'),
        saveRebuildState(query, owners[0], state('Изменение B'), 1, 'Europe/Moscow'),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      const rejected = results.find((result) => result.status === 'rejected');
      assert.ok(rejected?.status === 'rejected' && conflict(rejected.reason));
      const saved = await loadRebuildState(query, owners[0]);
      assert.equal(saved.revision, 2);
      assert.deepEqual(saved.state, state(results[0].status === 'fulfilled' ? 'Изменение A' : 'Изменение B'));
      await assert.rejects(saveRebuildState(query, owners[0], state('Устаревшая копия'), 1, 'Europe/Moscow'), conflict);
      assert.deepEqual(await loadRebuildState(query, owners[0]), saved);
    });

    await t.test('owners with the same revision keep separate payloads', async () => {
      await saveRebuildState(query, owners[1], state('Владелец A'), 0, 'Europe/Moscow');
      await saveRebuildState(query, owners[2], state('Владелец B'), 0, 'Europe/Moscow');
      await saveRebuildState(query, owners[1], state('Изменен A'), 1, 'Europe/Moscow');
      assert.deepEqual((await loadRebuildState(query, owners[2])).state, state('Владелец B'));
      assert.equal((await loadRebuildState(query, owners[2])).revision, 1);
      await assert.rejects(saveRebuildState(query, owners[4], state(), 1, 'Europe/Moscow'), conflict);
      assert.equal((await loadRebuildState(query, owners[4])).has_data, false);
    });

    await t.test('the old driver write is readable and the next version stores a JSON object', async () => {
      const legacy = state('Прежний формат');
      await sql`insert into mobile_auth.telegram_mini_app_states (telegram_user_id, payload) values (${owners[5]}, ${JSON.stringify(legacy)}::jsonb)`;
      const [before] = await sql`select payload, revision, jsonb_typeof(payload) as kind from mobile_auth.telegram_mini_app_states where telegram_user_id = ${owners[5]}`;
      assert.equal(before.kind, 'string');
      const loaded = await loadRebuildState(query, owners[5]);
      assert.deepEqual(loaded.state, legacy);
      assert.equal(loaded.revision, 1);
      const [unchanged] = await sql`select revision, jsonb_typeof(payload) as kind from mobile_auth.telegram_mini_app_states where telegram_user_id = ${owners[5]}`;
      assert.deepEqual(unchanged, { revision: 1, kind: 'string' });
      assert.deepEqual(await saveRebuildState(query, owners[5], loaded.state, loaded.revision, 'Europe/Moscow'), { status: 'synced', revision: 2 });
      const [after] = await sql`select payload, revision, jsonb_typeof(payload) as kind from mobile_auth.telegram_mini_app_states where telegram_user_id = ${owners[5]}`;
      assert.equal(after.kind, 'object');
      assert.deepEqual(after.payload, legacy);
    });

    await t.test('a bot transaction increments the revision and protects its action from a stale device', async () => {
      const initial = state('История');
      await saveRebuildState(query, owners[3], initial, 0, 'Europe/Moscow');
      let release!: () => void;
      let locked!: () => void;
      const held = new Promise<void>((resolve) => { release = resolve; });
      const acquired = new Promise<void>((resolve) => { locked = resolve; });
      const botWrite = sql.begin(async (transaction) => {
        const [row] = await transaction`select payload from mobile_auth.telegram_mini_app_states where telegram_user_id = ${owners[3]} for update`;
        const payload = row.payload as RebuildState;
        payload.doseRecords.push({ slotId: 'schedule:time:2026-11-26', status: 'taken', quantity: 1 });
        locked();
        await held;
        await transaction`update mobile_auth.telegram_mini_app_states set payload = ${JSON.stringify(payload)}::text::jsonb, revision = revision + 1 where telegram_user_id = ${owners[3]}`;
      });
      await acquired;
      const deviceWrite = saveRebuildState(query, owners[3], initial, 1, 'Europe/Moscow');
      const rejected = assert.rejects(deviceWrite, conflict);
      release();
      await botWrite;
      await rejected;
      const saved = await loadRebuildState(query, owners[3]);
      assert.equal(saved.revision, 2);
      assert.deepEqual(saved.state?.doseRecords, [{ id: 'dose:schedule:time:2026-11-26', slotId: 'schedule:time:2026-11-26', status: 'taken', quantity: 1 }]);
      const [stored] = await sql`select payload from mobile_auth.telegram_mini_app_states where telegram_user_id = ${owners[3]}`;
      assert.equal('id' in stored.payload.doseRecords[0], false, 'Reading repairs the response without mutating the stored revision');
    });
  } finally {
    await sql`delete from mobile_auth.telegram_mini_app_states where telegram_user_id in ${sql(owners)}`;
    await sql.end();
  }
});
