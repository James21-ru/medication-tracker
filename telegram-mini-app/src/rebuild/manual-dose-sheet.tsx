import { useState } from 'react';
import type { Medication, MedicationSchedule } from './domain/models';
import { useLifeCare } from './state/lifecare-store';
import { Sheet } from './ui/sheet';

const localDate = () => new Intl.DateTimeFormat('en-CA').format(new Date());
const localTime = () => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

export function ManualDoseSheet({ medication, schedule, onClose }: { medication: Medication; schedule: MedicationSchedule; onClose: () => void }) {
  const { setDoseStatus } = useLifeCare();
  const time = schedule.times[0];
  const [quantity, setQuantity] = useState(String(time?.quantity ?? 1));
  const [error, setError] = useState('');
  const submit = () => {
    const amount = Number(quantity.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) { setError('Укажите количество принятого препарата.'); return; }
    const result = setDoseStatus({ slotId: `manual:${schedule.id}:${localDate()}:${Date.now()}`, medicationId: medication.id, date: localDate(), time: localTime(), quantity: amount, unit: time?.unit ?? 'шт.', status: 'taken' });
    if (!result.ok) { setError(result.error ?? 'Не удалось отметить приём.'); return; }
    onClose();
  };
  return <Sheet title="Отметить приём" onClose={onClose} footer={<button className="lc-primary-button" onClick={submit}>Отметить как принятое</button>}><div className="lc-package-form"><p className="lc-eyebrow">ПО МЕРЕ НЕОБХОДИМОСТИ</p><h2>{medication.name}</h2><p>Запись появится в отчёте, а количество будет списано из пригодных упаковок.</p><label className="lc-field">Количество<div className="lc-input-with-unit"><input aria-label="Количество принятого препарата" autoFocus inputMode="decimal" value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(''); }} /><span>{time?.unit ?? 'шт.'}</span></div></label>{error ? <p className="lc-form-error" role="alert">{error}</p> : null}</div></Sheet>;
}
