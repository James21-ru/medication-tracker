import { useState } from 'react';
import type { Cabinet, Medication } from './domain/models';
import { BarcodeScanner } from './barcode-scanner';
import { expiryDateToIso, formatExpiryDate } from './date-input';
import { useLifeCare } from './state/lifecare-store';
import { Icon } from './ui/icons';
import { Sheet } from './ui/sheet';

const forms = ['Таблетка', 'Капсула', 'Раствор', 'Капли', 'Сироп', 'Мазь или крем', 'Другая форма'];
type Draft = { name: string; form: string; packageDose: string; quantity: string; unit: string; expiresOn: string; barcode: string };
const initialDraft: Draft = { name: '', form: 'Таблетка', packageDose: '', quantity: '', unit: 'шт.', expiresOn: '', barcode: '' };

export function AddMedicationFlow({ cabinet, onClose, onAdded }: { cabinet: Cabinet; onClose: () => void; onAdded?: (medication: Medication) => void }) {
  const { addMedication } = useLifeCare();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [error, setError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const update = (patch: Partial<Draft>) => { setDraft((current) => ({ ...current, ...patch })); setError(''); };
  const next = () => {
    if (step === 0 && !draft.name.trim()) { setError('Введите название препарата.'); return; }
    if (step === 0) { setStep(1); return; }
    if (step === 1 && (!draft.quantity.trim() || !Number.isFinite(Number(draft.quantity)) || Number(draft.quantity) < 0)) { setError('Укажите количество: ноль или положительное число.'); return; }
    if (step === 1 && draft.expiresOn && !expiryDateToIso(draft.expiresOn)) { setError('Введите существующую дату в формате ДД.ММ.ГГ или ДД.ММ.ГГГГ.'); return; }
    const medication = addMedication({ cabinetId: cabinet.id, name: draft.name, category: null, form: draft.form, packageDose: draft.packageDose.trim() || null, barcode: draft.barcode || null, quantity: Number(draft.quantity), unit: draft.unit, expiresOn: draft.expiresOn ? expiryDateToIso(draft.expiresOn) : null });
    if (onAdded) { onAdded(medication); return; }
    setStep(2);
  };
  const footer = step === 2 ? <button className="lc-primary-button" onClick={onClose}>Готово</button> : <div className="lc-flow-actions">{step === 1 ? <button className="lc-secondary-button" onClick={() => { setError(''); setStep(0); }}>Назад</button> : null}<button className="lc-primary-button" onClick={next}>{step === 1 ? 'Сохранить препарат' : 'Продолжить'}</button></div>;
  return <><Sheet title={step === 2 ? 'Препарат добавлен' : 'Новый препарат'} onClose={onClose} footer={footer}>
    {step === 0 ? <section className="lc-flow lc-flow--compact"><p className="lc-eyebrow">НОВЫЙ ПРЕПАРАТ</p><h3>Как называется препарат?</h3><label className="lc-field lc-field--name"><input aria-label="Название препарата" autoFocus value={draft.name} onChange={(event) => update({ name: event.target.value })} placeholder="Например, Ибупрофен" /></label><button className="lc-scan-button" onClick={() => setScannerOpen(true)}><Icon name="barcode" />Сканировать штрихкод</button>{draft.barcode ? <p className="lc-barcode-value">Штрихкод распознан</p> : null}{error ? <p className="lc-form-error" role="alert">{error}</p> : null}</section> : null}
    {step === 1 ? <section className="lc-flow lc-flow--compact"><p className="lc-eyebrow">ОСТАТОК В УПАКОВКЕ</p><h3>Форма, запас и срок</h3><p>Эти данные помогут вести учёт препарата. Срок годности можно добавить позже.</p><div className="lc-split-fields lc-split-fields--balanced"><label className="lc-field">Форма<select value={draft.form} onChange={(event) => update({ form: event.target.value })}>{forms.map((item) => <option key={item}>{item}</option>)}</select></label><label className="lc-field">Дозировка <small>Необязательно</small><input value={draft.packageDose} onChange={(event) => update({ packageDose: event.target.value })} placeholder="400 мг" /></label></div><div className="lc-split-fields lc-split-fields--balanced"><label className="lc-field">Количество<input autoFocus inputMode="decimal" value={draft.quantity} onChange={(event) => update({ quantity: event.target.value.replace(',', '.') })} placeholder="0" /></label><label className="lc-field">Единица<select value={draft.unit} onChange={(event) => update({ unit: event.target.value })}><option>шт.</option><option>мл</option><option>г</option></select></label></div><label className="lc-field">Срок годности <small>Необязательно</small><input value={draft.expiresOn} onChange={(event) => update({ expiresOn: formatExpiryDate(event.target.value) })} placeholder="ДД.ММ.ГГ" inputMode="numeric" autoComplete="off" maxLength={10} /></label>{error ? <p className="lc-form-error" role="alert">{error}</p> : null}</section> : null}
    {step === 2 ? <div className="lc-success"><div><Icon name="check" /></div><h3>{draft.name}</h3><p>{draft.form}{draft.packageDose ? ` · ${draft.packageDose}` : ''}</p><strong>Препарат добавлен в «{cabinet.name}»</strong><button className="lc-text-button" onClick={onClose}>Настроить приём позже</button></div> : null}
  </Sheet>{scannerOpen ? <BarcodeScanner onClose={() => setScannerOpen(false)} onDetected={(barcode) => { update({ barcode }); setScannerOpen(false); }} /> : null}</>;
}
