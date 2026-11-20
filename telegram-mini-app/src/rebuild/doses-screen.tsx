import { useMemo, useState } from 'react';
import type { Cabinet, Medication, MedicationSchedule } from './domain/models';
import { AddMedicationFlow } from './add-medication-flow';
import { ScheduleFlow } from './schedule-flow';
import { useLifeCare } from './state/lifecare-store';
import { EmptyState } from './ui/empty-state';
import { Icon } from './ui/icons';
import { Sheet } from './ui/sheet';

const key = (date: Date) => new Intl.DateTimeFormat('en-CA').format(date);
const addDays = (date: Date, offset: number) => { const result = new Date(date); result.setDate(result.getDate() + offset); return result; };
const dayLabel = (date: Date) => new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(date).replace('.', '').toUpperCase();
const daysBetween = (from: string, to: string) => Math.floor((new Date(to + 'T12:00:00').getTime() - new Date(from + 'T12:00:00').getTime()) / 86_400_000);
const occursOn = (schedule: MedicationSchedule, date: string) => {
  if (!schedule.active || schedule.frequency === 'as-needed' || date < schedule.startOn || (schedule.endOn && date > schedule.endOn)) return false;
  if (schedule.frequency === 'daily') return true;
  if (schedule.frequency === 'weekdays') return schedule.weekdays.includes(new Date(date + 'T12:00:00').getDay());
  const elapsed = daysBetween(schedule.startOn, date);
  if (schedule.frequency === 'interval') return elapsed % Math.max(2, schedule.intervalDays ?? 2) === 0;
  return elapsed % (Math.max(1, schedule.activeDays ?? 1) + Math.max(1, schedule.restDays ?? 1)) < Math.max(1, schedule.activeDays ?? 1);
};
type PlannedDose = { slotId: string; medication: Medication; time: string; quantity: number; unit: string; date: string };

export function DosesScreen() {
  const { data, doseStatus, setDoseStatus } = useLifeCare();
  const [selected, setSelected] = useState(() => new Date());
  const [message, setMessage] = useState('');
  const [messageError, setMessageError] = useState(false);
  const [selectMedicationOpen, setSelectMedicationOpen] = useState(false);
  const [cabinetPickerOpen, setCabinetPickerOpen] = useState(false);
  const [cabinetForMedication, setCabinetForMedication] = useState<Cabinet | null>(null);
  const [medicationForSchedule, setMedicationForSchedule] = useState<Medication | null>(null);
  const todayKey = key(new Date());
  const selectedKey = key(selected);
  const week = Array.from({ length: 7 }, (_, index) => addDays(new Date(), index - 3));
  const doses = useMemo<PlannedDose[]>(() => data.schedules.filter((schedule) => occursOn(schedule, selectedKey)).flatMap((schedule) => {
    const medication = data.medications.find((item) => item.id === schedule.medicationId);
    return medication ? schedule.times.map((time) => ({ slotId: [schedule.id, time.id, selectedKey].join(':'), medication, time: time.time, quantity: time.quantity, unit: time.unit, date: selectedKey })) : [];
  }).sort((left, right) => left.time.localeCompare(right.time)), [data, selectedKey]);
  const pending = doses.filter((dose) => doseStatus(dose.slotId) === 'pending');
  const nextDose = selectedKey === todayKey ? pending[0] : null;
  const setStatus = (dose: PlannedDose, status: 'taken' | 'skipped') => {
    const result = setDoseStatus({ slotId: dose.slotId, medicationId: dose.medication.id, date: dose.date, time: dose.time, quantity: dose.quantity, unit: dose.unit, status });
    setMessageError(!result.ok);
    setMessage(result.ok ? (status === 'taken' ? `${dose.medication.name}: приём отмечен` : `${dose.medication.name}: приём пропущен`) : (result.error ?? 'Не удалось отметить приём.'));
  };
  const selectNewMedicationCabinet = (cabinet: Cabinet) => { setCabinetPickerOpen(false); setCabinetForMedication(cabinet); };
  return <><section className="lc-doses-screen"><div className="lc-section-heading lc-section-heading--today"><div><p>{selectedKey === todayKey ? 'ПЛАН НА СЕГОДНЯ' : new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(selected).toUpperCase()}</p><h1>{selectedKey === todayKey ? 'Сегодня' : new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(selected)}</h1></div><span className="lc-day-progress">{doses.length - pending.length} / {doses.length}</span></div><div className="lc-week" role="list" aria-label="Выбор дня">{week.map((day) => <button key={key(day)} className={key(day) === selectedKey ? 'is-selected' : ''} onClick={() => { setSelected(day); setMessage(''); setMessageError(false); }}><small>{dayLabel(day)}</small><strong>{day.getDate()}</strong></button>)}</div>{message ? <p className={`lc-action-message${messageError ? ' is-error' : ''}`} role="status">{message}</p> : null}{nextDose ? <NextDose dose={nextDose} onStatus={setStatus} /> : null}{doses.length ? <><div className="lc-doses-summary"><span>{pending.length ? `Осталось ${pending.length} ${pending.length === 1 ? 'приём' : pending.length < 5 ? 'приёма' : 'приёмов'}` : 'План на день выполнен'}</span><strong>{doses.length - pending.length} из {doses.length}</strong><i><b style={{ width: `${((doses.length - pending.length) / doses.length) * 100}%` }} /></i></div><div className="lc-dose-list"><h2>{nextDose ? 'Остальные приёмы' : 'Приёмы на день'}</h2>{doses.filter((dose) => dose.slotId !== nextDose?.slotId).map((dose) => <DoseCard key={dose.slotId} dose={dose} status={doseStatus(dose.slotId)} onStatus={(status) => setStatus(dose, status)} />)}</div></> : <EmptyState icon="calendar" title="На этот день приёмов нет" description="Создайте приём: выберите препарат и настройте удобный график." />}</section><button className="lc-doses-add" onClick={() => setSelectMedicationOpen(true)}><Icon name="plus" />Создать приём</button>{selectMedicationOpen ? <MedicationPicker medications={data.medications} cabinets={data.cabinets} onClose={() => setSelectMedicationOpen(false)} onMedication={(medication) => { setSelectMedicationOpen(false); setMedicationForSchedule(medication); }} onNewMedication={() => { setSelectMedicationOpen(false); setCabinetPickerOpen(true); }} /> : null}{cabinetPickerOpen ? <CabinetPicker cabinets={data.cabinets} onClose={() => setCabinetPickerOpen(false)} onChoose={selectNewMedicationCabinet} /> : null}{cabinetForMedication ? <AddMedicationFlow cabinet={cabinetForMedication} onClose={() => setCabinetForMedication(null)} onAdded={(medication) => { setCabinetForMedication(null); setMedicationForSchedule(medication); }} /> : null}{medicationForSchedule ? <ScheduleFlow medication={medicationForSchedule} unit={data.packages.find((item) => item.medicationId === medicationForSchedule.id)?.unit ?? 'шт.'} onClose={() => setMedicationForSchedule(null)} /> : null}</>;
}

