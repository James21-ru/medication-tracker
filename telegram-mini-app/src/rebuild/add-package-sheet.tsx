import { useRef, useState } from 'react';
import type { Medication } from './domain/models';
import { useLifeCare } from './state/lifecare-store';
import { Sheet } from './ui/sheet';
import { expiryDateToIso, formatExpiryDate } from './date-input';

export function AddPackageSheet({ medication, unit, onClose }: { medication: Medication; unit: string; onClose: () => void }) {
  const { addPackage } = useLifeCare();
  const [quantity, setQuantity] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const savingRef = useRef(false);
  const [operationId] = useState(() => `package-${crypto.randomUUID()}`);
  const save = async () => {
    if (savingRef.current) return;
    const amount = Number(quantity.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) { setError('Укажите ноль или положительное количество.'); return; }
    const expiryDate = expiresOn ? expiryDateToIso(expiresOn) : null;
    if (expiresOn && !expiryDate) { setError('Укажите срок в формате ДД.ММ.ГГ или ДД.ММ.ГГГГ.'); return; }
    savingRef.current = true; setSaving(true); setSubmitted(true); setError('');
    try {
      await addPackage({ medicationId: medication.id, quantity: amount, unit, expiresOn: expiryDate }, operationId);
      onClose();
    } catch (reason) { setError(`${reason instanceof Error ? reason.message : 'Не удалось сохранить упаковку.'} Повтор сохранит те же данные.`); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <Sheet title="Добавить упаковку" onClose={() => { if (!savingRef.current) onClose(); }} footer={<button className="lc-primary-button" disabled={saving} onClick={() => void save()}>{saving ? 'Сохраняем...' : 'Добавить упаковку'}</button>}><div className="lc-package-form"><p className="lc-eyebrow">ПОПОЛНЕНИЕ ЗАПАСА</p><h2>{medication.name}</h2><p>Упаковка сохранится отдельной партией. Остатки не смешиваются.</p><label className="lc-field">Количество<input disabled={saving || submitted} aria-label="Количество в упаковке" inputMode="decimal" value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(''); }} placeholder="Например, 20" /></label><p className="lc-unit-note">Единица учета: {unit}</p><label className="lc-field">Срок годности <small>Необязательно</small><input disabled={saving || submitted} aria-label="Срок годности" value={expiresOn} onChange={(event) => { setExpiresOn(formatExpiryDate(event.target.value)); setError(''); }} placeholder="ДД.ММ.ГГ" inputMode="numeric" autoComplete="off" maxLength={10} /></label>{error ? <p className="lc-form-error" role="alert">{error}</p> : null}</div></Sheet>;
}
