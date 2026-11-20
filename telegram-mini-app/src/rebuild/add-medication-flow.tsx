import { useState } from 'react';
import type { Cabinet } from './domain/models';
import { useLifeCare } from './state/lifecare-store';
import { Icon } from './ui/icons';
import { Sheet } from './ui/sheet';

const categories = ['От боли и температуры', 'Простуда и кашель', 'Аллергия', 'Желудок и кишечник', 'Сердце и давление', 'Витамины и минералы', 'Без категории'];
const forms = ['Таблетка', 'Капсула', 'Раствор', 'Капли', 'Сироп', 'Мазь или крем', 'Другая форма'];
type Draft = { name: string; category: string; form: string; packageDose: string; quantity: string; unit: string; expiresOn: string };
const initialDraft: Draft = { name: '', category: 'Без категории', form: 'Таблетка', packageDose: '', quantity: '', unit: 'шт.', expiresOn: '' };

export function AddMedicationFlow({ cabinet, onClose }: { cabinet: Cabinet; onClose: () => void }) {
  const { addMedication } = useLifeCare();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [error, setError] = useState('');
  const update = (patch: Partial<Draft>) => { setDraft((current) => ({ ...current, ...patch })); setError(''); };
  const lastStep = 4;
  const next = () => {
    if (step === 0 && !draft.name.trim()) { setError('Введите название препарата.'); return; }
    if (step === 4 && (!Number.isFinite(Number(draft.quantity)) || Number(draft.quantity) < 0)) { setError('Укажите количество: ноль или положительное число.'); return; }
    if (step < lastStep) { setStep((current) => current + 1); return; }
    addMedication({ cabinetId: cabinet.id, name: draft.name, category: draft.category === 'Без категории' ? null : draft.category, form: draft.form === 'Другая форма' ? 'Другая форма' : draft.form, packageDose: draft.packageDose.trim() || null, quantity: Number(draft.quantity), unit: draft.unit, expiresOn: draft.expiresOn || null });
    setStep(5);
  };
  const title = step === 5 ? 'Препарат добавлен' : 'Новый препарат';
  return <Sheet title={title} onClose={onClose} footer={step === 5 ? <button className="lc-primary-button" onClick={onClose}>Готово</button> : <div className="lc-flow-actions">{step > 0 ? <button className="lc-secondary-button" onClick={() => setStep((current) => current - 1)}>Назад</button> : null}<button className="lc-primary-button" onClick={next}>{step === lastStep ? 'Сохранить препарат' : 'Продолжить'}</button></div>}>
    {step < 5 ? <div className="lc-flow">
      <div className="lc-flow__progress" aria-label={`Шаг ${step + 1} из 5`}><span>Шаг {step + 1} из 5</span><i style={{ width: `${((step + 1) / 5) * 100}%` }} /></div>
      <p className="lc-flow__cabinet">Аптечка: <b>{cabinet.name}</b></p>
      {step === 0 ? <section><h3>Как называется препарат?</h3><p>Название с упаковки. Его можно изменить позднее.</p><label className="lc-field">Название препарата<input autoFocus value={draft.name} onChange={(event) => update({ name: event.target.value })} placeholder="Например, Ибупрофен" /></label></section> : null}
      {step === 1 ? <section><h3>Выберите категорию</h3><p>Это помогает быстрее находить препарат в аптечке.</p><div className="lc-choice-list">{categories.map((item) => <button key={item} className={draft.category === item ? 'is-selected' : ''} onClick={() => update({ category: item })}>{item}<span aria-hidden="true" /></button>)}</div></section> : null}
      {step === 2 ? <section><h3>Лекарственная форма</h3><p>Выберите форму, указанную на упаковке.</p><div className="lc-choice-list">{forms.map((item) => <button key={item} className={draft.form === item ? 'is-selected' : ''} onClick={() => update({ form: item })}>{item}<span aria-hidden="true" /></button>)}</div></section> : null}
      {step === 3 ? <section><h3>Дозировка на упаковке</h3><p>Необязательно. Например, «400 мг» или «5 мг/мл».</p><label className="lc-field">Дозировка<input autoFocus value={draft.packageDose} onChange={(event) => update({ packageDose: event.target.value })} placeholder="Например, 400 мг" /></label></section> : null}
      {step === 4 ? <section><h3>Запас и срок годности</h3><p>Запас указывается для одной упаковки. Позже можно добавить другую партию.</p><div className="lc-split-fields"><label className="lc-field">Количество<input autoFocus inputMode="decimal" value={draft.quantity} onChange={(event) => update({ quantity: event.target.value.replace(',', '.') })} placeholder="0" /></label><label className="lc-field">Единица<select value={draft.unit} onChange={(event) => update({ unit: event.target.value })}><option>шт.</option><option>мл</option><option>г</option></select></label></div><label className="lc-field">Срок годности <small>Необязательно</small><input value={draft.expiresOn} onChange={(event) => update({ expiresOn: event.target.value })} placeholder="ГГГГ-ММ-ДД" inputMode="numeric" /></label></section> : null}
      {error ? <p className="lc-form-error" role="alert">{error}</p> : null}
    </div> : <div className="lc-success"><div><Icon name="check" /></div><h3>{draft.name}</h3><p>{draft.form}{draft.packageDose ? ` · ${draft.packageDose}` : ''}</p><strong>Препарат добавлен в «{cabinet.name}»</strong><button className="lc-text-button" onClick={onClose}>Настроить приём позже</button></div>}
  </Sheet>;
}
