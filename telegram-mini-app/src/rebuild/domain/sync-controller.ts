import { emptyData, type LifeCareData } from './models.ts';
import { collections, copy, equal, mergeLifeCareData, type MergeConflict } from './sync-merge.ts';

export type RemoteState = { has_data: boolean; state?: LifeCareData; revision: number };
export type SyncEnvelope = {
  version: 1; data: LifeCareData; base: LifeCareData; revision: number | null;
  pending: boolean; sequence: number;
  conflictRemote?: { state: LifeCareData; revision: number };
  backups?: LifeCareData[];
};
export type SyncSnapshot = {
  data: LifeCareData; status: 'loading' | 'ready' | 'syncing' | 'offline' | 'conflict' | 'error';
  hydrated: boolean; remoteLoaded: boolean; pending: boolean; error: string | null; conflicts: MergeConflict[];
};
export type SyncStorage = { load(): Promise<SyncEnvelope | null>; save(value: SyncEnvelope): Promise<void>; clear?(): Promise<void> };
export type SyncTransport = { load(): Promise<RemoteState>; save(state: LifeCareData, expectedRevision: number): Promise<{ revision: number }> };
export function bindSyncEvents(controller: { sync(): Promise<void> }, targets: { window: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>; document: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> & { visibilityState: string } }) {
  const refresh = () => { if (targets.document.visibilityState !== 'hidden') void controller.sync(); };
  targets.window.addEventListener('focus', refresh);
  targets.window.addEventListener('online', refresh);
  targets.document.addEventListener('visibilitychange', refresh);
  return () => {
    targets.window.removeEventListener('focus', refresh);
    targets.window.removeEventListener('online', refresh);
    targets.document.removeEventListener('visibilitychange', refresh);
  };
}

export function syncStorageKey(endpoint: string, userId: string): string {
  const url = new URL(endpoint);
  if (!['https:', 'http:'].includes(url.protocol) || !/^[1-9]\d*$/.test(userId)) throw new Error('Не удалось определить аккаунт Telegram.');
  url.hash = ''; url.search = '';
  return `lifecare-sync-v1:${encodeURIComponent(url.toString().replace(/\/$/, ''))}:${userId}`;
}
export function validData(value: unknown): value is LifeCareData {
  if (!value || typeof value !== 'object' || (value as LifeCareData).version !== 2) return false;
  return collections.every((key) => Array.isArray((value as LifeCareData)[key]) && (value as LifeCareData)[key].every((row) => row && typeof row.id === 'string'));
}
const fresh = (): SyncEnvelope => ({ version: 1, data: emptyData(), base: emptyData(), revision: null, pending: false, sequence: 0 });

