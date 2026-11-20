import { useState } from 'react';
import type { Medication, MedicationSchedule } from './domain/models';
import { useLifeCare } from './state/lifecare-store';
import { Sheet } from './ui/sheet';

const localDate = () => new Intl.DateTimeFormat('en-CA').format(new Date());
const modes: { id: MedicationSchedule['frequency']; label: string; description: string }[] = [
  { id: 'daily', label: 'Каждый день', description: 'В одно и то же время ежедневно' },
  { id: 'weekdays', label: 'В определённые дни', description: 'Выберите дни недели' },
  { id: 'interval', label: 'Раз в несколько дней', description: 'Например, каждые 3 дня' },
  { id: 'cycle', label: 'По циклическому графику', description: 'Дни приёма чередуются с перерывом' },
  { id: 'as-needed', label: 'По мере необходимости', description: 'Без плановых напоминаний' },
];
const days = [{ value: 1, label: 'Пн' }, { value: 2, label: 'Вт' }, { value: 3, label: 'Ср' }, { value: 4, label: 'Чт' }, { value: 5, label: 'Пт' }, { value: 6, label: 'Сб' }, { value: 0, label: 'Вс' }];

export function ScheduleFlow({ medication, unit, schedule, onClose }: { medication: Medication; unit: string; schedule?: MedicationSchedule; onClose: () => void }) {
  const { saveSchedule } = useLifeCare();
  const [frequency, setFrequency] = useState<MedicationSchedule['frequency']>(schedule?.frequency ?? 'daily');
  const [time, setTime] = useState(schedule?.times[0]?.time ?? '09:00');
  const [quantity, setQuantity] = useState(String(schedule?.times[0]?.quantity ?? 1));
  const [weekdays, setWeekdays] = useState<number[]>(schedule?.weekdays ?? [1, 2, 3, 4, 5]);
  const [intervalDays, setIntervalDays] = useState(String(schedule?.intervalDays ?? 3));
  const [activeDays, setActiveDays] = useState(String(schedule?.activeDays ?? 2));
  const [restDays, setRestDays] = useState(String(schedule?.restDays ?? 1));
  const [error, setError] = useState('');
  const save = () => {
    const amount = Number(quantity.replace(',', '.'));
    const interval = Number(intervalDays);
    const active = Number(activeDays);
    const rest = Number(restDays);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Укажите количество на один приём.'); return; }
    if (frequency === 'weekdays' && !weekdays.length) { setError('Выберите хотя бы один день недели.'); return; }
    if (frequency === 'interval' && (!Number.isInteger(interval) || interval < 2)) { setError('Интервал должен быть не меньше двух дней.'); return; }
    if (frequency === 'cycle' && (!Number.isInteger(active) || active < 1 || !Number.isInteger(rest) || rest < 1)) { setError('Укажите целое число дней приёма и перерыва.'); return; }
    saveSchedule({ medicationId: medication.id, frequency, startOn: schedule?.startOn ?? localDate(), endOn: null, weekdays, intervalDays: frequency === 'interval' ? interval : null, activeDays: frequency === 'cycle' ? active : null, restDays: frequency === 'cycle' ? rest : null, time, quantity: amount, unit }, schedule?.id);
    onClose();
  };
  const planned = frequency !== 'as-needed';
  return <Sheet title={schedule ? 'Изменить график' : 'Настроить приём'} onClose={onClose} footer={<button className="lc-primary-button" onClick={save}>Сохранить график</button>}><div className="lc-schedule-flow"><p className="lc-eyebrow">ГРАФИК ПРИЁМА</p><h2>{medication.name}</h2><p>Выберите, когда планируете принимать препарат.</p><div className="lc-schedule-modes">{modes.map((mode) => <button key={mode.id} className={frequency === mode.id ? 'is-selected' : ''} onClick={() => { setFrequency(mode.id); setError(''); }}><span><strong>{mode.label}</strong><small>{mode.description}</small></span><i /></button>)}</div>{frequency === 'weekdays' ? <div className="lc-weekday-choice" aria-label="Дни недели">{days.map((day) => <button key={day.value} className={weekdays.includes(day.value) ? 'is-selected' : ''} onClick={() => setWeekdays((current) => current.includes(day.value) ? current.filter((value) => value !== day.value) : [...current, day.value])}>{day.label}</button>)}</div> : null}{frequency === 'interval' ? <label className="lc-field">Интервал, дней<input aria-label="Интервал в днях" inputMode="numeric" value={intervalDays} onChange={(event) => { setIntervalDays(event.target.value); setError(''); }} /></label> : null}{frequency === 'cycle' ? <div className="lc-split-fields"><label className="lc-field">Приём, дней<input aria-label="Дней приёма" inputMode="numeric" value={activeDays} onChange={(event) => { setActiveDays(event.target.value); setError(''); }} /></label><label className="lc-field">Перерыв, дней<input aria-label="Дней перерыва" inputMode="numeric" value={restDays} onChange={(event) => { setRestDays(event.target.value); setError(''); }} /></label></div> : null}{planned ? <label className="lc-field">Время<input aria-label="Время приёма" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label> : <p className="lc-schedule-note">Плановые события и напоминания не создаются. Фактический приём вы отметите вручную в карточке препарата.</p>}<label className="lc-field">Количество за приём<div className="lc-input-with-unit"><input aria-label="Количество за приём" inputMode="decimal" value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(''); }} /><span>{unit}</span></div></label>{error ? <p className="lc-form-error" role="alert">{error}</p> : null}</div></Sheet>;
}
