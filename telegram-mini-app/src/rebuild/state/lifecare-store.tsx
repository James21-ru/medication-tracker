import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { emptyData, makeId, type AddMedicationInput, type Cabinet, type CreateScheduleInput, type DoseRecord, type DoseStatus, type LifeCareData, type Medication, type MedicationPackage, type MedicationSchedule } from '../domain/models';
import { createBrowserSyncStorage, readLegacyData } from '../domain/storage';
import { createTelegramSync, telegramSyncIdentity } from '../telegram-sync';
import { bindSyncEvents, createSyncController, type SyncSnapshot } from '../domain/sync-controller';
import { equal, mergeLifeCareData } from '../domain/sync-merge';

type Store = {
  data: LifeCareData;
  isReady: boolean;
  sync: SyncSnapshot;
  retrySync: () => void;
  acceptServerCopy: () => Promise<void>;
  exportLocalCopy: () => void;
  legacyCopies: LifeCareData[];
  importLegacy: (index: number) => Promise<string | null>;
  exportLegacy: (index: number) => void;
  createCabinet: (name: string) => Promise<{ cabinet?: Cabinet; existing?: Cabinet; error?: string }>;
  addMedication: (input: AddMedicationInput, operationId?: string) => Promise<Medication>;
  addPackage: (input: Omit<MedicationPackage, 'id' | 'createdAt'>, operationId?: string) => Promise<void>;
  updateMedication: (medicationId: string, patch: Pick<Medication, 'name' | 'category' | 'form' | 'packageDose'>) => Promise<void>;
  deleteMedication: (medicationId: string) => Promise<void>;
  resetData: () => Promise<void>;
  saveSchedule: (input: CreateScheduleInput, scheduleId?: string) => Promise<MedicationSchedule>;
  doseStatus: (slotId: string) => DoseStatus;
  setDoseStatus: (input: Omit<DoseRecord, 'id' | 'completedAt' | 'status'> & { status: Exclude<DoseStatus, 'pending'> }) => Promise<{ ok: boolean; error?: string }>;
};

const LifeCareContext = createContext<Store | null>(null);
const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');

