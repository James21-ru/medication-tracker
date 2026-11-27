import { useRef, useState } from 'react';
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
  const [saving, setSaving] = useState(false);
  const [retryPending, setRetryPending] = useState(false);
  const savingRef = useRef(false);
  const record = useRef<Parameters<typeof setDoseStatus>[0] | null>(null);
  const submit = async () => {
    if (savingRef.current) return;
    const amount = Number(quantity.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) { setError('Укажите количество принятого препарата.'); return; }
    record.current ??= { slotId: `manual:${schedule.id}:${localDate()}:${crypto.randomUUID()}`, date: localDate(), time: localTime(), medicationId: medication.id, quantity: amount, unit: time?.unit ?? 'шт.', status: 'taken' };
    savingRef.current = true; setSaving(true); setError('');
    try {
      const result = await setDoseStatus(record.current);
      if (!result.ok) { record.current = null; setRetryPending(false); setError(result.error ?? 'Не удалось отметить прием.'); return; }
      onClose();
    } catch (reason) { setRetryPending(true); setError(`${reason instanceof Error ? reason.message : 'Не удалось сохранить прием.'} Повтор сохранит те же данные.`); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <Sheet title="Отметить прием" onClose={() => { if (!savingRef.current) onClose(); }} footer={<button className="lc-primary-button" disabled={saving} onClick={() => void submit()}>{saving ? 'Сохраняем...' : 'Отметить как принятое'}</button>}><div className="lc-package-form"><p className="lc-eyebrow">ПО МЕРЕ НЕОБХОДИМОСТИ</p><h2>{medication.name}</h2><p>Запись появится в отчете, а количество будет списано из пригодных упаковок.</p><label className="lc-field">Количество<div className="lc-input-with-unit"><input disabled={saving || retryPending} aria-label="Количество принятого препарата" inputMode="decimal" value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(''); }} /><span>{time?.unit ?? 'шт.'}</span></div></label>{error ? <p className="lc-form-error" role="alert">{error}</p> : null}</div></Sheet>;
}
