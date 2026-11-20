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

export type LifeCareData = {
  version: 1;
  cabinets: Cabinet[];
  medications: Medication[];
  packages: MedicationPackage[];
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

export const emptyData = (): LifeCareData => ({ version: 1, cabinets: [], medications: [], packages: [] });

export const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
