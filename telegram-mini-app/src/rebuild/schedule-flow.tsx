import { useRef, useState } from 'react';
import type { Medication, MedicationSchedule } from './domain/models';
import { useLifeCare } from './state/lifecare-store';
import { Icon } from './ui/icons';
import { Sheet } from './ui/sheet';

const localDate = () => new Intl.DateTimeFormat('en-CA').format(new Date());
const modes: { id: MedicationSchedule['frequency']; label: string; description: string }[] = [
  { id: 'daily', label: 'Каждый день', description: 'В одно и то же время ежедневно' },
  { id: 'weekdays', label: 'В определенные дни', description: 'Выберите дни недели' },
  { id: 'interval', label: 'Раз в несколько дней', description: 'Например, каждые 3 дня' },
  { id: 'cycle', label: 'По циклическому графику', description: 'Дни приема чередуются с перерывом' },
  { id: 'as-needed', label: 'По мере необходимости', description: 'Без плановых напоминаний' },
];
const days = [{ value: 1, label: 'Пн' }, { value: 2, label: 'Вт' }, { value: 3, label: 'Ср' }, { value: 4, label: 'Чт' }, { value: 5, label: 'Пт' }, { value: 6, label: 'Сб' }, { value: 0, label: 'Вс' }];
type TimeDraft = { id: string; time: string; quantity: string };
const firstTime = (): TimeDraft => ({ id: crypto.randomUUID(), time: '09:00', quantity: '1' });

