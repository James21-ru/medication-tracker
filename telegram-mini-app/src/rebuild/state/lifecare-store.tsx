import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { emptyData, makeId, type AddMedicationInput, type Cabinet, type CreateScheduleInput, type DoseRecord, type DoseStatus, type LifeCareData, type Medication, type MedicationPackage, type MedicationSchedule } from '../domain/models';
import { loadData, saveData } from '../domain/storage';
import { telegramSync, telegramSyncAvailable } from '../telegram-sync';

type Store = {
  data: LifeCareData;
  isReady: boolean;
  createCabinet: (name: string) => { cabinet?: Cabinet; existing?: Cabinet; error?: string };
  addMedication: (input: AddMedicationInput) => Medication;
  addPackage: (input: Omit<MedicationPackage, 'id' | 'createdAt'>) => void;
  updateMedication: (medicationId: string, patch: Pick<Medication, 'name' | 'category' | 'form' | 'packageDose'>) => void;
  deleteMedication: (medicationId: string) => void;
  resetData: () => void;
  saveSchedule: (input: CreateScheduleInput, scheduleId?: string) => MedicationSchedule;
  doseStatus: (slotId: string) => DoseStatus;
  setDoseStatus: (input: Omit<DoseRecord, 'id' | 'completedAt' | 'status'> & { status: Exclude<DoseStatus, 'pending'> }) => { ok: boolean; error?: string };
};

const LifeCareContext = createContext<Store | null>(null);
const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');

export function LifeCareProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LifeCareData>(emptyData);
  const [isReady, setReady] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);

  useEffect(() => { void loadData().then((next) => { setData(next); setReady(true); }); }, []);
  useEffect(() => { if (isReady) void saveData(data); }, [data, isReady]);
  useEffect(() => {
    if (!isReady || !telegramSyncAvailable()) { setRemoteReady(true); return; }
    let cancelled = false;
    void telegramSync.load().then((result) => {
      if (!cancelled && result.has_data && result.state) setData(result.state);
    }).catch(() => undefined).finally(() => { if (!cancelled) setRemoteReady(true); });
    return () => { cancelled = true; };
  }, [isReady]);
  useEffect(() => {
    if (!isReady || !remoteReady || !telegramSyncAvailable()) return;
    const timer = window.setTimeout(() => { void telegramSync.save(data).catch(() => undefined); }, 800);
    return () => window.clearTimeout(timer);
  }, [data, isReady, remoteReady]);

  const store = useMemo<Store>(() => ({
    data,
    isReady,
    createCabinet(name) {
      const cleanName = name.trim().replace(/\s+/g, ' ');
      if (!cleanName) return { error: 'Введите название аптечки.' };
      const existing = data.cabinets.find((cabinet) => normalized(cabinet.name) === normalized(cleanName));
      if (existing) return { existing };
      const cabinet: Cabinet = { id: makeId('cabinet'), name: cleanName, createdAt: new Date().toISOString() };
      setData((current) => ({ ...current, cabinets: [...current.cabinets, cabinet] }));
      return { cabinet };
    },
    addMedication(input) {
      const medication: Medication = { id: makeId('medication'), cabinetId: input.cabinetId, name: input.name.trim(), category: input.category, form: input.form, packageDose: input.packageDose, barcode: input.barcode, createdAt: new Date().toISOString() };
      setData((current) => ({
        ...current,
        medications: [...current.medications, medication],
        packages: [...current.packages, { id: makeId('package'), medicationId: medication.id, quantity: input.quantity, unit: input.unit, expiresOn: input.expiresOn, createdAt: new Date().toISOString() }],
      }));
      return medication;
    },
    addPackage(input) {
      setData((current) => ({ ...current, packages: [...current.packages, { ...input, id: makeId('package'), createdAt: new Date().toISOString() }] }));
    },
    updateMedication(medicationId, patch) {
      setData((current) => ({ ...current, medications: current.medications.map((item) => item.id === medicationId ? { ...item, ...patch, name: patch.name.trim() } : item) }));
    },
    deleteMedication(medicationId) {
      setData((current) => ({ ...current, medications: current.medications.filter((item) => item.id !== medicationId), packages: current.packages.filter((item) => item.medicationId !== medicationId), schedules: current.schedules.filter((item) => item.medicationId !== medicationId), doseRecords: current.doseRecords.filter((item) => item.medicationId !== medicationId) }));
    },
    resetData() { setData(emptyData()); },
    saveSchedule(input, scheduleId) {
      const currentSchedule = scheduleId ? data.schedules.find((item) => item.id === scheduleId) : undefined;
      const schedule: MedicationSchedule = { id: currentSchedule?.id ?? makeId('schedule'), medicationId: input.medicationId, frequency: input.frequency, startOn: input.startOn, endOn: input.endOn, weekdays: input.weekdays ?? [], intervalDays: input.intervalDays ?? null, activeDays: input.activeDays ?? null, restDays: input.restDays ?? null, active: true, createdAt: currentSchedule?.createdAt ?? new Date().toISOString(), times: input.times.map((time, index) => ({ id: currentSchedule?.times[index]?.id ?? makeId('time'), ...time })) };
      setData((current) => ({ ...current, schedules: current.schedules.filter((item) => item.id !== schedule.id).map((item) => item.medicationId === input.medicationId ? { ...item, active: false } : item).concat(schedule) }));
      return schedule;
    },
    doseStatus(slotId) {
      const record = data.doseRecords.find((item) => item.slotId === slotId);
      return record?.status ?? 'pending';
    },
    setDoseStatus(input) {
      const today = new Intl.DateTimeFormat('en-CA').format(new Date());
      const available = data.packages.filter((pack) => pack.medicationId === input.medicationId && pack.unit === input.unit && pack.quantity > 0 && (!pack.expiresOn || pack.expiresOn >= today)).reduce((total, pack) => total + pack.quantity, 0);
      if (input.status === 'taken' && available < input.quantity) return { ok: false, error: `Недостаточно пригодного запаса: доступно ${available} ${input.unit}.` };
      setData((current) => {
        const existing = current.doseRecords.find((item) => item.slotId === input.slotId);
        const records = existing ? current.doseRecords.map((item) => item.slotId === input.slotId ? { ...item, status: input.status, completedAt: new Date().toISOString() } : item) : [...current.doseRecords, { ...input, id: makeId('dose'), completedAt: new Date().toISOString() }];
        if (input.status !== 'taken' || existing?.status === 'taken') return { ...current, doseRecords: records };
        let remaining = input.quantity;
        const packages = current.packages.map((pack) => ({ ...pack }));
        packages.filter((pack) => pack.medicationId === input.medicationId && pack.unit === input.unit && pack.quantity > 0 && (!pack.expiresOn || pack.expiresOn >= today)).sort((left, right) => (left.expiresOn ?? '9999-12-31').localeCompare(right.expiresOn ?? '9999-12-31')).forEach((pack) => { const used = Math.min(remaining, pack.quantity); pack.quantity -= used; remaining -= used; });
        return { ...current, packages, doseRecords: records };
      });
      return { ok: true };
    },
  }), [data, isReady]);

  return <LifeCareContext.Provider value={store}>{children}</LifeCareContext.Provider>;
}

export function useLifeCare() {
  const value = useContext(LifeCareContext);
  if (!value) throw new Error('useLifeCare must be used inside LifeCareProvider');
  return value;
}