function NextDose({ dose, onStatus }: { dose: PlannedDose; onStatus: (dose: PlannedDose, status: 'taken' | 'skipped') => void }) {
  return <article className="lc-next-dose"><p>БЛИЖАЙШИЙ ПРИЁМ</p><time>{dose.time}</time><div><span className="lc-dose-card__icon"><Icon name="pill" /></span><section><h2>{dose.medication.name}</h2><small>{dose.quantity} {dose.unit} · {dose.medication.form.toLowerCase()}</small></section></div><button className="lc-primary-button" onClick={() => onStatus(dose, 'taken')}><Icon name="check" />Принять</button><button className="lc-subtle-button" onClick={() => onStatus(dose, 'skipped')}>Пропустить приём</button></article>;
}

function MedicationPicker({ medications, cabinets, onClose, onMedication, onNewMedication }: { medications: Medication[]; cabinets: Cabinet[]; onClose: () => void; onMedication: (medication: Medication) => void; onNewMedication: () => void }) {
  return <Sheet title="Создать приём" onClose={onClose} footer={cabinets.length ? <button className="lc-secondary-button" onClick={onNewMedication}><Icon name="plus" />Добавить новый препарат</button> : undefined}><div className="lc-dose-medication-choice"><p className="lc-eyebrow">ВСЕ АПТЕЧКИ</p><h2>Какой препарат принимать?</h2><p>Выберите препарат — аптечку выбирать не нужно.</p>{medications.length ? <div className="lc-choice-list">{medications.map((medication) => <button key={medication.id} onClick={() => onMedication(medication)}><span><strong>{medication.name}</strong><small>{cabinets.find((cabinet) => cabinet.id === medication.cabinetId)?.name ?? 'Аптечка'} · {medication.form.toLowerCase()}</small></span><Icon name="chevron" /></button>)}</div> : <EmptyState icon="pill" title="Препаратов пока нет" description="Добавьте препарат в аптечку, затем настройте приём." action={<button className="lc-primary-button" onClick={onNewMedication}>Добавить препарат</button>} />}</div></Sheet>;
}

function CabinetPicker({ cabinets, onClose, onChoose }: { cabinets: Cabinet[]; onClose: () => void; onChoose: (cabinet: Cabinet) => void }) {
  return <Sheet title="Новый препарат" onClose={onClose}><div className="lc-dose-medication-choice"><p className="lc-eyebrow">ВЫБОР АПТЕЧКИ</p><h2>Куда добавить препарат?</h2><p>После сохранения сразу настроим его приём.</p><div className="lc-choice-list">{cabinets.map((cabinet) => <button key={cabinet.id} onClick={() => onChoose(cabinet)}><span><strong>{cabinet.name}</strong><small>Добавить препарат в эту аптечку</small></span><Icon name="chevron" /></button>)}</div></div></Sheet>;
}

function DoseCard({ dose, status, onStatus }: { dose: PlannedDose; status: 'pending' | 'taken' | 'skipped'; onStatus: (value: 'taken' | 'skipped') => void }) {
  return <article className={['lc-dose-card', 'lc-dose-card--' + status].join(' ')}><time>{dose.time}</time><div className="lc-dose-card__main"><div className="lc-dose-card__icon"><Icon name="pill" /></div><div><h2>{dose.medication.name}</h2><p>{dose.quantity} {dose.unit} · {dose.medication.form.toLowerCase()}</p>{status === 'pending' ? <div className="lc-dose-actions"><button onClick={() => onStatus('taken')}>Принять</button><button onClick={() => onStatus('skipped')}>Пропустить</button></div> : <strong>{status === 'taken' ? 'Принято' : 'Пропущено'}</strong>}</div></div></article>;
}