export function LifeCareProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState(() => telegramSyncIdentity()?.key ?? 'lifecare-device-only-v1');
  const [snapshot, setSnapshot] = useState<SyncSnapshot>({ data: emptyData(), status: 'loading', hydrated: false, remoteLoaded: false, pending: false, error: null, conflicts: [] });
  const [legacyCopies, setLegacyCopies] = useState<LifeCareData[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const engine = useRef<ReturnType<typeof createSyncController> | null>(null);
  const identity = telegramSyncIdentity();
  const accountMatches = scope === (identity?.key ?? 'lifecare-device-only-v1');
  const data = accountMatches ? snapshot.data : emptyData();
  const hasLocalWork = data.cabinets.length > 0 || snapshot.pending;
  const isReady = accountMatches && snapshot.hydrated && (!identity || snapshot.remoteLoaded || hasLocalWork);
  const syncState = actionError ? { ...snapshot, error: actionError, status: 'error' as const } : snapshot;

  useEffect(() => {
    const current = telegramSyncIdentity();
    const controller = createSyncController({ storage: createBrowserSyncStorage(scope), transport: current?.key === scope ? createTelegramSync(current) : null });
    engine.current = controller;
    setSnapshot(controller.getSnapshot());
    setActionError(null);
    const unsubscribe = controller.subscribe(() => setSnapshot(controller.getSnapshot()));
    const checkAccount = () => {
      const key = telegramSyncIdentity()?.key ?? 'lifecare-device-only-v1';
      if (key !== scope) { controller.dispose(); setScope(key); }
    };
    window.addEventListener('focus', checkAccount);
    document.addEventListener('visibilitychange', checkAccount);
    const unbind = bindSyncEvents(controller, { window, document });
    // Открытый экран также получает изменения с другого устройства.
    const retryTimer = window.setInterval(() => {
      checkAccount();
      if (document.visibilityState !== 'hidden') void controller.sync();
    }, 30_000);
    void controller.start();
    void readLegacyData().then(setLegacyCopies);
    return () => {
      controller.dispose(); unsubscribe(); unbind(); window.clearInterval(retryTimer);
      window.removeEventListener('focus', checkAccount);
      document.removeEventListener('visibilitychange', checkAccount);
    };
  }, [scope]);

  const update = useCallback(async (mutator: (current: LifeCareData) => LifeCareData) => {
    if (scope !== (telegramSyncIdentity()?.key ?? 'lifecare-device-only-v1')) throw new Error('Аккаунт изменился. Откройте приложение заново.');
    setActionError(null);
    if (!engine.current) throw new Error('Дождитесь загрузки данных.');
    try { await engine.current.update(mutator); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Не удалось сохранить изменения.'); throw error; }
  }, [scope]);
  const download = (value: unknown, filename: string) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  const store = useMemo<Store>(() => ({
    data,
    isReady,
    sync: syncState,
    legacyCopies,
    retrySync() { setActionError(null); if (!engine.current?.getSnapshot().hydrated) { window.location.reload(); return; } void engine.current.sync(); },
    async acceptServerCopy() { setActionError(null); await engine.current?.acceptRemote(); },
    exportLocalCopy() { download(engine.current?.getEnvelope(), 'lifecare-copy.json'); },
    exportLegacy(index) { if (legacyCopies[index]) download(legacyCopies[index], 'lifecare-old-copy.json'); },
    async importLegacy(index) {
      const legacy = legacyCopies[index];
      if (!legacy || !engine.current) return 'Копия не найдена.';
      const current = engine.current.getSnapshot().data;
      const merged = mergeLifeCareData(emptyData(), current, legacy);
      if (merged.conflicts.length) return 'В копиях есть разные версии одних записей. Скачайте старую копию для сравнения. Данные не изменены.';
      await update(() => equal(current, merged.data) ? current : merged.data);
      return null;
    },
    async createCabinet(name) {
      const data = engine.current!.getSnapshot().data;
      const cleanName = name.trim().replace(/\s+/g, ' ');
      if (!cleanName) return { error: 'Введите название аптечки.' };
      const existing = data.cabinets.find((cabinet) => normalized(cabinet.name) === normalized(cleanName));
      if (existing) { await update((current) => current); return { existing }; }
      const cabinet: Cabinet = { id: makeId('cabinet'), name: cleanName, createdAt: new Date().toISOString() };
      await update((current) => ({ ...current, cabinets: [...current.cabinets, cabinet] }));
      return { cabinet };
    },
    async addMedication(input, operationId = makeId('medication')) {
      const existing = engine.current!.getSnapshot().data.medications.find((item) => item.id === operationId);
      if (existing) { await update((current) => current); return existing; }
      const medication: Medication = { id: operationId, cabinetId: input.cabinetId, name: input.name.trim(), category: input.category, form: input.form, packageDose: input.packageDose, barcode: input.barcode, createdAt: new Date().toISOString() };
      await update((current) => ({
        ...current,
        medications: [...current.medications, medication],
        packages: [...current.packages, { id: `${operationId}:package`, medicationId: medication.id, quantity: input.quantity, unit: input.unit, expiresOn: input.expiresOn, createdAt: new Date().toISOString() }],
      }));
      return medication;
    },
    async addPackage(input, operationId = makeId('package')) {
      await update((current) => current.packages.some((item) => item.id === operationId) ? current : ({ ...current, packages: [...current.packages, { ...input, id: operationId, createdAt: new Date().toISOString() }] }));
    },
    async updateMedication(medicationId, patch) {
      await update((current) => ({ ...current, medications: current.medications.map((item) => item.id === medicationId ? { ...item, ...patch, name: patch.name.trim() } : item) }));
    },
    async deleteMedication(medicationId) {
      await update((current) => ({ ...current, medications: current.medications.filter((item) => item.id !== medicationId), packages: current.packages.filter((item) => item.medicationId !== medicationId), schedules: current.schedules.filter((item) => item.medicationId !== medicationId), doseRecords: current.doseRecords.filter((item) => item.medicationId !== medicationId) }));
    },
    async resetData() {
      await engine.current?.clearLocal();
    },
    async saveSchedule(input, scheduleId) {
      const data = engine.current!.getSnapshot().data;
      const currentSchedule = scheduleId ? data.schedules.find((item) => item.id === scheduleId) : undefined;
      const schedule: MedicationSchedule = { id: currentSchedule?.id ?? scheduleId ?? makeId('schedule'), medicationId: input.medicationId, frequency: input.frequency, startOn: input.startOn, endOn: input.endOn, weekdays: input.weekdays ?? [], intervalDays: input.intervalDays ?? null, activeDays: input.activeDays ?? null, restDays: input.restDays ?? null, active: true, createdAt: currentSchedule?.createdAt ?? new Date().toISOString(), times: input.times.map((time, index) => ({ id: currentSchedule?.times[index]?.id ?? makeId('time'), ...time })) };
      await update((current) => ({ ...current, schedules: current.schedules.filter((item) => item.id !== schedule.id).map((item) => item.medicationId === input.medicationId ? { ...item, active: false } : item).concat(schedule) }));
      return schedule;
    },
    doseStatus(slotId) {
      const record = data.doseRecords.find((item) => item.slotId === slotId);
      return record?.status ?? 'pending';
    },
    async setDoseStatus(input) {
      const data = engine.current!.getSnapshot().data;
      if (data.doseRecords.some((item) => item.slotId === input.slotId && item.status === input.status)) {
        await update((current) => current);
        return { ok: true };
      }
      const today = new Intl.DateTimeFormat('en-CA').format(new Date());
      const available = data.packages.filter((pack) => pack.medicationId === input.medicationId && pack.unit === input.unit && pack.quantity > 0 && (!pack.expiresOn || pack.expiresOn >= today)).reduce((total, pack) => total + pack.quantity, 0);
      if (input.status === 'taken' && available < input.quantity) return { ok: false, error: `Недостаточно пригодного запаса: доступно ${available} ${input.unit}.` };
      await update((current) => {
        const existing = current.doseRecords.find((item) => item.slotId === input.slotId);
        if (existing?.status === input.status) return current;
        const records = existing ? current.doseRecords.map((item) => item.slotId === input.slotId ? { ...item, status: input.status, completedAt: new Date().toISOString() } : item) : [...current.doseRecords, { ...input, id: `dose:${input.slotId}`, completedAt: new Date().toISOString() }];
        if (input.status !== 'taken' || existing?.status === 'taken') return { ...current, doseRecords: records };
        let remaining = input.quantity;
        const packages = current.packages.map((pack) => ({ ...pack }));
        packages.filter((pack) => pack.medicationId === input.medicationId && pack.unit === input.unit && pack.quantity > 0 && (!pack.expiresOn || pack.expiresOn >= today)).sort((left, right) => (left.expiresOn ?? '9999-12-31').localeCompare(right.expiresOn ?? '9999-12-31')).forEach((pack) => { const used = Math.min(remaining, pack.quantity); pack.quantity -= used; remaining -= used; });
        return { ...current, packages, doseRecords: records };
      });
      return { ok: true };
    },
  }), [data, isReady, syncState, legacyCopies, update]);

  return <LifeCareContext.Provider value={store}>{children}</LifeCareContext.Provider>;
}

export function useLifeCare() {
  const value = useContext(LifeCareContext);
  if (!value) throw new Error('useLifeCare must be used inside LifeCareProvider');
  return value;
}
