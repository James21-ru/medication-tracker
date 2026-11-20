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
  frequency: 'daily';
  startOn: string;
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
  quantity: number;
  unit: string;
  expiresOn: string | null;
};

export type CreateDailyScheduleInput = { medicationId: string; startOn: string; time: string; quantity: number; unit: string };

export const emptyData = (): LifeCareData => ({ version: 2, cabinets: [], medications: [], packages: [], schedules: [], doseRecords: [] });

export const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
