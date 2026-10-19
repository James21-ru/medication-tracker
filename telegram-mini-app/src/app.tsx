import { useEffect, useMemo, useRef, useState } from 'react';

type Tab = 'doses' | 'cabinet';
type Cabinet = { id: string; name: string };
type Medication = { id: string; cabinet_id: string; name: string; category?: string; form: string; amount: string; unit: string; note?: string; purchase_reminder?: boolean; color: string };
type Package = { id: string; medication_id: string; quantity_remaining: number; unit: string; expires_on: string | null };
type Dose = { id: string; medication_id: string; scheduled_time: string; quantity: number; unit: string; status: 'pending' | 'taken' | 'skipped' };
type MedicationSchedule = { id: string; medication_id: string; scheduled_time: string; dose_quantity: number; dose_unit: string };
type ScheduleDraft = { time: string; quantity: string };
type MedicationDraft = { name: string; category: string; customCategory: string; form: string; amount: string; unit: string; quantity: string; expiresOn: string; note: string; purchaseReminder: boolean; schedules: ScheduleDraft[] };
type LocalData = { cabinets: Cabinet[]; medications: Medication[]; packages: Package[]; doses: Dose[]; schedules: MedicationSchedule[] };

const today = () => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
const dateKey = (date: Date) => new Intl.DateTimeFormat('en-CA').format(date);
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const blankDraft: MedicationDraft = { name: '', category: '', customCategory: '', form: 'Таблетка', amount: '', unit: 'мг', quantity: '', expiresOn: '', note: '', purchaseReminder: false, schedules: [] };
const medicationDescription = (medication: Medication) => medication.amount ? `${medication.form} · ${medication.amount} ${medication.unit}` : medication.form;
const formatExpirationInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('.');
};
const expirationDateKey = (value: string) => {
  if (!value) return null;
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText), month = Number(monthText), year = Number(yearText);
  const candidate = new Date(year, month - 1, day);
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return null;
  return `${yearText}-${monthText}-${dayText}`;
};
const localStorageKey = 'lifecare-mini-app-data-v2';
const emptyLocalData = (): LocalData => ({ cabinets: [{ id: 'cabinet-home', name: 'Домашняя аптечка' }], medications: [], packages: [], doses: [], schedules: [] });
function readLocalData(): LocalData { try { const value = window.localStorage.getItem(localStorageKey); if (!value) return emptyLocalData(); const parsed = JSON.parse(value) as Partial<LocalData>; if (!Array.isArray(parsed.cabinets) || !Array.isArray(parsed.medications) || !Array.isArray(parsed.packages) || !Array.isArray(parsed.doses) || !Array.isArray(parsed.schedules)) return emptyLocalData(); return { cabinets: parsed.cabinets, medications: parsed.medications, packages: parsed.packages, doses: parsed.doses, schedules: parsed.schedules }; } catch { return emptyLocalData(); } }

