import { useState } from 'react';
import type { Medication } from './domain/models';
import { useLifeCare } from './state/lifecare-store';
import { Sheet } from './ui/sheet';

export function AddPackageSheet({ medication, unit, onClose }: { medication: Medication; unit: string; onClose: () => void }) {
  const { addPackage } = useLifeCare();
  const [quantity, setQuantity] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [error, setError] = useState('');
  const save = () => {
    const amount = Number(quantity.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) { setError('Укажите ноль или положительное количество.'); return; }
    if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) { setError('Укажите срок в формате ГГГГ-ММ-ДД.'); return; }
    addPackage({ medicationId: medication.id, quantity: amount, unit, expiresOn: expiresOn || null });
    onClose();
  };
  return <Sheet title="Добавить упаковку" onClose={onClose} footer={<button className="lc-primary-button" onClick={save}>Добавить упаковку</button>}><div className="lc-package-form"><p className="lc-eyebrow">ПОПОЛНЕНИЕ ЗАПАСА</p><h2>{medication.name}</h2><p>Упаковка сохранится отдельной партией. Остатки не смешиваются.</p><label className="lc-field">Количество<input aria-label="Количество в упаковке" autoFocus inputMode="decimal" value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(''); }} placeholder="Например, 20" /></label><p className="lc-unit-note">Единица учёта: {unit}</p><label className="lc-field">Срок годности <small>Необязательно</small><input aria-label="Срок годности" value={expiresOn} onChange={(event) => { setExpiresOn(event.target.value); setError(''); }} placeholder="ГГГГ-ММ-ДД" inputMode="numeric" /></label>{error ? <p className="lc-form-error" role="alert">{error}</p> : null}</div></Sheet>;
}
