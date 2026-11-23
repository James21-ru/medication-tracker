export type Cabinet = {
  id: string;
  name: string;
  createdAt: string;
};

export type Medication = {
  id: string;
  cabinetId: string;
  name: string;
  category: string | null;
  form: string;
  packageDose: string | null;
  barcode: string | null;
  createdAt: string;
};

export type MedicationPackage = {
  id: string;
  medicationId: string;
  quantity: number;
  unit: string;
  expiresOn: string | null;
  createdAt: string;
};

export type ScheduleTime = { id: string; time: string; quantity: number; unit: string };

export type MedicationSchedule = {
  id: string;
  medicationId: string;
  frequency: 'daily' | 'weekdays' | 'interval' | 'cycle' | 'as-needed';
  startOn: string;
  endOn: string | null;
  weekdays: number[];
  intervalDays: number | null;
  activeDays: number | null;
  restDays: number | null;
  times: ScheduleTime[];
  active: boolean;
  createdAt: string;
};

export type DoseStatus = 'pending' | 'taken' | 'skipped';

export type DoseRecord = {
  id: string;
  slotId: string;
  medicationId: string;
  date: string;
  time: string;
  quantity: number;
  unit: string;
  status: Exclude<DoseStatus, 'pending'>;
  completedAt: string;
};

export type LifeCareData = {
  version: 2;
  cabinets: Cabinet[];
  medications: Medication[];
  packages: MedicationPackage[];
  schedules: MedicationSchedule[];
  doseRecords: DoseRecord[];
};

export type AddMedicationInput = {
  cabinetId: string;
  name: string;
  category: string | null;
  form: string;
  packageDose: string | null;
  barcode: string | null;
  quantity: number;
  unit: string;
  expiresOn: string | null;
};

export type CreateScheduleInput = {
  medicationId: string;
  frequency: MedicationSchedule['frequency'];
  startOn: string;
  endOn: string | null;
  weekdays?: number[];
  intervalDays?: number | null;
  activeDays?: number | null;
  restDays?: number | null;
  times: Array<Pick<ScheduleTime, 'time' | 'quantity' | 'unit'>>;
};

export const emptyData = (): LifeCareData => ({ version: 2, cabinets: [], medications: [], packages: [], schedules: [], doseRecords: [] });

export const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

const object = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' ? value as Record<string, unknown> : null;
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const finite = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && Number.isFinite(Number(value)) ? Number(value) : fallback;
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

/**
 * Data can come from an older local version or the remote Telegram mirror.
 * Treat it as untrusted: one malformed record must never prevent the mini app
 * from opening or hide all of a user's valid medicines.
 */
export function normalizeLifeCareData(value: unknown): LifeCareData {
  const source = object(value);
  if (!source || source.version !== 2) return emptyData();
  const list = (key: string) => Array.isArray(source[key]) ? source[key] : [];
  const cabinets = list('cabinets').flatMap((item): Cabinet[] => {
    const row = object(item); const id = text(row?.id); const name = text(row?.name).trim();
    return id && name ? [{ id, name, createdAt: text(row?.createdAt, new Date(0).toISOString()) }] : [];
  });
  const cabinetIds = new Set(cabinets.map((item) => item.id));
  const medications = list('medications').flatMap((item): Medication[] => {
    const row = object(item); const id = text(row?.id); const cabinetId = text(row?.cabinetId); const name = text(row?.name).trim(); const form = text(row?.form).trim();
    return id && cabinetIds.has(cabinetId) && name && form ? [{ id, cabinetId, name, form, category: typeof row?.category === 'string' ? row.category : null, packageDose: typeof row?.packageDose === 'string' ? row.packageDose : null, barcode: typeof row?.barcode === 'string' ? row.barcode : null, createdAt: text(row?.createdAt, new Date(0).toISOString()) }] : [];
  });
  const medicationIds = new Set(medications.map((item) => item.id));
  const packages = list('packages').flatMap((item): MedicationPackage[] => {
    const row = object(item); const id = text(row?.id); const medicationId = text(row?.medicationId); const unit = text(row?.unit).trim();
    return id && medicationIds.has(medicationId) && unit ? [{ id, medicationId, unit, quantity: Math.max(0, finite(row?.quantity)), expiresOn: date(row?.expiresOn), createdAt: text(row?.createdAt, new Date(0).toISOString()) }] : [];
  });
  const frequencies = new Set<MedicationSchedule['frequency']>(['daily', 'weekdays', 'interval', 'cycle', 'as-needed']);
  const schedules = list('schedules').flatMap((item): MedicationSchedule[] => {
    const row = object(item); const id = text(row?.id); const medicationId = text(row?.medicationId); const frequency = text(row?.frequency) as MedicationSchedule['frequency']; const startOn = date(row?.startOn);
    if (!id || !medicationIds.has(medicationId) || !frequencies.has(frequency) || !startOn) return [];
    const times = (Array.isArray(row?.times) ? row.times : []).flatMap((time): ScheduleTime[] => {
      const entry = object(time); const timeId = text(entry?.id); const at = text(entry?.time); const unit = text(entry?.unit).trim();
      return timeId && /^([01]\d|2[0-3]):[0-5]\d$/.test(at) && unit ? [{ id: timeId, time: at, unit, quantity: Math.max(0, finite(entry?.quantity)) }] : [];
    });
    return [{ id, medicationId, frequency, startOn, endOn: date(row?.endOn), weekdays: (Array.isArray(row?.weekdays) ? row.weekdays : []).filter((day): day is number => typeof day === 'number' && day >= 0 && day <= 6), intervalDays: row?.intervalDays == null ? null : Math.max(1, finite(row.intervalDays, 1)), activeDays: row?.activeDays == null ? null : Math.max(1, finite(row.activeDays, 1)), restDays: row?.restDays == null ? null : Math.max(0, finite(row.restDays)), times, active: row?.active !== false, createdAt: text(row?.createdAt, new Date(0).toISOString()) }];
  });
  const doseRecords = list('doseRecords').flatMap((item): DoseRecord[] => {
    const row = object(item); const id = text(row?.id); const medicationId = text(row?.medicationId); const slotId = text(row?.slotId); const recordDate = date(row?.date); const time = text(row?.time); const unit = text(row?.unit).trim(); const status = row?.status;
    return id && medicationIds.has(medicationId) && slotId && recordDate && /^([01]\d|2[0-3]):[0-5]\d$/.test(time) && unit && (status === 'taken' || status === 'skipped') ? [{ id, medicationId, slotId, date: recordDate, time, unit, quantity: Math.max(0, finite(row?.quantity)), status, completedAt: text(row?.completedAt, new Date(0).toISOString()) }] : [];
  });
  return { version: 2, cabinets, medications, packages, schedules, doseRecords };
}