export function App() {
  const initialData = useMemo(readLocalData, []);
  const [tab, setTab] = useState<Tab>('doses');
  const [loading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cabinets, setCabinets] = useState<Cabinet[]>(initialData.cabinets);
  const [selectedCabinetId, setSelectedCabinetId] = useState<string | null>(initialData.cabinets[0]?.id ?? null);
  const [medications, setMedications] = useState<Medication[]>(initialData.medications);
  const [packages, setPackages] = useState<Package[]>(initialData.packages);
  const [doses, setDoses] = useState<Dose[]>(initialData.doses);
  const [schedules, setSchedules] = useState<MedicationSchedule[]>(initialData.schedules);
  const [selectedDate, setSelectedDate] = useState(today);
  const [showAddMedication, setShowAddMedication] = useState(false);
  const [packageMedication, setPackageMedication] = useState<Medication | null>(null);
  const [detailMedication, setDetailMedication] = useState<Medication | null>(null);
  const [medicationEditor, setMedicationEditor] = useState<Medication | null>(null);
  const [medicationToDelete, setMedicationToDelete] = useState<Medication | null>(null);
  const [showCabinetPicker, setShowCabinetPicker] = useState(false);
  const [cabinetEditor, setCabinetEditor] = useState<{ mode: 'create' } | { mode: 'rename'; cabinet: Cabinet } | null>(null);
  const [updatingDoseId, setUpdatingDoseId] = useState<string | null>(null);
  const updatingDoseIds = useRef(new Set<string>());
  useEffect(() => { window.localStorage.setItem(localStorageKey, JSON.stringify({ cabinets, medications, packages, doses, schedules } satisfies LocalData)); }, [cabinets, medications, packages, doses, schedules]);
  const medicationById = useMemo(() => new Map(medications.map((item) => [item.id, item])), [medications]);
  const selectedCabinet = useMemo(() => cabinets.find((item) => item.id === selectedCabinetId) ?? null, [cabinets, selectedCabinetId]);
  const cabinetMedications = useMemo(() => medications.filter((item) => item.cabinet_id === selectedCabinetId), [medications, selectedCabinetId]);
  const packagesByMedication = useMemo(() => packages.reduce<Map<string, Package[]>>((result, item) => { result.set(item.medication_id, [...(result.get(item.medication_id) ?? []), item]); return result; }, new Map()), [packages]);
  const schedulesByMedication = useMemo(() => schedules.reduce<Map<string, MedicationSchedule[]>>((result, item) => { result.set(item.medication_id, [...(result.get(item.medication_id) ?? []), item]); return result; }, new Map()), [schedules]);
  const showNotice = (text: string) => { setNotice(text); window.setTimeout(() => setNotice((current) => current === text ? null : current), 4000); };

  async function chooseDate(date: Date) { setSelectedDate(date); }
  async function refreshData() { setRefreshing(true); showNotice('Данные сохранены на этом устройстве.'); window.setTimeout(() => setRefreshing(false), 180); }
  async function markDose(dose: Dose, status: 'taken' | 'skipped') {
    if (dose.status !== 'pending') return;
    if (updatingDoseIds.current.has(dose.id)) return;
    updatingDoseIds.current.add(dose.id); setUpdatingDoseId(dose.id);
    try {
      const available = packages.filter((item) => item.medication_id === dose.medication_id && item.unit === dose.unit && Number(item.quantity_remaining) > 0 && (!item.expires_on || item.expires_on >= dateKey(today()))).reduce((total, item) => total + Number(item.quantity_remaining), 0);
      if (status === 'taken' && available < Number(dose.quantity)) { setMessage(`Недостаточно препарата в аптечке: доступно ${available} ${dose.unit}. Добавьте упаковку перед отметкой приёма.`); return; }
      const completedStatus = status;
      setDoses((current) => current.map((item) => item.id === dose.id ? { ...item, status: completedStatus } : item));
      if (completedStatus === 'taken') {
        setPackages((current) => {
          let remaining = Number(dose.quantity);
          const next = current.map((item) => ({ ...item }));
          const available = next.filter((item) => item.medication_id === dose.medication_id && item.unit === dose.unit && Number(item.quantity_remaining) > 0 && (!item.expires_on || item.expires_on >= dateKey(today()))).sort((left, right) => (left.expires_on ?? '9999-12-31').localeCompare(right.expires_on ?? '9999-12-31'));
          for (const pack of available) {
            if (remaining <= 0) break;
            const used = Math.min(remaining, Number(pack.quantity_remaining));
            pack.quantity_remaining = Number(pack.quantity_remaining) - used;
            remaining -= used;
          }
          return next;
        });
      }
      setMessage(null);
      showNotice(completedStatus === 'taken' ? 'Приём отмечен: принято.' : 'Приём отмечен: пропущено.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось обновить приём. Попробуйте ещё раз.'); }
    finally { updatingDoseIds.current.delete(dose.id); setUpdatingDoseId((current) => current === dose.id ? null : current); }
  }
  async function addMedication(draft: MedicationDraft, operationId: string) {
    if (!selectedCabinetId) throw new Error('Сначала создайте аптечку.');
    const quantity = Number(draft.quantity);
    const scheduleEntries = draft.schedules.map((schedule, index) => ({ id: `${operationId}-schedule-${index + 1}`, time: schedule.time, quantity: Number(schedule.quantity) }));
    if (!draft.name.trim() || !Number.isFinite(quantity) || quantity <= 0) { setMessage('Укажите название препарата и количество в наличии.'); return; }
    const stockUnit = ['Жидкость', 'Капли', 'Сироп'].includes(draft.form) ? 'мл' : 'шт.';
    const medicationId = `${operationId}-medication`;
    const packageId = `${operationId}-package`;
    setMedications((current) => [{ id: medicationId, cabinet_id: selectedCabinetId, name: draft.name.trim(), category: draft.category === 'Своя категория' ? draft.customCategory.trim() : draft.category, form: draft.form, amount: draft.amount.trim(), unit: draft.unit, note: draft.note.trim(), purchase_reminder: draft.purchaseReminder, color: '#20A278' }, ...current]);
    setPackages((current) => [{ id: packageId, medication_id: medicationId, quantity_remaining: quantity, unit: stockUnit, expires_on: expirationDateKey(draft.expiresOn) }, ...current]);
    setSchedules((current) => [...scheduleEntries.map((schedule) => ({ id: schedule.id, medication_id: medicationId, scheduled_time: schedule.time, dose_quantity: schedule.quantity, dose_unit: stockUnit })), ...current]);
    if (dateKey(selectedDate) === dateKey(today())) setDoses((current) => [...current, ...scheduleEntries.map((schedule) => ({ id: `${schedule.id}-dose-${dateKey(today()).replaceAll('-', '')}`, medication_id: medicationId, scheduled_time: schedule.time, quantity: schedule.quantity, unit: stockUnit, status: 'pending' as const }))].sort((left, right) => left.scheduled_time.localeCompare(right.scheduled_time)));
    setShowAddMedication(false);
    showNotice('Препарат добавлен в аптечку.');
  }
  async function addPackage(medication: Medication, quantityText: string, expiresOn: string, packageId: string) {
    const quantity = Number(quantityText);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Укажите количество в упаковке.');
    const unit = ['Жидкость', 'Капли', 'Сироп'].includes(medication.form) ? 'мл' : 'шт.';
    const expiration = expirationDateKey(expiresOn);
    if (expiresOn && !expiration) throw new Error('Укажите существующую дату в формате ДД.ММ.ГГГГ.');
    setPackages((current) => [{ id: packageId, medication_id: medication.id, quantity_remaining: quantity, unit, expires_on: expiration }, ...current]);
    setPackageMedication(null);
    showNotice('Упаковка добавлена в аптечку.');
  }
  async function saveMedication(medication: Medication, values: Pick<Medication, 'name' | 'category' | 'form' | 'amount' | 'unit' | 'note' | 'purchase_reminder'>) {
    if (!values.name.trim()) throw new Error('Укажите название препарата.');
    setMedications((current) => current.map((item) => item.id === medication.id ? { ...item, ...values, name: values.name.trim(), category: values.category?.trim(), amount: values.amount.trim(), note: values.note?.trim() } : item));
    setMedicationEditor(null);
    showNotice('Карточка препарата обновлена.');
  }
  function deleteMedication(medication: Medication) {
    setMedications((current) => current.filter((item) => item.id !== medication.id));
    setPackages((current) => current.filter((item) => item.medication_id !== medication.id));
    setSchedules((current) => current.filter((item) => item.medication_id !== medication.id));
    setDoses((current) => current.filter((item) => item.medication_id !== medication.id));
    setMedicationToDelete(null);
    setDetailMedication(null);
    showNotice('Препарат удалён из аптечки.');
  }

  async function saveCabinet(name: string) {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('Введите название аптечки.');
    if (cabinetEditor?.mode === 'rename') {
      setCabinets((current) => current.map((item) => item.id === cabinetEditor.cabinet.id ? { ...item, name: normalizedName } : item));
      showNotice('Название аптечки изменено.');
    } else {
      const cabinetId = makeId('cabinet');
      setCabinets((current) => [...current, { id: cabinetId, name: normalizedName }]);
      setSelectedCabinetId(cabinetId);
      showNotice('Новая аптечка создана.');
    }
    setCabinetEditor(null);
  }

  const title = tab === 'doses' ? 'Приёмы' : selectedCabinet?.name ?? 'Аптечка';
  const eyebrow = tab === 'doses' ? 'СЕГОДНЯ' : 'ДОМАШНЯЯ АПТЕЧКА';
  return <main className={`app-shell app-shell--${tab}`}>
    <header className="header">{tab === 'cabinet' ? <div className="cabinet-heading"><p className="eyebrow">{eyebrow}</p><div className="cabinet-title-row"><h1>{title}</h1>{selectedCabinet ? <button className="cabinet-edit" onClick={() => setCabinetEditor({ mode: 'rename', cabinet: selectedCabinet })} aria-label="Переименовать аптечку">✎</button> : null}</div><div className="cabinet-toolbar"><button className="cabinet-switch" onClick={() => setShowCabinetPicker(true)}>{selectedCabinet ? 'Все аптечки' : 'Выбрать аптечку'} <span>⌄</span></button><button className="cabinet-new" onClick={() => setCabinetEditor({ mode: 'create' })}>＋ Новая</button></div></div> : <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>}<button className="round-button" disabled={refreshing || (tab === 'cabinet' && !selectedCabinet)} onClick={tab === 'cabinet' ? () => setShowAddMedication(true) : () => void refreshData()} aria-label={tab === 'cabinet' ? 'Добавить препарат' : 'Обновить данные'}>{tab === 'cabinet' ? '+' : refreshing ? '…' : '↻'}</button></header>
    {message ? <div className="message" role="alert">{message}</div> : null}
    {notice ? <div className="notice" role="status">{notice}</div> : null}
    {loading ? <div className="loading"><span className="loader" />Загружаем данные…</div> : tab === 'doses' ? <Doses doses={doses} medicationById={medicationById} selectedDate={selectedDate} updatingDoseId={updatingDoseId} onSelectDate={chooseDate} onMark={markDose} /> : selectedCabinet ? <Cabinet cabinetName={selectedCabinet.name} medications={cabinetMedications} packagesByMedication={packagesByMedication} onAdd={() => setShowAddMedication(true)} onAddPackage={setPackageMedication} onOpen={setDetailMedication} /> : <CabinetEmpty onCreate={() => setCabinetEditor({ mode: 'create' })} />}
    <nav className="tabbar tabbar--two" aria-label="Разделы"><TabButton active={tab === 'doses'} onClick={() => setTab('doses')} icon="⌂" label="Приёмы" /><TabButton active={tab === 'cabinet'} onClick={() => setTab('cabinet')} icon="▰" label="Аптечка" /></nav>
    {showAddMedication ? <AddMedication onClose={() => setShowAddMedication(false)} onSubmit={addMedication} /> : null}
    {packageMedication ? <AddPackage medication={packageMedication} onClose={() => setPackageMedication(null)} onSubmit={addPackage} /> : null}
    {detailMedication ? <MedicationDetails medication={detailMedication} packages={packagesByMedication.get(detailMedication.id) ?? []} schedules={schedulesByMedication.get(detailMedication.id) ?? []} onClose={() => setDetailMedication(null)} onEdit={() => { setDetailMedication(null); setMedicationEditor(detailMedication); }} onDelete={() => { setDetailMedication(null); setMedicationToDelete(detailMedication); }} onAddPackage={() => { setDetailMedication(null); setPackageMedication(detailMedication); }} /> : null}
    {medicationEditor ? <MedicationEditor medication={medicationEditor} onClose={() => setMedicationEditor(null)} onSave={saveMedication} /> : null}
    {medicationToDelete ? <DeleteMedicationConfirm medication={medicationToDelete} onCancel={() => setMedicationToDelete(null)} onConfirm={deleteMedication} /> : null}
    {showCabinetPicker ? <CabinetPicker cabinets={cabinets} medications={medications} selectedId={selectedCabinetId} onClose={() => setShowCabinetPicker(false)} onSelect={(cabinetId) => { setSelectedCabinetId(cabinetId); setShowCabinetPicker(false); }} onCreate={() => { setShowCabinetPicker(false); setCabinetEditor({ mode: 'create' }); }} /> : null}
    {cabinetEditor ? <CabinetEditor cabinet={cabinetEditor.mode === 'rename' ? cabinetEditor.cabinet : null} onClose={() => setCabinetEditor(null)} onSave={saveCabinet} /> : null}
  </main>;
}

