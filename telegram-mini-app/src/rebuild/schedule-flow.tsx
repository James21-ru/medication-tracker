import { useState } from 'react';
import type { Medication } from './domain/models';
import { useLifeCare } from './state/lifecare-store';
import { Sheet } from './ui/sheet';

const localDate = () => new Intl.DateTimeFormat('en-CA').format(new Date());

export function ScheduleFlow({ medication, unit, onClose }: { medication: Medication; unit: string; onClose: () => void }) {
  const { createDailySchedule } = useLifeCare();
  const [time, setTime] = useState('09:00');
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState('');
  const save = () => {
    const amount = Number(quantity.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) { setError('Укажите количество на один приём.'); return; }
    createDailySchedule({ medicationId: medication.id, startOn: localDate(), time, quantity: amount, unit });
    onClose();
  };
  return <Sheet title="Настроить приём" onClose={onClose} footer={<button className="lc-primary-button" onClick={save}>Сохранить график</button>}><div className="lc-schedule-flow"><p className="lc-eyebrow">ЕЖЕДНЕВНО</p><h2>{medication.name}</h2><p>Настройте один ежедневный приём. Другие режимы добавим следующим этапом.</p><label className="lc-field">Время<input aria-label="Время приёма" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label><label className="lc-field">Количество за приём<div className="lc-input-with-unit"><input aria-label="Количество за приём" inputMode="decimal" value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(''); }} /><span>{unit}</span></div></label>{error ? <p className="lc-form-error" role="alert">{error}</p> : null}<p className="lc-schedule-note">График начнётся сегодня. Напоминания Telegram пока не включаются автоматически.</p></div></Sheet>;
}
