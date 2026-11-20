import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { emptyData, makeId, type AddMedicationInput, type Cabinet, type LifeCareData, type Medication } from '../domain/models';
import { loadData, saveData } from '../domain/storage';

type Store = {
  data: LifeCareData;
  isReady: boolean;
  createCabinet: (name: string) => { cabinet?: Cabinet; existing?: Cabinet; error?: string };
  addMedication: (input: AddMedicationInput) => Medication;
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
  }), [data, isReady]);

  return <LifeCareContext.Provider value={store}>{children}</LifeCareContext.Provider>;
}

export function useLifeCare() {
  const value = useContext(LifeCareContext);
  if (!value) throw new Error('useLifeCare must be used inside LifeCareProvider');
  return value;
}