function Doses({ doses, medicationById, selectedDate, updatingDoseId, onSelectDate, onMark }: { doses: Dose[]; medicationById: Map<string, Medication>; selectedDate: Date; updatingDoseId: string | null; onSelectDate: (date: Date) => Promise<void>; onMark: (dose: Dose, status: 'taken' | 'skipped') => Promise<void> }) {
  const pendingDose = doses.find((dose) => dose.status === 'pending');
  const taken = doses.filter((dose) => dose.status === 'taken').length;
  const isToday = dateKey(selectedDate) === dateKey(today());
  const canMark = dateKey(selectedDate) <= dateKey(today());
  const emptyTitle = isToday ? 'На сегодня ничего не запланировано' : 'На этот день ничего не запланировано';
  const completedTitle = isToday ? 'Все приёмы на сегодня отмечены' : 'Все приёмы за этот день отмечены';
  return <section className="doses-screen"><Calendar selectedDate={selectedDate} onSelect={onSelectDate} />{pendingDose ? <NextDose dose={pendingDose} medication={medicationById.get(pendingDose.medication_id)} canMark={canMark} isUpdating={pendingDose.id === updatingDoseId} onMark={onMark} /> : <div className="empty"><div className="empty-icon">✓</div><h2>{doses.length ? completedTitle : emptyTitle}</h2><p>{doses.length ? `${taken} из ${doses.length} приёмов отмечено как принято.` : 'Выберите другую дату, чтобы посмотреть приёмы.'}</p></div>}{doses.length > 0 ? <><section className="progress-card"><p>ПРОГРЕСС ЗА {isToday ? 'СЕГОДНЯ' : 'ДЕНЬ'}</p><strong>{Math.round((taken / doses.length) * 100)}%</strong><div><i style={{ width: `${(taken / doses.length) * 100}%` }} /></div></section><p className="section-caption">ВСЕ ПРИЁМЫ</p><div className="dose-list">{doses.map((dose) => <DoseRow key={dose.id} dose={dose} medication={medicationById.get(dose.medication_id)} canMark={canMark} isUpdating={dose.id === updatingDoseId} onMark={onMark} />)}</div></> : null}</section>;
}

