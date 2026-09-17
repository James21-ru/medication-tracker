import * as SQLite from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { enableReminders, syncScheduledReminders } from '@/services/reminders';

export type MedicationForm = 'Капсула' | 'Таблетка' | 'Жидкость';
export type StrengthUnit = 'мг' | 'мкг' | 'г' | 'мл';
export type StockUnit = 'шт.' | 'мл';
export type ScheduleKind = 'daily' | 'weekdays' | 'custom' | 'every-n-days' | 'cycle' | 'as-needed';
export type DoseStatus = 'pending' | 'taken' | 'skipped';

export type Package = { id: string; remainingQuantity: number; unit: StockUnit; expiresOn: string | null };
export type Reminder = { time: string; doseQuantity: number };
export type Schedule = { id: string; kind: Exclude<ScheduleKind, 'as-needed'>; time: string; weekdays: number[]; doseQuantity: number; doseUnit: StockUnit; startOn: string; endOn: string | null; intervalDays: number; cycleOnDays: number; cycleOffDays: number };
export type Medication = { id: string; name: string; form: MedicationForm; amount: string; unit: StrengthUnit; color: string; packages: Package[]; schedules: Schedule[] };
export type TodayDose = { id: string; medicationId: string; medicationName: string; color: string; form: MedicationForm; amount: string; unit: StrengthUnit; time: string; quantity: number; stockUnit: StockUnit; status: DoseStatus; isManual: boolean };
export type NewMedication = { name: string; form: MedicationForm; amount: string; unit: StrengthUnit; color: string; scheduleKind: ScheduleKind; weekdays: number[]; reminders: Reminder[]; intervalDays: number; cycleOnDays: number; cycleOffDays: number; startOn: string; endOn: string | null; stockUnit: StockUnit; stockQuantity: number; expiresOn: string | null };

type MedicationContextValue = {
  medications: Medication[]; todayDoses: TodayDose[]; ready: boolean;
  addMedication: (medication: NewMedication, duplicateMode?: 'combine' | 'separate') => Promise<'created' | 'duplicate'>;
  addPackage: (medicationId: string, quantity: number, unit: StockUnit, expiresOn: string | null) => Promise<void>;
  takeDose: (doseId: string) => Promise<void>; skipDose: (doseId: string) => Promise<void>; takeAsNeeded: (medicationId: string) => Promise<void>;
  enableReminders: () => Promise<boolean>;
  remainingStock: (medication: Medication) => number;
};

const MedicationContext = createContext<MedicationContextValue | null>(null);
const dbPromise = SQLite.openDatabaseAsync('medication-tracker.db');
const dayMs = 24 * 60 * 60 * 1000;
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const isoNow = () => new Date().toISOString();
const parseDate = (value: string) => new Date(`${value}T12:00:00`);
const sameMedication = (left: NewMedication, right: Medication) => left.name.trim().toLowerCase() === right.name.trim().toLowerCase() && left.form === right.form && left.amount.trim() === right.amount && left.unit === right.unit;
const weekdaysFor = (kind: ScheduleKind, selected: number[]) => kind === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : kind === 'weekdays' ? [1, 2, 3, 4, 5] : selected;

