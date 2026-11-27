import { useRef, useState } from 'react';
import type { Medication } from './domain/models';
import { useLifeCare } from './state/lifecare-store';
import { Sheet } from './ui/sheet';

const categories = ['От боли и температуры', 'Простуда и кашель', 'Аллергия', 'Желудок и кишечник', 'Сердце и давление', 'Витамины и минералы', 'Без категории'];
const forms = ['Таблетка', 'Капсула', 'Раствор', 'Капли', 'Сироп', 'Мазь или крем', 'Другая форма'];

export function EditMedicationSheet({ medication, onClose }: { medication: Medication; onClose: () => void }) {
  const { updateMedication } = useLifeCare();
  const [name, setName] = useState(medication.name);
  const [category, setCategory] = useState(medication.category ?? 'Без категории');
  const [form, setForm] = useState(medication.form);
  const [packageDose, setPackageDose] = useState(medication.packageDose ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const save = async () => {
    if (savingRef.current) return;
    if (!name.trim()) { setError('Введите название препарата.'); return; }
    savingRef.current = true; setSaving(true); setError('');
    try {
      await updateMedication(medication.id, { name, category: category === 'Без категории' ? null : category, form, packageDose: packageDose.trim() || null });
      onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить изменения. Повторите попытку.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <Sheet title="Изменить препарат" onClose={() => { if (!savingRef.current) onClose(); }} footer={<button className="lc-primary-button" disabled={saving} onClick={() => void save()}>{saving ? 'Сохраняем...' : 'Сохранить изменения'}</button>}><div className="lc-edit-medication"><p className="lc-eyebrow">КАРТОЧКА ПРЕПАРАТА</p><h2>Основные данные</h2><label className="lc-field">Название препарата<input disabled={saving} value={name} onChange={(event) => { setName(event.target.value); setError(''); }} /></label><label className="lc-field">Категория<select disabled={saving} value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label className="lc-field">Лекарственная форма<select disabled={saving} value={form} onChange={(event) => setForm(event.target.value)}>{forms.map((item) => <option key={item}>{item}</option>)}</select></label><label className="lc-field">Дозировка на упаковке <small>Необязательно</small><input disabled={saving} value={packageDose} onChange={(event) => setPackageDose(event.target.value)} placeholder="Например, 400 мг" /></label>{error ? <p className="lc-form-error" role="alert">{error}</p> : null}</div></Sheet>;
}