export function ScheduleFlow({ medication, unit, schedule, onClose, onSaved }: { medication: Medication; unit: string; schedule?: MedicationSchedule; onClose: () => void; onSaved: () => void }) {
  const { saveSchedule } = useLifeCare();
  const [step, setStep] = useState(schedule ? 1 : 0);
  const [frequency, setFrequency] = useState<MedicationSchedule['frequency']>(schedule?.frequency ?? 'daily');
  const [times, setTimes] = useState<TimeDraft[]>(() => schedule?.times.length ? schedule.times.map((item) => ({ id: item.id, time: item.time, quantity: String(item.quantity) })) : [firstTime()]);
  const [weekdays, setWeekdays] = useState<number[]>(schedule?.weekdays ?? [1, 2, 3, 4, 5]);
  const [intervalDays, setIntervalDays] = useState(String(schedule?.intervalDays ?? 3));
  const [activeDays, setActiveDays] = useState(String(schedule?.activeDays ?? 2));
  const [restDays, setRestDays] = useState(String(schedule?.restDays ?? 1));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [scheduleId] = useState(() => schedule?.id ?? `schedule-${crypto.randomUUID()}`);
  const selectedMode = modes.find((mode) => mode.id === frequency)!;
  const planned = frequency !== 'as-needed';
  const updateTime = (id: string, patch: Partial<TimeDraft>) => { setTimes((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item)); setError(''); };
  const addTime = () => { if (times.length < 5) setTimes((current) => [...current, { ...firstTime(), time: current.some((item) => item.time === '21:00') ? '12:00' : '21:00' }]); };
  const removeTime = (id: string) => { if (times.length > 1) setTimes((current) => current.filter((item) => item.id !== id)); };
  const save = async () => {
    if (savingRef.current) return;
    const interval = Number(intervalDays);
    const active = Number(activeDays);
    const rest = Number(restDays);
    const normalizedTimes = times.map((item) => ({ time: item.time, quantity: Number(item.quantity.replace(',', '.')), unit }));
    if (planned && normalizedTimes.some((item) => !item.time || !Number.isFinite(item.quantity) || item.quantity <= 0)) { setError('Укажите корректное время и количество для каждого приема.'); return; }
    if (planned && new Set(normalizedTimes.map((item) => item.time)).size !== normalizedTimes.length) { setError('Время приема не должно повторяться.'); return; }
    if (frequency === 'weekdays' && !weekdays.length) { setError('Выберите хотя бы один день недели.'); return; }
    if (frequency === 'interval' && (!Number.isInteger(interval) || interval < 2)) { setError('Интервал должен быть не меньше двух дней.'); return; }
    if (frequency === 'cycle' && (!Number.isInteger(active) || active < 1 || !Number.isInteger(rest) || rest < 1)) { setError('Укажите целое число дней приема и перерыва.'); return; }
    savingRef.current = true; setSaving(true); setError('');
    try {
      await saveSchedule({ medicationId: medication.id, frequency, startOn: schedule?.startOn ?? localDate(), endOn: null, weekdays, intervalDays: frequency === 'interval' ? interval : null, activeDays: frequency === 'cycle' ? active : null, restDays: frequency === 'cycle' ? rest : null, times: planned ? normalizedTimes : [] }, scheduleId);
      onSaved();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить график. Повторите попытку.'); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const chooser = <div className="lc-schedule-flow"><p className="lc-eyebrow">ШАГ 1 ИЗ 2</p><h2>Когда принимать?</h2><p>Сначала выберите тип графика. Дни и время настраиваются на следующем шаге.</p><div className="lc-schedule-modes">{modes.map((mode) => <button disabled={saving} key={mode.id} className={frequency === mode.id ? 'is-selected' : ''} onClick={() => { setFrequency(mode.id); setError(''); }}><span><strong>{mode.label}</strong><small>{mode.description}</small></span><i /></button>)}</div></div>;
  const timeRows = <section className="lc-time-section"><div className="lc-time-section__heading"><h3>Время приема</h3><span>{times.length} из 5</span></div><div className="lc-time-list">{times.map((item, index) => <div className="lc-time-row" key={item.id}><label><span>Время {index + 1}</span><input disabled={saving} aria-label={'Время приема ' + String(index + 1)} type="time" value={item.time} onChange={(event) => updateTime(item.id, { time: event.target.value })} /></label><label><span>Количество</span><div className="lc-input-with-unit"><input disabled={saving} aria-label={'Количество для приема ' + String(index + 1)} inputMode="decimal" value={item.quantity} onChange={(event) => updateTime(item.id, { quantity: event.target.value })} /><span>{unit}</span></div></label>{times.length > 1 ? <button disabled={saving} className="lc-remove-time" aria-label={'Удалить время ' + String(index + 1)} onClick={() => removeTime(item.id)}><Icon name="close" /></button> : null}</div>)}</div>{times.length < 5 ? <button disabled={saving} className="lc-add-time" onClick={addTime}><Icon name="plus" />Добавить время</button> : <p className="lc-time-limit">Можно добавить не более 5 времен.</p>}</section>;
  const settings = <div className="lc-schedule-flow lc-schedule-flow--settings"><p className="lc-eyebrow">ШАГ 2 ИЗ 2</p><h2>{selectedMode.label}</h2><button disabled={saving} className="lc-schedule-change" onClick={() => setStep(0)}>Изменить тип графика</button>{frequency === 'weekdays' ? <div className="lc-weekday-choice" aria-label="Дни недели">{days.map((day) => <button disabled={saving} key={day.value} className={weekdays.includes(day.value) ? 'is-selected' : ''} onClick={() => { setWeekdays((current) => current.includes(day.value) ? current.filter((value) => value !== day.value) : [...current, day.value]); setError(''); }}>{day.label}</button>)}</div> : null}{frequency === 'interval' ? <label className="lc-field">Интервал, дней<input disabled={saving} aria-label="Интервал в днях" inputMode="numeric" value={intervalDays} onChange={(event) => { setIntervalDays(event.target.value); setError(''); }} /></label> : null}{frequency === 'cycle' ? <div className="lc-split-fields"><label className="lc-field">Прием, дней<input disabled={saving} aria-label="Дней приема" inputMode="numeric" value={activeDays} onChange={(event) => { setActiveDays(event.target.value); setError(''); }} /></label><label className="lc-field">Перерыв, дней<input disabled={saving} aria-label="Дней перерыва" inputMode="numeric" value={restDays} onChange={(event) => { setRestDays(event.target.value); setError(''); }} /></label></div> : null}{planned ? timeRows : <p className="lc-schedule-note">Плановые события и напоминания не создаются. Фактический прием вы отметите вручную в карточке препарата.</p>}{error ? <p className="lc-form-error" role="alert">{error}</p> : null}</div>;
  return <Sheet stepKey={step} title={schedule ? 'Изменить график' : 'Настроить прием'} onClose={() => { if (!savingRef.current) onClose(); }} footer={step === 0 ? <button className="lc-primary-button" onClick={() => { setError(''); setStep(1); }}>Продолжить</button> : <div className="lc-flow-actions"><button disabled={saving} className="lc-secondary-button" onClick={() => { setError(''); setStep(0); }}>Назад</button><button className="lc-primary-button" disabled={saving} onClick={() => void save()}>{saving ? 'Сохраняем...' : 'Сохранить график'}</button></div>}>{step === 0 ? chooser : settings}</Sheet>;
}
