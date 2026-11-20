import { useMemo, useState } from 'react';
import type { Medication } from './domain/models';
import { useLifeCare } from './state/lifecare-store';
import { EmptyState } from './ui/empty-state';
import { Icon } from './ui/icons';

const key = (date: Date) => new Intl.DateTimeFormat('en-CA').format(date);
const addDays = (date: Date, offset: number) => { const result = new Date(date); result.setDate(result.getDate() + offset); return result; };
const dayLabel = (date: Date) => new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(date).replace('.', '').toUpperCase();
const daysBetween = (from: string, to: string) => Math.floor((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000);
const occursOn = (schedule: import('./domain/models').MedicationSchedule, date: string) => {
  if (!schedule.active || schedule.frequency === 'as-needed' || date < schedule.startOn || (schedule.endOn && date > schedule.endOn)) return false;
  if (schedule.frequency === 'daily') return true;
  if (schedule.frequency === 'weekdays') return schedule.weekdays.includes(new Date(`${date}T12:00:00`).getDay());
  const elapsed = daysBetween(schedule.startOn, date);
  if (schedule.frequency === 'interval') return elapsed % Math.max(2, schedule.intervalDays ?? 2) === 0;
  const cycle = Math.max(1, schedule.activeDays ?? 1) + Math.max(1, schedule.restDays ?? 1);
  return elapsed % cycle < Math.max(1, schedule.activeDays ?? 1);
};

type PlannedDose = { slotId: string; medication: Medication; time: string; quantity: number; unit: string; date: string };

export function DosesScreen() {
  const { data, doseStatus, setDoseStatus } = useLifeCare();
  const [selected, setSelected] = useState(() => new Date());
  const todayKey = key(new Date());
  const selectedKey = key(selected);
  const week = Array.from({ length: 7 }, (_, index) => addDays(new Date(), index - 3));
  const doses = useMemo<PlannedDose[]>(() => data.schedules.filter((schedule) => occursOn(schedule, selectedKey)).flatMap((schedule) => { const medication = data.medications.find((item) => item.id === schedule.medicationId); return medication ? schedule.times.map((time) => ({ slotId: `${schedule.id}:${time.id}:${selectedKey}`, medication, time: time.time, quantity: time.quantity, unit: time.unit, date: selectedKey })) : []; }).sort((left, right) => left.time.localeCompare(right.time)), [data, selectedKey]);
  const pending = doses.filter((dose) => doseStatus(dose.slotId) === 'pending').length;
  return <section className="lc-doses-screen"><div className="lc-section-heading"><div><p>{selectedKey === todayKey ? 'СЕГОДНЯ' : new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(selected).toUpperCase()}</p><h1>{selectedKey === todayKey ? 'Сегодня' : new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(selected)}</h1></div></div><div className="lc-week" role="list" aria-label="Выбор дня">{week.map((day) => <button key={key(day)} className={key(day) === selectedKey ? 'is-selected' : ''} onClick={() => setSelected(day)}><small>{dayLabel(day)}</small><strong>{day.getDate()}</strong></button>)}</div>{doses.length ? <><div className="lc-doses-summary"><span>Осталось {pending} {pending === 1 ? 'приём' : pending >= 2 && pending <= 4 ? 'приёма' : 'приёмов'}</span><strong>{doses.length - pending} из {doses.length}</strong><i><b style={{ width: `${((doses.length - pending) / doses.length) * 100}%` }} /></i></div><div className="lc-dose-list">{doses.map((dose) => <DoseCard key={dose.slotId} dose={dose} status={doseStatus(dose.slotId)} onStatus={(status) => setDoseStatus({ slotId: dose.slotId, medicationId: dose.medication.id, date: dose.date, time: dose.time, quantity: dose.quantity, unit: dose.unit, status })} />)}</div></> : <EmptyState icon="calendar" title="На этот день приёмов нет" description="Настройте график в карточке препарата — он появится здесь." />}</section>;
}

function DoseCard({ dose, status, onStatus }: { dose: PlannedDose; status: 'pending' | 'taken' | 'skipped'; onStatus: (value: 'taken' | 'skipped') => void }) {
  return <article className={`lc-dose-card lc-dose-card--${status}`}><time>{dose.time}</time><div className="lc-dose-card__main"><div className="lc-dose-card__icon"><Icon name="pill" /></div><div><h2>{dose.medication.name}</h2><p>{dose.quantity} {dose.unit} · {dose.medication.form.toLowerCase()}</p>{status === 'pending' ? <div className="lc-dose-actions"><button onClick={() => onStatus('taken')}>Принять</button><button onClick={() => onStatus('skipped')}>Пропустить</button></div> : <strong>{status === 'taken' ? 'Принято' : 'Пропущено'}</strong>}</div></div></article>;
}