async function migrate(db: SQLite.SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS medications (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, form TEXT NOT NULL, amount TEXT NOT NULL, unit TEXT NOT NULL, color TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS packages (id TEXT PRIMARY KEY NOT NULL, medication_id TEXT NOT NULL, quantity_initial REAL NOT NULL, quantity_remaining REAL NOT NULL, unit TEXT NOT NULL, expires_on TEXT, created_at TEXT NOT NULL, FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS schedules (id TEXT PRIMARY KEY NOT NULL, medication_id TEXT NOT NULL, kind TEXT NOT NULL, weekdays_json TEXT NOT NULL, time TEXT NOT NULL, dose_quantity REAL NOT NULL, dose_unit TEXT NOT NULL, start_on TEXT NOT NULL, end_on TEXT, active INTEGER NOT NULL DEFAULT 1, FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS dose_events (id TEXT PRIMARY KEY NOT NULL, schedule_id TEXT, medication_id TEXT NOT NULL, scheduled_on TEXT NOT NULL, scheduled_time TEXT NOT NULL, quantity REAL NOT NULL, unit TEXT NOT NULL, status TEXT NOT NULL, source TEXT NOT NULL, completed_at TEXT, UNIQUE(schedule_id, scheduled_on, scheduled_time), FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS reminder_notifications (schedule_id TEXT NOT NULL, notification_id TEXT NOT NULL UNIQUE, FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE);
  `);
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(schedules)');
  const known = new Set(columns.map((column) => column.name));
  if (!known.has('interval_days')) await db.execAsync('ALTER TABLE schedules ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 1');
  if (!known.has('cycle_on_days')) await db.execAsync('ALTER TABLE schedules ADD COLUMN cycle_on_days INTEGER NOT NULL DEFAULT 1');
  if (!known.has('cycle_off_days')) await db.execAsync('ALTER TABLE schedules ADD COLUMN cycle_off_days INTEGER NOT NULL DEFAULT 0');
}

async function createEventsThroughToday(db: SQLite.SQLiteDatabase) {
  const today = dateKey();
  const schedules = await db.getAllAsync<{ id: string; medication_id: string; kind: Exclude<ScheduleKind, 'as-needed'>; weekdays_json: string; time: string; dose_quantity: number; dose_unit: StockUnit; start_on: string; end_on: string | null; interval_days: number; cycle_on_days: number; cycle_off_days: number }>('SELECT id, medication_id, kind, weekdays_json, time, dose_quantity, dose_unit, start_on, end_on, interval_days, cycle_on_days, cycle_off_days FROM schedules WHERE active = 1');
  for (const schedule of schedules) {
    const weekdays: number[] = JSON.parse(schedule.weekdays_json);
    const end = schedule.end_on && schedule.end_on < today ? schedule.end_on : today;
    for (let day = parseDate(schedule.start_on); dateKey(day) <= end; day = new Date(day.getTime() + dayMs)) {
      const elapsedDays = Math.round((parseDate(dateKey(day)).getTime() - parseDate(schedule.start_on).getTime()) / dayMs);
      const scheduled = schedule.kind === 'every-n-days' ? elapsedDays % schedule.interval_days === 0
        : schedule.kind === 'cycle' ? elapsedDays % (schedule.cycle_on_days + schedule.cycle_off_days) < schedule.cycle_on_days
        : weekdays.includes(day.getDay());
      if (!scheduled) continue;
      await db.runAsync("INSERT OR IGNORE INTO dose_events (id, schedule_id, medication_id, scheduled_on, scheduled_time, quantity, unit, status, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'schedule')", id('dose'), schedule.id, schedule.medication_id, dateKey(day), schedule.time, schedule.dose_quantity, schedule.dose_unit);
    }
  }
  await db.runAsync("UPDATE dose_events SET status = 'skipped', completed_at = ? WHERE status = 'pending' AND scheduled_on < ?", isoNow(), today);
}

export function MedicationProvider({ children }: { children: React.ReactNode }) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [todayDoses, setTodayDoses] = useState<TodayDose[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const db = await dbPromise; await migrate(db); await createEventsThroughToday(db);
    const medicationRows = await db.getAllAsync<{ id: string; name: string; form: MedicationForm; amount: string; unit: StrengthUnit; color: string }>('SELECT id, name, form, amount, unit, color FROM medications ORDER BY created_at DESC');
    const packageRows = await db.getAllAsync<{ id: string; medication_id: string; quantity_remaining: number; unit: StockUnit; expires_on: string | null }>('SELECT id, medication_id, quantity_remaining, unit, expires_on FROM packages ORDER BY expires_on IS NULL, expires_on ASC');
    const scheduleRows = await db.getAllAsync<{ id: string; medication_id: string; kind: Schedule['kind']; weekdays_json: string; time: string; dose_quantity: number; dose_unit: StockUnit; start_on: string; end_on: string | null; interval_days: number; cycle_on_days: number; cycle_off_days: number }>('SELECT id, medication_id, kind, weekdays_json, time, dose_quantity, dose_unit, start_on, end_on, interval_days, cycle_on_days, cycle_off_days FROM schedules WHERE active = 1');
    setMedications(medicationRows.map((item) => ({ ...item, packages: packageRows.filter((pack) => pack.medication_id === item.id).map((pack) => ({ id: pack.id, remainingQuantity: pack.quantity_remaining, unit: pack.unit, expiresOn: pack.expires_on })), schedules: scheduleRows.filter((schedule) => schedule.medication_id === item.id).map((schedule) => ({ id: schedule.id, kind: schedule.kind, weekdays: JSON.parse(schedule.weekdays_json), time: schedule.time, doseQuantity: schedule.dose_quantity, doseUnit: schedule.dose_unit, startOn: schedule.start_on, endOn: schedule.end_on, intervalDays: schedule.interval_days, cycleOnDays: schedule.cycle_on_days, cycleOffDays: schedule.cycle_off_days })) })));
    const doseRows = await db.getAllAsync<{ id: string; medication_id: string; name: string; color: string; form: MedicationForm; amount: string; strength_unit: StrengthUnit; scheduled_time: string; quantity: number; unit: StockUnit; status: DoseStatus; source: string }>("SELECT e.id, e.medication_id, m.name, m.color, m.form, m.amount, m.unit AS strength_unit, e.scheduled_time, e.quantity, e.unit, e.status, e.source FROM dose_events e JOIN medications m ON m.id = e.medication_id WHERE e.scheduled_on = ? ORDER BY e.scheduled_time ASC", dateKey());
    setTodayDoses(doseRows.map((dose) => ({ id: dose.id, medicationId: dose.medication_id, medicationName: dose.name, color: dose.color, form: dose.form, amount: dose.amount, unit: dose.strength_unit, time: dose.scheduled_time, quantity: dose.quantity, stockUnit: dose.unit, status: dose.status, isManual: dose.source === 'manual' })));
    setReady(true);
  }, []);
  useEffect(() => { refresh().then(() => syncScheduledReminders()).catch(console.error); }, [refresh]);

  const addPackage = useCallback(async (medicationId: string, quantity: number, unit: StockUnit, expiresOn: string | null) => {
    const db = await dbPromise; await db.runAsync('INSERT INTO packages (id, medication_id, quantity_initial, quantity_remaining, unit, expires_on, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id('pack'), medicationId, quantity, quantity, unit, expiresOn, isoNow()); await refresh();
  }, [refresh]);
  const addMedication = useCallback(async (input: NewMedication, duplicateMode?: 'combine' | 'separate') => {
    const duplicate = medications.find((medication) => sameMedication(input, medication)); if (duplicate && !duplicateMode) return 'duplicate' as const;
    const db = await dbPromise; const medicationId = duplicate && duplicateMode === 'combine' ? duplicate.id : id('med');
    if (!duplicate || duplicateMode === 'separate') await db.runAsync('INSERT INTO medications (id, name, form, amount, unit, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', medicationId, input.name.trim(), input.form, input.amount.trim(), input.unit, input.color, isoNow());
    await db.runAsync('INSERT INTO packages (id, medication_id, quantity_initial, quantity_remaining, unit, expires_on, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id('pack'), medicationId, input.stockQuantity, input.stockQuantity, input.stockUnit, input.expiresOn, isoNow());
    if ((!duplicate || duplicateMode === 'separate') && input.scheduleKind !== 'as-needed') {
      for (const reminder of input.reminders) await db.runAsync('INSERT INTO schedules (id, medication_id, kind, weekdays_json, time, dose_quantity, dose_unit, start_on, end_on, interval_days, cycle_on_days, cycle_off_days, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)', id('schedule'), medicationId, input.scheduleKind, JSON.stringify(weekdaysFor(input.scheduleKind, input.weekdays)), reminder.time, reminder.doseQuantity, input.stockUnit, input.startOn, input.endOn, input.intervalDays, input.cycleOnDays, input.cycleOffDays);
    }
    await refresh(); await syncScheduledReminders(); return 'created' as const;
  }, [medications, refresh]);
  const takeDose = useCallback(async (doseId: string) => {
    const db = await dbPromise; const dose = await db.getFirstAsync<{ medication_id: string; quantity: number; unit: StockUnit }>('SELECT medication_id, quantity, unit FROM dose_events WHERE id = ?', doseId); if (!dose) return;
    const packs = await db.getAllAsync<{ id: string; quantity_remaining: number }>('SELECT id, quantity_remaining FROM packages WHERE medication_id = ? AND unit = ? AND quantity_remaining > 0 ORDER BY expires_on IS NULL, expires_on ASC', dose.medication_id, dose.unit); let needed = dose.quantity;
    await db.withTransactionAsync(async () => { for (const pack of packs) { if (needed <= 0) break; const used = Math.min(needed, pack.quantity_remaining); await db.runAsync('UPDATE packages SET quantity_remaining = quantity_remaining - ? WHERE id = ?', used, pack.id); needed -= used; } await db.runAsync("UPDATE dose_events SET status = 'taken', completed_at = ? WHERE id = ?", isoNow(), doseId); }); await refresh();
  }, [refresh]);
  const skipDose = useCallback(async (doseId: string) => { const db = await dbPromise; await db.runAsync("UPDATE dose_events SET status = 'skipped', completed_at = ? WHERE id = ?", isoNow(), doseId); await refresh(); }, [refresh]);
  const takeAsNeeded = useCallback(async (medicationId: string) => { const medication = medications.find((item) => item.id === medicationId); if (!medication) return; const unit: StockUnit = medication.form === 'Жидкость' ? 'мл' : 'шт.'; const db = await dbPromise; const doseId = id('manual'); await db.runAsync("INSERT INTO dose_events (id, schedule_id, medication_id, scheduled_on, scheduled_time, quantity, unit, status, source, completed_at) VALUES (?, NULL, ?, ?, ?, 1, ?, 'pending', 'manual', NULL)", doseId, medicationId, dateKey(), new Date().toTimeString().slice(0, 5), unit); await takeDose(doseId); }, [medications, takeDose]);
  const value = useMemo(() => ({ medications, todayDoses, ready, addMedication, addPackage, takeDose, skipDose, takeAsNeeded, enableReminders, remainingStock: (medication: Medication) => medication.packages.reduce((sum, pack) => sum + pack.remainingQuantity, 0) }), [addMedication, addPackage, medications, ready, skipDose, takeAsNeeded, takeDose, todayDoses]);
  return <MedicationContext.Provider value={value}>{children}</MedicationContext.Provider>;
}

export function useMedications() { const context = useContext(MedicationContext); if (!context) throw new Error('useMedications must be used inside MedicationProvider'); return context; }