function Calendar({ selectedDate, onSelect }: { selectedDate: Date; onSelect: (date: Date) => Promise<void> }) {
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(selectedDate); date.setDate(selectedDate.getDate() + index - 3); return date; });
  const heading = dateKey(selectedDate) === dateKey(today()) ? 'Сегодня' : new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(selectedDate);
  return <section className="calendar"><h2>{heading}</h2><p>Выберите дату</p><div className="calendar-days">{days.map((date) => { const selected = dateKey(date) === dateKey(selectedDate); return <button key={dateKey(date)} className={selected ? 'calendar-day active' : 'calendar-day'} onClick={() => void onSelect(date)}><b>{new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(date).replace('.', '').slice(0, 1).toUpperCase()}</b><span>{date.getDate()}</span></button>; })}</div></section>;
}

function NextDose({ dose, medication, canMark, isUpdating, onMark }: { dose: Dose; medication?: Medication; canMark: boolean; isUpdating: boolean; onMark: (dose: Dose, status: 'taken' | 'skipped') => Promise<void> }) { return <article className="next-dose"><p>{canMark ? 'СЛЕДУЮЩИЙ ПРИЁМ' : 'ЗАПЛАНИРОВАНО'}</p><div className="next-dose__title"><span><strong>{medication?.name ?? 'Препарат'}</strong><small>{medication ? medicationDescription(medication) : `${dose.quantity} ${dose.unit}`}</small></span><time>{dose.scheduled_time.slice(0, 5)}</time></div>{canMark ? <><button disabled={isUpdating} onClick={() => void onMark(dose, 'taken')}>{isUpdating ? 'Отмечаем…' : 'Принять сейчас'}</button><button className="text-button" disabled={isUpdating} onClick={() => void onMark(dose, 'skipped')}>Пропустить</button></> : <p className="next-dose__notice">Отметить приём можно в назначенный день.</p>}</article>; }
function DoseRow({ dose, medication, canMark, isUpdating, onMark }: { dose: Dose; medication?: Medication; canMark: boolean; isUpdating: boolean; onMark: (dose: Dose, status: 'taken' | 'skipped') => Promise<void> }) { return <article className="dose-row"><time>{dose.scheduled_time.slice(0, 5)}</time><span className="med-icon med-icon--small" style={{ background: medication?.color ?? '#20A278' }}>◉</span><div><strong>{medication?.name ?? 'Препарат'}</strong><small>{dose.quantity} {dose.unit}</small></div>{dose.status === 'pending' ? canMark ? <button disabled={isUpdating} onClick={() => void onMark(dose, 'taken')} aria-label="Отметить принятым">{isUpdating ? '…' : '✓'}</button> : <span className="dose-status">Запланировано</span> : <span className={`dose-status ${dose.status}`}>{dose.status === 'taken' ? 'Принято' : 'Пропущено'}</span>}</article>; }