export function createSyncController({ storage, transport }: { storage: SyncStorage; transport: SyncTransport | null }) {
  let envelope = fresh();
  let snapshot: SyncSnapshot = { data: envelope.data, status: 'loading', hydrated: false, remoteLoaded: false, pending: false, error: null, conflicts: [] };
  const listeners = new Set<() => void>();
  let epoch = 0, disposed = false;
  let writes: Promise<void> = Promise.resolve();
  let startPromise: Promise<void> | null = null, syncPromise: Promise<void> | null = null;
  let syncAgain = false;
  let persistedSequence = -1;
  const emit = (patch: Partial<SyncSnapshot> = {}) => {
    snapshot = { ...snapshot, data: envelope.data, pending: envelope.pending, ...patch };
    for (const listener of listeners) listener();
  };
  function persist() {
    const value = copy(envelope), token = epoch;
    const task = writes.catch(() => undefined).then(async () => {
      if (token !== epoch) return;
      await storage.save(value);
      if (token === epoch) persistedSequence = value.sequence;
    });
    writes = task;
    return task;
  }
  function fail(error: unknown, status: SyncSnapshot['status'] = 'offline') {
    emit({ status, error: error instanceof Error ? error.message : 'Не удалось синхронизировать данные. Повторите попытку.' });
  }
  async function integrate(remote: RemoteState, token: number): Promise<boolean> {
    if (typeof remote.has_data !== 'boolean' || !Number.isSafeInteger(remote.revision) || remote.revision < 0 || (!remote.has_data && remote.revision !== 0) || (remote.has_data && !validData(remote.state))) throw new Error('Сервер вернул некорректную копию. Локальные данные сохранены.');
    const state = remote.has_data ? remote.state! : emptyData();
    const merged = envelope.pending ? mergeLifeCareData(envelope.base, envelope.data, state) : { data: copy(state), conflicts: [] };
    if (token !== epoch || disposed) return false;
    if (merged.conflicts.length) {
      envelope = { ...envelope, conflictRemote: { state: copy(state), revision: remote.revision }, sequence: envelope.sequence + 1 };
      await persist();
      if (token === epoch && !disposed) emit({ status: 'conflict', remoteLoaded: true, conflicts: merged.conflicts, error: 'Изменения пересекаются. Локальная копия сохранена, отправка остановлена.' });
      return false;
    }
    envelope = { ...envelope, data: merged.data, base: copy(state), revision: remote.revision, pending: !equal(merged.data, state), sequence: envelope.sequence + 1, conflictRemote: undefined };
    await persist();
    if (token !== epoch || disposed) return false;
    emit({ remoteLoaded: true, conflicts: [], error: null });
    return true;
  }
  async function runSync(token: number) {
    if (!snapshot.hydrated || disposed || token !== epoch) return;
    if (!transport) { emit({ status: 'offline', error: 'Синхронизация недоступна. Откройте приложение через Telegram.' }); return; }
    try {
      await writes.catch(() => persist());
      if (disposed || token !== epoch) return;
      emit({ status: 'syncing', error: null });
      // Перед отправкой читаем сервер, в том числе после потери ответа.
      // Предыдущая запись уже могла успешно сохраниться.
      if (!await integrate(await transport.load(), token)) return;
      let conflicts = 0;
      while (envelope.pending && token === epoch && !disposed) {
        await writes;
        if (disposed || token !== epoch) return;
        if (persistedSequence !== envelope.sequence) throw new Error('Изменения еще не сохранены на устройстве.');
        const sent = copy(envelope.data), expected = envelope.revision!;
        try {
          const result = await transport.save(sent, expected);
          if (disposed || token !== epoch) return;
          if (!Number.isSafeInteger(result.revision) || result.revision <= expected) throw new Error('Сервер не подтвердил версию записи. Повторите синхронизацию.');
          envelope = { ...envelope, base: sent, revision: result.revision, pending: !equal(envelope.data, sent), sequence: envelope.sequence + 1 };
          await persist();
          if (token !== epoch || disposed) return;
          emit();
        } catch (error) {
          if (disposed || token !== epoch) return;
          if ((error as { status?: number })?.status !== 409 || ++conflicts > 3) throw error;
          if (!await integrate(await transport.load(), token)) return;
        }
      }
      if (!disposed && token === epoch) emit({ status: 'ready', error: null });
    } catch (error) { if (!disposed && token === epoch) fail(error); }
  }
  function sync(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (syncPromise) { syncAgain = true; return syncPromise; }
    const token = epoch;
    syncPromise = (async () => {
      do { syncAgain = false; await runSync(token); }
      while (syncAgain && !disposed && token === epoch && snapshot.status === 'ready');
    })().finally(() => {
      syncPromise = null;
      if (syncAgain && envelope.pending && snapshot.status === 'ready' && !disposed) void sync();
    });
    return syncPromise;
  }
  function start(): Promise<void> {
    if (startPromise) return startPromise;
    const token = epoch;
    startPromise = (async () => {
      try {
        const saved = await storage.load();
        if (disposed || token !== epoch) return;
        if (saved) {
          if (saved.version !== 1 || !validData(saved.data) || !validData(saved.base)) throw new Error('Локальная копия повреждена. Она сохранена без изменений.');
          envelope = copy(saved);
          persistedSequence = envelope.sequence;
        }
        emit({ hydrated: true });
        await sync();
      } catch (error) { if (!disposed && token === epoch) fail(error, 'error'); }
    })();
    return startPromise;
  }
  async function update(mutator: (current: LifeCareData) => LifeCareData) {
    if (disposed || !snapshot.hydrated) throw new Error('Дождитесь загрузки данных.');
    const next = mutator(copy(envelope.data));
    if (equal(next, envelope.data)) {
      if (persistedSequence !== envelope.sequence) await persist();
      if (envelope.pending && snapshot.status !== 'conflict') void sync();
      return;
    }
    envelope = { ...envelope, data: copy(next), pending: true, sequence: envelope.sequence + 1 };
    emit();
    try { await persist(); }
    catch (error) { fail(error, 'error'); throw error; }
    if (!disposed && snapshot.status !== 'conflict') void sync();
  }
  async function acceptRemote() {
    if (!envelope.conflictRemote) {
      // Повтор после сбоя должен сохранить резервную копию до закрытия формы.
      if (persistedSequence !== envelope.sequence) await persist();
      emit({ status: 'ready', conflicts: [], error: null });
      await sync();
      return;
    }
    const remote = envelope.conflictRemote;
    envelope = { ...envelope, backups: [...(envelope.backups ?? []), copy(envelope.data)], data: copy(remote.state), base: copy(remote.state), revision: remote.revision, pending: false, conflictRemote: undefined, sequence: envelope.sequence + 1 };
    await persist();
    emit({ status: 'ready', conflicts: [], error: null });
    await sync();
  }
  async function clearLocal() {
    ++epoch;
    await writes.catch(() => undefined);
    if (storage.clear) await storage.clear();
    else await storage.save(fresh());
    envelope = fresh(); persistedSequence = -1;
    emit({ status: 'ready', hydrated: false, remoteLoaded: false, conflicts: [], error: null });
    // Очистка устройства не отправляет запросов на удаление серверных данных.
  }
  return {
    start, update, sync, clearLocal, acceptRemote,
    getSnapshot: () => snapshot,
    getEnvelope: () => copy(envelope),
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() { disposed = true; listeners.clear(); },
  };
}
