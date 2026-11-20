import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { emptyData, makeId, type AddMedicationInput, type Cabinet, type CreateScheduleInput, type DoseRecord, type DoseStatus, type LifeCareData, type Medication, type MedicationSchedule } from '../domain/models';
import { loadData, saveData } from '../domain/storage';

type Store = {
  data: LifeCareData;
  isReady: boolean;
  createCabinet: (name: string) => { cabinet?: Cabinet; existing?: Cabinet; error?: string };
  addMedication: (input: AddMedicationInput) => Medication;
  createSchedule: (input: CreateScheduleInput) => MedicationSchedule;
  doseStatus: (slotId: string) => DoseStatus;
  setDoseStatus: (input: Omit<DoseRecord, 'id' | 'completedAt' | 'status'> & { status: Exclude<DoseStatus, 'pending'> }) => void;
};

const LifeCareContext = createContext<Store | null>(null);
const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');

export function LifeCareProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LifeCareData>(emptyData);
  const [isReady, setReady] = useState(false);

  useEffect(() => { void loadData().then((next) => { setData(next); setReady(true); }); }, []);
  useEffect(() => { if (isReady) void saveData(data); }, [data, isReady]);

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
      const medication: Medication = { id: makeId('medication'), cabinetId: input.cabinetId, name: input.name.trim(), category: input.category, form: input.form, packageDose: input.packageDose, createdAt: new Date().toISOString() };
      setData((current) => ({
        ...current,
        medications: [...current.medications, medication],
        packages: [...current.packages, { id: makeId('package'), medicationId: medication.id, quantity: input.quantity, unit: input.unit, expiresOn: input.expiresOn, createdAt: new Date().toISOString() }],
      }));
      return medication;
    },
    createSchedule(input) {
      const schedule: MedicationSchedule = { id: makeId('schedule'), medicationId: input.medicationId, frequency: input.frequency, startOn: input.startOn, endOn: input.endOn, weekdays: input.weekdays ?? [], intervalDays: input.intervalDays ?? null, activeDays: input.activeDays ?? null, restDays: input.restDays ?? null, active: true, createdAt: new Date().toISOString(), times: [{ id: makeId('time'), time: input.time, quantity: input.quantity, unit: input.unit }] };
      setData((current) => ({ ...current, schedules: [...current.schedules, schedule] }));
      return schedule;
    },
    doseStatus(slotId) {
      const record = data.doseRecords.find((item) => item.slotId === slotId);
      return record?.status ?? 'pending';
    },
    setDoseStatus(input) {
      setData((current) => {
        const existing = current.doseRecords.find((item) => item.slotId === input.slotId);
        const records = existing ? current.doseRecords.map((item) => item.slotId === input.slotId ? { ...item, status: input.status, completedAt: new Date().toISOString() } : item) : [...current.doseRecords, { ...input, id: makeId('dose'), completedAt: new Date().toISOString() }];
        if (input.status !== 'taken' || existing?.status === 'taken') return { ...current, doseRecords: records };
        let remaining = input.quantity;
        const packages = current.packages.map((pack) => ({ ...pack }));
        packages.filter((pack) => pack.medicationId === input.medicationId && pack.unit === input.unit && pack.quantity > 0).sort((left, right) => (left.expiresOn ?? '9999-12-31').localeCompare(right.expiresOn ?? '9999-12-31')).forEach((pack) => { const used = Math.min(remaining, pack.quantity); pack.quantity -= used; remaining -= used; });
        return { ...current, packages, doseRecords: records };
      });
    },
  }), [data, isReady]);

  return <LifeCareContext.Provider value={store}>{children}</LifeCareContext.Provider>;
}

export function useLifeCare() {
  const value = useContext(LifeCareContext);
  if (!value) throw new Error('useLifeCare must be used inside LifeCareProvider');
  return value;
}