function Cabinet({ cabinetName, medications, packagesByMedication, onAdd, onAddPackage, onOpen }: { cabinetName: string; medications: Medication[]; packagesByMedication: Map<string, Package[]>; onAdd: () => void; onAddPackage: (medication: Medication) => void; onOpen: (medication: Medication) => void }) {
  const [query, setQuery] = useState('');
  const currentDate = dateKey(today());
  const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');
  const filteredMedications = normalizedQuery ? medications.filter((item) => `${item.name} ${item.form}`.toLocaleLowerCase('ru-RU').includes(normalizedQuery)) : medications;
  return <section className="cabinet-screen"><label className="cabinet-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск препарата в аптечке" aria-label="Поиск препарата в аптечке" /></label><p className="medication-count">{normalizedQuery ? `Найдено · ${filteredMedications.length}` : `Все препараты · ${cabinetName}`}</p>{medications.length ? filteredMedications.length ? filteredMedications.map((medication) => { const packs = packagesByMedication.get(medication.id) ?? []; const available = packs.filter((item) => !item.expires_on || item.expires_on >= currentDate); const stock = available.reduce((total, item) => total + Number(item.quantity_remaining), 0); const nextExpiry = available.filter((item) => item.expires_on).map((item) => item.expires_on!).sort()[0]; const expiredCount = packs.filter((item) => item.expires_on && item.expires_on < currentDate && Number(item.quantity_remaining) > 0).length; return <article key={medication.id} className="cabinet-card"><span className="med-icon" style={{ background: medication.color }}>◉</span><div><h2>{medication.name}</h2><p>{medicationDescription(medication)}</p><strong>В запасе: {stock} {packs[0]?.unit ?? 'шт.'}</strong>{nextExpiry ? <small>Ближайший срок: {new Date(`${nextExpiry}T12:00:00`).toLocaleDateString('ru-RU')}</small> : null}{expiredCount ? <small className="expired-note">Просрочено упаковок: {expiredCount}</small> : null}<div className="cabinet-actions"><button onClick={() => onOpen(medication)}>Открыть карточку ›</button><button onClick={() => onAddPackage(medication)}>＋ Упаковка</button></div></div></article>; }) : <div className="cabinet-no-results"><h2>Ничего не найдено</h2><p>Проверьте название или очистите поиск.</p></div> : <div className="empty"><div className="empty-icon">＋</div><h2>Аптечка пуста</h2><p>Добавьте первый препарат — он будет учитываться отдельно в этой аптечке.</p><button className="primary-button" onClick={onAdd}>Добавить препарат</button></div>}</section>;
}

function CabinetEmpty({ onCreate }: { onCreate: () => void }) { return <section className="empty cabinet-empty"><div className="empty-icon">⌂</div><h2>Создайте первую аптечку</h2><p>Например, «Домашняя», «Дача» или «В поездке». Препараты и запасы будут храниться отдельно.</p><button className="primary-button" onClick={onCreate}>Создать аптечку</button></section>; }

function CabinetPicker({ cabinets, medications, selectedId, onClose, onSelect, onCreate }: { cabinets: Cabinet[]; medications: Medication[]; selectedId: string | null; onClose: () => void; onSelect: (id: string) => void; onCreate: () => void }) { return <div className="modal-backdrop"><section className="cabinet-picker" role="dialog" aria-modal="true" aria-labelledby="cabinet-picker-title"><div className="modal-handle" /><header className="sheet-header"><button className="close" onClick={onClose} aria-label="Закрыть">×</button><b>Мои аптечки</b><span /></header><h2 id="cabinet-picker-title">Сменить аптечку</h2><div className="cabinet-picker-list">{cabinets.map((cabinet) => { const count = medications.filter((medication) => medication.cabinet_id === cabinet.id).length; const active = cabinet.id === selectedId; return <button className={active ? 'cabinet-choice active' : 'cabinet-choice'} key={cabinet.id} onClick={() => onSelect(cabinet.id)}><span><strong>{cabinet.name}</strong><small>{count} {count === 1 ? 'препарат' : count >= 2 && count <= 4 ? 'препарата' : 'препаратов'}</small></span><i aria-hidden="true" /></button>; })}</div><button className="cabinet-create-button" onClick={onCreate}>＋ Добавить новую</button></section></div>; }

