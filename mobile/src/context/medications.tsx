import { createContext, useContext, useMemo, useState } from 'react';

export type Medication = {
  id: string;
  name: string;
  form: 'Капсула' | 'Таблетка' | 'Жидкость';
  amount: string;
  unit: 'мг' | 'мкг' | 'г' | 'мл';
  time: string;
  color: string;
};

type MedicationContextValue = {
  medications: Medication[];
  addMedication: (medication: Omit<Medication, 'id'>) => void;
};

const MedicationContext = createContext<MedicationContextValue | null>(null);

export function MedicationProvider({ children }: { children: React.ReactNode }) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const value = useMemo(() => ({
    medications,
    addMedication: (medication: Omit<Medication, 'id'>) => setMedications((current) => [
      ...current,
      { ...medication, id: `${Date.now()}-${medication.name}` },
    ]),
  }), [medications]);

  return <MedicationContext.Provider value={value}>{children}</MedicationContext.Provider>;
}

export function useMedications() {
  const context = useContext(MedicationContext);
  if (!context) throw new Error('useMedications must be used inside MedicationProvider');
  return context;
}