function CabinetEditor({ cabinet, onClose, onSave }: { cabinet: Cabinet | null; onClose: () => void; onSave: (name: string) => Promise<void> }) { const [name, setName] = useState(cabinet?.name ?? ''); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false); const title = cabinet ? 'Переименовать аптечку' : 'Новая аптечка'; const save = () => { if (saving) return; setSaving(true); setError(null); void onSave(name).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Не удалось сохранить аптечку.')).finally(() => setSaving(false)); }; return <div className="modal-backdrop"><section className="cabinet-editor" role="dialog" aria-modal="true" aria-labelledby="cabinet-editor-title"><div className="modal-handle" /><header className="sheet-header"><button className="close" disabled={saving} onClick={onClose} aria-label="Закрыть">×</button><b>{cabinet ? 'Настройки аптечки' : 'Новая аптечка'}</b><span /></header><h2 id="cabinet-editor-title">{title}</h2><label>Название аптечки<input value={name} maxLength={60} onChange={(event) => { setName(event.target.value); setError(null); }} placeholder="Например, Домашняя" autoFocus /></label>{error ? <p className="flow-validation" role="alert">{error}</p> : null}<footer><button className="secondary-button" disabled={saving} onClick={onClose}>Отмена</button><button className="primary-button" disabled={saving || !name.trim()} onClick={save}>{saving ? 'Сохраняем…' : 'Сохранить'}</button></footer></section></div>; }

function AddMedication({ onClose, onSubmit }: { onClose: () => void; onSubmit: (draft: MedicationDraft, operationId: string) => Promise<void> }) {
  const [screen, setScreen] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [draft, setDraft] = useState<MedicationDraft>(blankDraft);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const operationId = useRef(makeId('create-medication')).current;
  const patch = (values: Partial<MedicationDraft>) => setDraft((current) => ({ ...current, ...values }));
  const validStock = Number(draft.quantity) > 0;
  const stockUnit = ['Жидкость', 'Капли', 'Сироп'].includes(draft.form) ? 'мл' : 'шт.';
  const categories = ['От боли и температуры', 'Простуда, горло и кашель', 'Аллергия', 'Желудок и кишечник', 'Сердце и давление', 'Нервы и сон', 'Глаза, уши, нос', 'Кожа, раны и антисептики', 'Витамины и минералы', 'Противовирусные и антибиотики', 'Гормональные препараты', 'Диабет и обмен веществ', 'Суставы, мышцы и спина', 'Женское здоровье', 'Детская аптечка', 'Своя категория'];
  const mainForms = ['Таблетка', 'Капсула', 'Жидкость', 'Препараты местного действия'];
  const otherForms = ['Гель', 'Ингалятор', 'Инъекция', 'Капли', 'Крем', 'Лосьон', 'Мазь', 'Пенка', 'Пластырь', 'Порошок', 'Спрей', 'Суппозиторий', 'Устройство'];
  const proceed = () => {
    if (screen === 1 && !draft.name.trim()) { setValidationMessage('Укажите название лекарства.'); return; }
    if (screen === 2 && (!draft.category || (draft.category === 'Своя категория' && !draft.customCategory.trim()))) { setValidationMessage('Выберите категорию или укажите свою.'); return; }
    if (screen === 3 && !draft.form) { setValidationMessage('Выберите лекарственную форму.'); return; }
    if (screen === 5 && !validStock) { setValidationMessage('Укажите количество препарата в наличии.'); return; }
    if (screen === 5 && draft.expiresOn && !expirationDateKey(draft.expiresOn)) { setValidationMessage('Укажите существующую дату в формате ДД.ММ.ГГГГ.'); return; }
    setValidationMessage(null);
    if (screen !== 6) { setScreen((screen + 1) as 1 | 2 | 3 | 4 | 5 | 6); return; }
    if (saving) return;
    setSaving(true);
    void onSubmit(draft, operationId).catch((error: unknown) => {
      setValidationMessage(error instanceof Error ? error.message : 'Не удалось сохранить препарат. Попробуйте ещё раз.');
    }).finally(() => setSaving(false));
  };
  const goBack = () => screen === 1 ? onClose() : setScreen((screen - 1) as 1 | 2 | 3 | 4 | 5 | 6);
  const select = (field: 'category' | 'form' | 'unit', value: string) => { patch({ [field]: value } as Partial<MedicationDraft>); setValidationMessage(null); };
  const title = draft.name || 'Лекарство';
  return <div className="modal-backdrop"><section className="medicine-flow" role="dialog" aria-modal="true" aria-labelledby="medicine-flow-title">
    <header className="medicine-flow__header"><button className="close" disabled={saving} onClick={goBack} aria-label={screen === 1 ? 'Закрыть' : 'Назад'}>{screen === 1 ? '×' : '‹'}</button><b>{screen} из 6</b>{screen === 6 ? <button className="close" disabled={saving} onClick={onClose} aria-label="Закрыть">×</button> : <span />}</header>
    <div className="medicine-flow__content">
      {screen === 1 ? <><h2 id="medicine-flow-title">Название лекарства</h2><label>Название лекарства<input value={draft.name} onChange={(event) => { patch({ name: event.target.value }); setValidationMessage(null); }} placeholder="Например, Ибупрофен" autoFocus /></label></> : null}
      {screen === 2 ? <><h2 id="medicine-flow-title">Категория лекарства</h2><div className="medicine-choice-list">{categories.map((category) => <button className={draft.category === category ? 'selected' : ''} key={category} onClick={() => select('category', category)}>{category}</button>)}</div>{draft.category === 'Своя категория' ? <label>Своя категория<input value={draft.customCategory} onChange={(event) => { patch({ customCategory: event.target.value }); setValidationMessage(null); }} placeholder="Например, Для поездки" autoFocus /></label> : null}</> : null}
      {screen === 3 ? <><h2 id="medicine-flow-title">Выберите лекарственную форму</h2><p className="medicine-flow__hint">Основные лекарственные формы</p><div className="medicine-choice-list">{mainForms.map((form) => <button className={draft.form === form ? 'selected' : ''} key={form} onClick={() => select('form', form)}>{form}</button>)}</div><p className="medicine-flow__hint">Другие формы</p><div className="medicine-choice-list">{otherForms.map((form) => <button className={draft.form === form ? 'selected' : ''} key={form} onClick={() => select('form', form)}>{form}</button>)}</div></> : null}
      {screen === 4 ? <><h2 id="medicine-flow-title">Добавление дозировки лекарства</h2><label>Дозировка<input value={draft.amount} onChange={(event) => patch({ amount: event.target.value })} inputMode="decimal" placeholder="Например, 400" autoFocus /></label><p className="medicine-flow__hint">Единицы измерения</p><div className="medicine-choice-list medicine-choice-list--units">{['мг', 'мкг', 'г', 'мл', '%'].map((unit) => <button className={draft.unit === unit ? 'selected' : ''} key={unit} onClick={() => select('unit', unit)}>{unit}</button>)}</div></> : null}
      {screen === 5 ? <><h2 id="medicine-flow-title">Запас препарата</h2><p className="medicine-flow__description">Укажите, сколько препарата сейчас в наличии.</p><label>Количество, {stockUnit}<input value={draft.quantity} onChange={(event) => { patch({ quantity: event.target.value }); setValidationMessage(null); }} inputMode="decimal" placeholder="Например, 20" autoFocus /></label><label className="expiry-field"><span className="expiry-field__label">Срок годности <small>Необязательно</small></span><input className="expiry-field__input" value={draft.expiresOn} onChange={(event) => { patch({ expiresOn: formatExpirationInput(event.target.value) }); setValidationMessage(null); }} inputMode="numeric" autoComplete="off" placeholder="ДД.ММ.ГГГГ" maxLength={10} /></label></> : null}
      {screen === 6 ? <><h2 id="medicine-flow-title">{title}</h2><p className="medicine-flow__description">{medicationDescription({ id: '', cabinet_id: '', name: '', form: draft.form, amount: draft.amount, unit: draft.unit, color: '' })}</p><label>Комментарий к приёму<textarea value={draft.note} onChange={(event) => patch({ note: event.target.value })} placeholder="Например, после еды" /></label><label className="purchase-toggle"><span>Напомнить о покупке</span><input type="checkbox" checked={draft.purchaseReminder} onChange={(event) => patch({ purchaseReminder: event.target.checked })} /></label></> : null}
      {validationMessage ? <p className="flow-validation" role="alert">{validationMessage}</p> : null}
    </div>
    <footer className="medicine-flow__footer"><button className="primary-button" disabled={saving} onClick={proceed}>{saving ? 'Сохраняем…' : screen === 6 ? 'Готово' : 'Далее'}</button>{screen === 4 ? <button className="medicine-skip" type="button" onClick={proceed}>Пропустить</button> : null}</footer>
  </section></div>;
}
function AddPackage({ medication, onClose, onSubmit }: { medication: Medication; onClose: () => void; onSubmit: (medication: Medication, quantity: string, expiresOn: string, packageId: string) => Promise<void> }) {
  const [quantity, setQuantity] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const packageId = useRef(makeId('pack')).current;
  const unit = ['Жидкость', 'Капли', 'Сироп'].includes(medication.form) ? 'мл' : 'шт.';
  const save = () => {
    if (saving) return;
    if (expiresOn && !expirationDateKey(expiresOn)) { setError('Укажите существующую дату в формате ДД.ММ.ГГГГ.'); return; }
    setSaving(true); setError(null);
    void onSubmit(medication, quantity, expiresOn, packageId).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Не удалось добавить упаковку.')).finally(() => setSaving(false));
  };
  return <div className="modal-backdrop"><section className="package-sheet"><div className="modal-handle" /><button className="close package-close" disabled={saving} onClick={onClose}>×</button><h2>Новая упаковка</h2><p>{medication.name}. Она будет учитываться отдельно по сроку годности.</p><label>Количество, {unit}<input value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(null); }} inputMode="decimal" placeholder="Например, 20" autoFocus /></label><label className="expiry-field"><span className="expiry-field__label">Срок годности <small>Необязательно</small></span><input className="expiry-field__input" value={expiresOn} onChange={(event) => { setExpiresOn(formatExpirationInput(event.target.value)); setError(null); }} inputMode="numeric" autoComplete="off" placeholder="ДД.ММ.ГГГГ" maxLength={10} /></label>{error ? <p className="flow-validation" role="alert">{error}</p> : null}<button className="primary-button" disabled={saving} onClick={save}>{saving ? 'Добавляем…' : 'Добавить упаковку'}</button></section></div>;
}
function MedicationDetails({ medication, packages, schedules, onClose, onEdit, onDelete, onAddPackage }: { medication: Medication; packages: Package[]; schedules: MedicationSchedule[]; onClose: () => void; onEdit: () => void; onDelete: () => void; onAddPackage: () => void }) {
  const currentDate = dateKey(today());
  const unit = packages[0]?.unit ?? (['Жидкость', 'Капли', 'Сироп'].includes(medication.form) ? 'мл' : 'шт.');
  const available = packages.filter((item) => !item.expires_on || item.expires_on >= currentDate).reduce((sum, item) => sum + Number(item.quantity_remaining), 0);
  return <div className="modal-backdrop"><section className="details-sheet" role="dialog" aria-modal="true" aria-labelledby="medication-details-title"><div className="modal-handle" /><button className="close details-close" onClick={onClose} aria-label="Закрыть карточку">×</button><span className="med-icon details-icon" style={{ background: medication.color }}>◉</span><h2 id="medication-details-title">{medication.name}</h2><p className="details-subtitle">{medicationDescription(medication)}</p>{medication.category ? <p className="details-category">{medication.category}</p> : null}<section className="details-section"><h3>В аптечке</h3><strong>{available} {unit} доступно для приёма</strong>{packages.length ? <div className="package-list">{packages.map((item, index) => { const expired = Boolean(item.expires_on && item.expires_on < currentDate && Number(item.quantity_remaining) > 0); return <article key={item.id} className={expired ? 'package-row expired' : 'package-row'}><b>Упаковка {index + 1}</b><span>Осталось {item.quantity_remaining} {item.unit}{item.expires_on ? ` · до ${new Date(`${item.expires_on}T12:00:00`).toLocaleDateString('ru-RU')}` : ' · срок не указан'}{expired ? ' · просрочена' : ''}</span></article>; })}</div> : <p className="details-empty">Упаковок пока нет.</p>}</section><section className="details-section"><h3>Приём</h3>{schedules.length ? [...schedules].sort((left, right) => left.scheduled_time.localeCompare(right.scheduled_time)).map((schedule) => <p key={schedule.id}>Каждый день в {schedule.scheduled_time.slice(0, 5)} · {schedule.dose_quantity} {schedule.dose_unit}</p>) : <p>Расписание ещё не добавлено.</p>}{medication.note ? <p>Комментарий: {medication.note}</p> : null}</section><div className="details-actions"><button className="primary-button" onClick={onAddPackage}>＋ Добавить упаковку</button><button className="secondary-button" onClick={onEdit}>Редактировать</button><button className="details-delete" onClick={onDelete}>Удалить из аптечки</button></div></section></div>;
}
function MedicationEditor({ medication, onClose, onSave }: { medication: Medication; onClose: () => void; onSave: (medication: Medication, values: Pick<Medication, 'name' | 'category' | 'form' | 'amount' | 'unit' | 'note' | 'purchase_reminder'>) => Promise<void> }) {
  const [values, setValues] = useState({ name: medication.name, category: medication.category ?? '', form: medication.form, amount: medication.amount, unit: medication.unit, note: medication.note ?? '', purchase_reminder: Boolean(medication.purchase_reminder) });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const patch = (next: Partial<typeof values>) => { setValues((current) => ({ ...current, ...next })); setError(null); };
  const save = () => { if (saving) return; setSaving(true); void onSave(medication, values).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Не удалось сохранить изменения.')).finally(() => setSaving(false)); };
  return <div className="modal-backdrop"><section className="medication-editor" role="dialog" aria-modal="true" aria-labelledby="medication-editor-title"><div className="modal-handle" /><header className="sheet-header"><button className="close" onClick={onClose} disabled={saving} aria-label="Закрыть">×</button><b>Карточка препарата</b><span /></header><h2 id="medication-editor-title">Редактировать</h2><label>Название лекарства<input value={values.name} onChange={(event) => patch({ name: event.target.value })} autoFocus /></label><label>Категория<input value={values.category} onChange={(event) => patch({ category: event.target.value })} placeholder="Например, От боли и температуры" /></label><div className="editor-grid"><label>Форма<select value={values.form} onChange={(event) => patch({ form: event.target.value })}>{['Таблетка', 'Капсула', 'Жидкость', 'Гель', 'Капли', 'Крем', 'Мазь', 'Спрей', 'Порошок', 'Устройство'].map((form) => <option key={form}>{form}</option>)}</select></label><label>Дозировка<input value={values.amount} onChange={(event) => patch({ amount: event.target.value })} inputMode="decimal" placeholder="Не указана" /></label></div><label>Единица<select value={values.unit} onChange={(event) => patch({ unit: event.target.value })}>{['мг', 'мкг', 'г', 'мл', '%'].map((unit) => <option key={unit}>{unit}</option>)}</select></label><label>Комментарий<textarea value={values.note} onChange={(event) => patch({ note: event.target.value })} placeholder="Например, после еды" /></label><label className="purchase-toggle"><span>Напомнить о покупке</span><input type="checkbox" checked={values.purchase_reminder} onChange={(event) => patch({ purchase_reminder: event.target.checked })} /></label>{error ? <p className="flow-validation" role="alert">{error}</p> : null}<footer><button className="secondary-button" disabled={saving} onClick={onClose}>Отмена</button><button className="primary-button" disabled={saving} onClick={save}>{saving ? 'Сохраняем…' : 'Сохранить'}</button></footer></section></div>;
}
function DeleteMedicationConfirm({ medication, onCancel, onConfirm }: { medication: Medication; onCancel: () => void; onConfirm: (medication: Medication) => void }) {
  return <div className="modal-backdrop"><section className="delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-medication-title"><div className="modal-handle" /><h2 id="delete-medication-title">Удалить препарат?</h2><p>«{medication.name}» будет удалён из аптечки вместе с упаковками и запланированными приёмами. Это действие нельзя отменить.</p><button className="delete-confirm__action" onClick={() => onConfirm(medication)}>Удалить из аптечки</button><button className="secondary-button" onClick={onCancel}>Нет, оставить</button></section></div>;
}
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) { return <button className={active ? 'tab active' : 'tab'} onClick={onClick} aria-label={label} title={label}><span aria-hidden="true">{icon}</span>{label}</button>; }
