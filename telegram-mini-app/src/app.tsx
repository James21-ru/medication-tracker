import { useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from './supabase';
import { prepareTelegramApp } from './telegram';

type Tab = 'doses' | 'cabinet' | 'lifetab';
type Medication = { id: string; name: string; form: string; amount: string; unit: string; color: string };
type Package = { id: string; medication_id: string; quantity_remaining: number; unit: string; expires_on: string | null };
type Dose = { id: string; medication_id: string; scheduled_time: string; quantity: number; unit: string; status: 'pending' | 'taken' | 'skipped' };
type MedicationSchedule = { id: string; medication_id: string; scheduled_time: string; dose_quantity: number; dose_unit: string };
type ScheduleDraft = { time: string; quantity: string };
type MedicationDraft = { name: string; form: string; amount: string; unit: string; quantity: string; expiresOn: string; schedules: ScheduleDraft[] };

const today = () => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
const dateKey = (date: Date) => new Intl.DateTimeFormat('en-CA').format(date);
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const blankDraft: MedicationDraft = { name: '', form: 'Таблетка', amount: '', unit: 'мг', quantity: '', expiresOn: '', schedules: [{ time: '08:00', quantity: '1' }] };

export function App() {
  const [tab, setTab] = useState<Tab>('doses');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [doses, setDoses] = useState<Dose[]>([]);
  const [schedules, setSchedules] = useState<MedicationSchedule[]>([]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [showAddMedication, setShowAddMedication] = useState(false);
  const [packageMedication, setPackageMedication] = useState<Medication | null>(null);
  const [detailMedication, setDetailMedication] = useState<Medication | null>(null);
  const [updatingDoseId, setUpdatingDoseId] = useState<string | null>(null);
  const loadRequestId = useRef(0);
  const updatingDoseIds = useRef(new Set<string>());

  async function signInAndLoad() {
    const app = prepareTelegramApp();
    if (!supabase) { setMessage('Mini App пока не настроен: добавьте Supabase URL и publishable key в окружение хостинга.'); setLoading(false); return; }
    if (!app?.initData) { setMessage('Откройте LifeCare из Telegram, чтобы безопасно войти и увидеть свои данные.'); setLoading(false); return; }
    // Never trust a persisted browser session by itself: bind every Mini App
    // launch back to the signed Telegram identity before reading its data.
    const result = await supabase.functions.invoke('telegram-mini-session', { body: { init_data: app.initData } });
    if (result.error || !result.data?.token_hash) { setMessage('Не удалось подтвердить Telegram-профиль. Попробуйте открыть Mini App ещё раз.'); setLoading(false); return; }
    const auth = await supabase.auth.verifyOtp({ token_hash: result.data.token_hash, type: 'email' });
    if (auth.error) { setMessage('Не удалось открыть защищённую сессию. Попробуйте ещё раз.'); setLoading(false); return; }
    await loadData(selectedDate);
  }

  async function loadData(forDate = selectedDate, showLoading = true) {
    if (!supabase) return;
    const requestId = ++loadRequestId.current;
    if (showLoading) setLoading(true);
    try {
      const [medicationsResult, packagesResult, dosesResult, schedulesResult] = await Promise.all([
        supabase.from('medications').select('id,name,form,amount,unit,color').is('deleted_at', null).order('created_at', { ascending: false }),
        supabase.from('medication_packages').select('id,medication_id,quantity_remaining,unit,expires_on').is('deleted_at', null).order('expires_on', { ascending: true, nullsFirst: false }),
        supabase.from('dose_events').select('id,medication_id,scheduled_time,quantity,unit,status').eq('scheduled_on', dateKey(forDate)).is('deleted_at', null).order('scheduled_time'),
        supabase.from('medication_schedules').select('id,medication_id,scheduled_time,dose_quantity,dose_unit').eq('active', true).is('deleted_at', null),
      ]);
      if (requestId !== loadRequestId.current) return;
      const error = medicationsResult.error ?? packagesResult.error ?? dosesResult.error ?? schedulesResult.error;
      if (error) setMessage('Не удалось загрузить данные. Проверьте подключение и доступ к Supabase.');
      else { setMedications((medicationsResult.data ?? []) as Medication[]); setPackages((packagesResult.data ?? []) as Package[]); setDoses((dosesResult.data ?? []) as Dose[]); setSchedules((schedulesResult.data ?? []) as MedicationSchedule[]); setMessage(null); }
    } catch {
      if (requestId === loadRequestId.current) setMessage('Не удалось загрузить данные. Проверьте подключение и попробуйте ещё раз.');
    } finally {
      if (showLoading && requestId === loadRequestId.current) setLoading(false);
    }
  }

  useEffect(() => { void signInAndLoad(); }, []);
  const medicationById = useMemo(() => new Map(medications.map((item) => [item.id, item])), [medications]);
  const packagesByMedication = useMemo(() => packages.reduce<Map<string, Package[]>>((result, item) => { result.set(item.medication_id, [...(result.get(item.medication_id) ?? []), item]); return result; }, new Map()), [packages]);
  const schedulesByMedication = useMemo(() => schedules.reduce<Map<string, MedicationSchedule[]>>((result, item) => { result.set(item.medication_id, [...(result.get(item.medication_id) ?? []), item]); return result; }, new Map()), [schedules]);
  const showNotice = (text: string) => { setNotice(text); window.setTimeout(() => setNotice((current) => current === text ? null : current), 4000); };

  async function chooseDate(date: Date) { setSelectedDate(date); await loadData(date, false); }
  async function refreshData() { setRefreshing(true); try { await loadData(selectedDate, false); } finally { setRefreshing(false); } }
  async function runTelegramMutation(mutation: Record<string, unknown>) {
    if (!supabase) throw new Error('Действие недоступно: Mini App не подключён к Supabase.');
    const app = prepareTelegramApp();
    if (!app?.initData) throw new Error('Откройте LifeCare из Telegram, чтобы подтвердить действие.');
    let timeoutId: number | undefined;
    try {
      const result = await Promise.race([
        supabase.functions.invoke('telegram-mini-session', { body: { init_data: app.initData, mutation } }),
        new Promise<never>((_, reject) => { timeoutId = window.setTimeout(() => reject(new Error('Сервер не ответил за 15 секунд. Проверьте сеть и повторите действие.')), 15_000); }),
      ]);
      if (result.error || !result.data) throw new Error('Не удалось подтвердить действие. Попробуйте ещё раз.');
      return result.data as { status: string; available?: number; unit?: string };
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }
  }
  async function markDose(dose: Dose, status: 'taken' | 'skipped') {
    if (dose.status !== 'pending') return;
    if (updatingDoseIds.current.has(dose.id)) return;
    updatingDoseIds.current.add(dose.id); setUpdatingDoseId(dose.id);
    try {
      const result = await runTelegramMutation({ type: 'complete_dose', dose_id: dose.id, status });
      if (result.status === 'insufficient_stock') { setMessage(`Недостаточно препарата в аптечке: доступно ${result.available ?? 0} ${result.unit ?? ''}. Добавьте упаковку перед отметкой приёма.`); return; }
      const completedStatus = result.status === 'taken' ? 'taken' : 'skipped';
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
      void loadData(selectedDate, false);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось обновить приём. Попробуйте ещё раз.'); }
    finally { updatingDoseIds.current.delete(dose.id); setUpdatingDoseId((current) => current === dose.id ? null : current); }
  }
  async function addMedication(draft: MedicationDraft, operationId: string) {
    if (!supabase) throw new Error('Сохранение недоступно: Mini App не подключён к Supabase. Попробуйте позже.');
    const quantity = Number(draft.quantity);
    const scheduleEntries = draft.schedules.map((schedule, index) => ({ id: `${operationId}-schedule-${index + 1}`, time: schedule.time, quantity: Number(schedule.quantity) }));
    if (!draft.name.trim() || !draft.amount.trim() || !Number.isFinite(quantity) || quantity <= 0 || !scheduleEntries.length || scheduleEntries.some((schedule) => !Number.isFinite(schedule.quantity) || schedule.quantity <= 0 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time))) { setMessage('Заполните данные препарата, упаковки и ежедневного приёма.'); return; }
    const stockUnit = ['Жидкость', 'Капли', 'Сироп'].includes(draft.form) ? 'мл' : 'шт.';
    const medicationId = `${operationId}-medication`;
    const packageId = `${operationId}-package`;
    await runTelegramMutation({ type: 'create_medication', medication_id: medicationId, package_id: packageId, name: draft.name.trim(), form: draft.form, amount: draft.amount.trim(), medication_unit: draft.unit, color: '#20A278', quantity, stock_unit: stockUnit, expires_on: draft.expiresOn || null, schedules: scheduleEntries, start_on: dateKey(today()) });
    setMedications((current) => [{ id: medicationId, name: draft.name.trim(), form: draft.form, amount: draft.amount.trim(), unit: draft.unit, color: '#20A278' }, ...current]);
    setPackages((current) => [{ id: packageId, medication_id: medicationId, quantity_remaining: quantity, unit: stockUnit, expires_on: draft.expiresOn || null }, ...current]);
    setSchedules((current) => [...scheduleEntries.map((schedule) => ({ id: schedule.id, medication_id: medicationId, scheduled_time: schedule.time, dose_quantity: schedule.quantity, dose_unit: stockUnit })), ...current]);
    if (dateKey(selectedDate) === dateKey(today())) setDoses((current) => [...current, ...scheduleEntries.map((schedule) => ({ id: `${schedule.id}-dose-${dateKey(today()).replaceAll('-', '')}`, medication_id: medicationId, scheduled_time: schedule.time, quantity: schedule.quantity, unit: stockUnit, status: 'pending' as const }))].sort((left, right) => left.scheduled_time.localeCompare(right.scheduled_time)));
    setShowAddMedication(false);
    showNotice('Препарат добавлен в аптечку.');
    void loadData(selectedDate, false);
  }
  async function addPackage(medication: Medication, quantityText: string, expiresOn: string, packageId: string) {
    if (!supabase) throw new Error('Сохранение недоступно: Mini App не подключён к Supabase. Попробуйте позже.');
    const quantity = Number(quantityText);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Укажите количество в упаковке.');
    const unit = ['Жидкость', 'Капли', 'Сироп'].includes(medication.form) ? 'мл' : 'шт.';
    await runTelegramMutation({ type: 'add_package', medication_id: medication.id, package_id: packageId, quantity, stock_unit: unit, expires_on: expiresOn || null });
    setPackages((current) => [{ id: packageId, medication_id: medication.id, quantity_remaining: quantity, unit, expires_on: expiresOn || null }, ...current]);
    setPackageMedication(null);
    showNotice('Упаковка добавлена в аптечку.');
    void loadData(selectedDate, false);
  }

  const title = tab === 'doses' ? 'Приёмы' : tab === 'cabinet' ? 'Аптечка' : 'LifeTab';
  const eyebrow = tab === 'doses' ? 'СЕГОДНЯ' : tab === 'cabinet' ? 'ДОМАШНЯЯ АПТЕЧКА' : 'LIFECARE DEVICE';
  return <main className={`app-shell app-shell--${tab}`}>
    <header className="header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>{tab !== 'lifetab' ? <button className="round-button" disabled={refreshing} onClick={tab === 'cabinet' ? () => setShowAddMedication(true) : () => void refreshData()} aria-label={tab === 'cabinet' ? 'Добавить препарат' : 'Обновить данные'}>{tab === 'cabinet' ? '+' : refreshing ? '…' : '↻'}</button> : <span className="preorder"><i />ПРЕДЗАКАЗ</span>}</header>
    {message ? <div className="message" role="alert">{message}</div> : null}
    {notice ? <div className="notice" role="status">{notice}</div> : null}
    {loading ? <div className="loading"><span className="loader" />Загружаем данные…</div> : tab === 'doses' ? <Doses doses={doses} medicationById={medicationById} selectedDate={selectedDate} updatingDoseId={updatingDoseId} onSelectDate={chooseDate} onMark={markDose} /> : tab === 'cabinet' ? <Cabinet medications={medications} packagesByMedication={packagesByMedication} onAdd={() => setShowAddMedication(true)} onAddPackage={setPackageMedication} onOpen={setDetailMedication} /> : <LifeTab />}
    <nav className="tabbar" aria-label="Разделы"><TabButton active={tab === 'doses'} onClick={() => setTab('doses')} icon="⌂" label="Приёмы" /><TabButton active={tab === 'cabinet'} onClick={() => setTab('cabinet')} icon="▰" label="Аптечка" /><TabButton active={tab === 'lifetab'} onClick={() => setTab('lifetab')} icon="◈" label="LifeTab" /></nav>
    {showAddMedication ? <AddMedication onClose={() => setShowAddMedication(false)} onSubmit={addMedication} /> : null}
    {packageMedication ? <AddPackage medication={packageMedication} onClose={() => setPackageMedication(null)} onSubmit={addPackage} /> : null}
    {detailMedication ? <MedicationDetails medication={detailMedication} packages={packagesByMedication.get(detailMedication.id) ?? []} schedules={schedulesByMedication.get(detailMedication.id) ?? []} onClose={() => setDetailMedication(null)} onAddPackage={() => { setDetailMedication(null); setPackageMedication(detailMedication); }} /> : null}
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

function NextDose({ dose, medication, canMark, isUpdating, onMark }: { dose: Dose; medication?: Medication; canMark: boolean; isUpdating: boolean; onMark: (dose: Dose, status: 'taken' | 'skipped') => Promise<void> }) { return <article className="next-dose"><p>{canMark ? 'СЛЕДУЮЩИЙ ПРИЁМ' : 'ЗАПЛАНИРОВАНО'}</p><div className="next-dose__title"><span><strong>{medication?.name ?? 'Препарат'}</strong><small>{medication ? `${medication.form} · ${medication.amount} ${medication.unit}` : `${dose.quantity} ${dose.unit}`}</small></span><time>{dose.scheduled_time.slice(0, 5)}</time></div>{canMark ? <><button disabled={isUpdating} onClick={() => void onMark(dose, 'taken')}>{isUpdating ? 'Отмечаем…' : 'Принять сейчас'}</button><button className="text-button" disabled={isUpdating} onClick={() => void onMark(dose, 'skipped')}>Пропустить</button></> : <p className="next-dose__notice">Отметить приём можно в назначенный день.</p>}</article>; }
function DoseRow({ dose, medication, canMark, isUpdating, onMark }: { dose: Dose; medication?: Medication; canMark: boolean; isUpdating: boolean; onMark: (dose: Dose, status: 'taken' | 'skipped') => Promise<void> }) { return <article className="dose-row"><time>{dose.scheduled_time.slice(0, 5)}</time><span className="med-icon med-icon--small" style={{ background: medication?.color ?? '#20A278' }}>◉</span><div><strong>{medication?.name ?? 'Препарат'}</strong><small>{dose.quantity} {dose.unit}</small></div>{dose.status === 'pending' ? canMark ? <button disabled={isUpdating} onClick={() => void onMark(dose, 'taken')} aria-label="Отметить принятым">{isUpdating ? '…' : '✓'}</button> : <span className="dose-status">Запланировано</span> : <span className={`dose-status ${dose.status}`}>{dose.status === 'taken' ? 'Принято' : 'Пропущено'}</span>}</article>; }

function Cabinet({ medications, packagesByMedication, onAdd, onAddPackage, onOpen }: { medications: Medication[]; packagesByMedication: Map<string, Package[]>; onAdd: () => void; onAddPackage: (medication: Medication) => void; onOpen: (medication: Medication) => void }) { const currentDate = dateKey(today()); return <section className="cabinet-screen"><p className="medication-count">Препараты · {medications.length}</p>{medications.length ? medications.map((medication) => { const packs = packagesByMedication.get(medication.id) ?? []; const available = packs.filter((item) => !item.expires_on || item.expires_on >= currentDate); const stock = available.reduce((total, item) => total + Number(item.quantity_remaining), 0); const nextExpiry = available.filter((item) => item.expires_on).map((item) => item.expires_on!).sort()[0]; const expiredCount = packs.filter((item) => item.expires_on && item.expires_on < currentDate && Number(item.quantity_remaining) > 0).length; return <article key={medication.id} className="cabinet-card"><span className="med-icon" style={{ background: medication.color }}>◉</span><div><h2>{medication.name}</h2><p>{medication.form} · {medication.amount} {medication.unit}</p><strong>В запасе: {stock} {packs[0]?.unit ?? 'шт.'}</strong>{nextExpiry ? <small>Ближайший срок: {new Date(`${nextExpiry}T12:00:00`).toLocaleDateString('ru-RU')}</small> : null}{expiredCount ? <small className="expired-note">Просрочено упаковок: {expiredCount}</small> : null}<div className="cabinet-actions"><button onClick={() => onOpen(medication)}>Открыть карточку ›</button><button onClick={() => onAddPackage(medication)}>＋ Упаковка</button></div></div></article>; }) : <div className="empty"><div className="empty-icon">＋</div><h2>Аптечка пуста</h2><p>Добавьте первую упаковку — она сохранится в цифровой аптечке.</p><button className="primary-button" onClick={onAdd}>Добавить препарат</button></div>}</section>; }
function LifeTab() { return <section className="lifetab-screen"><div className="device-hero"><div className="device-shadow" /><div className="device"><i>◖</i></div></div><div className="lifetab-price"><span><p>СПЕЦИАЛЬНАЯ ЦЕНА ПРЕДЗАКАЗА</p><strong>от 4 990 ₽</strong></span><small>Первая партия<br />в 2026 году</small></div><button className="lifetab-cta" onClick={() => window.location.assign('lifecare://')}>Открыть приложение <b>→</b></button><p className="lifetab-note">Управление устройством доступно в нативном LifeCare</p><h2>Как LifeTab помогает</h2><div className="feature-list"><div><span>◷</span><p><strong>Напоминает о приёмах</strong><small>Помогает не пропускать важные дозы</small></p></div><div><span>◉</span><p><strong>Синхронизируется с аптечкой</strong><small>Отслеживает запас препаратов</small></p></div></div></section>; }

function AddMedication({ onClose, onSubmit }: { onClose: () => void; onSubmit: (draft: MedicationDraft, operationId: string) => Promise<void> }) {
  const [screen, setScreen] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<MedicationDraft>(blankDraft);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const operationId = useRef(makeId('create-medication')).current;
  const patch = (values: Partial<MedicationDraft>) => setDraft((current) => ({ ...current, ...values }));
  const validDetails = Boolean(draft.name.trim() && draft.amount.trim());
  const validStock = Number(draft.quantity) > 0;
  const validSchedule = draft.schedules.length > 0 && draft.schedules.every((schedule) => Number(schedule.quantity) > 0 && /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time));
  const stockUnit = ['Жидкость', 'Капли', 'Сироп'].includes(draft.form) ? 'мл' : 'шт.';
  const proceed = () => {
    if (screen === 1 && !validDetails) { setValidationMessage('Укажите название и силу препарата.'); return; }
    if (screen === 2 && (!validStock || !validSchedule)) { setValidationMessage('Укажите количество в упаковке, время и количество каждого ежедневного приёма.'); return; }
    setValidationMessage(null);
    if (screen === 3) {
      if (saving) return;
      setSaving(true);
      void onSubmit(draft, operationId).catch((error: unknown) => {
        setValidationMessage(error instanceof Error ? error.message : 'Не удалось сохранить препарат. Попробуйте ещё раз.');
      }).finally(() => setSaving(false));
    }
    else setScreen(screen === 1 ? 2 : 3);
  };
  const updateSchedule = (index: number, values: Partial<ScheduleDraft>) => patch({ schedules: draft.schedules.map((schedule, current) => current === index ? { ...schedule, ...values } : schedule) });
  const addSchedule = () => patch({ schedules: [...draft.schedules, { time: '20:00', quantity: '1' }] });
  const removeSchedule = (index: number) => patch({ schedules: draft.schedules.filter((_, current) => current !== index) });
  return <div className="modal-backdrop"><section className="flow-sheet"><header className="flow-header"><button className="close" disabled={saving} onClick={screen === 1 ? onClose : () => setScreen(screen === 3 ? 2 : 1)}>{screen === 1 ? '×' : '‹'}</button><b>{screen} из 3</b><span /></header><div className="flow-progress"><i style={{ width: `${Number(screen) * 33.333}%` }} /></div><div className="medicine-orb">◉</div>{screen === 1 ? <><h2>Что добавляем?</h2><p>Введите данные с упаковки. Обязательны название, сила и форма.</p><label>Название препарата<input value={draft.name} onChange={(event) => { patch({ name: event.target.value }); setValidationMessage(null); }} placeholder="Например, Ибупрофен" autoFocus /></label><label>Сила препарата<input value={draft.amount} onChange={(event) => { patch({ amount: event.target.value }); setValidationMessage(null); }} inputMode="decimal" placeholder="Например, 400" /></label><div className="compact-fields"><label>Форма<select value={draft.form} onChange={(event) => patch({ form: event.target.value })}><option>Таблетка</option><option>Капсула</option><option>Жидкость</option><option>Капли</option><option>Другая форма</option><option>Инъекция</option><option>Мазь</option><option>Спрей</option><option>Порошок</option></select></label><label>Единица<select value={draft.unit} onChange={(event) => patch({ unit: event.target.value })}><option>мг</option><option>мкг</option><option>г</option><option>мл</option></select></label></div></> : screen === 2 ? <><h2>Запас и приём</h2><p>Добавьте остаток и один или несколько ежедневных приёмов. Срок годности можно не указывать.</p><label>Количество в упаковке, {stockUnit}<input value={draft.quantity} onChange={(event) => { patch({ quantity: event.target.value }); setValidationMessage(null); }} inputMode="decimal" placeholder="Например, 20" autoFocus /></label><label>Срок годности · необязательно<input value={draft.expiresOn} onChange={(event) => patch({ expiresOn: event.target.value })} type="date" min={dateKey(today())} /></label><p className="section-caption">ЕЖЕДНЕВНЫЕ ПРИЁМЫ</p><div className="schedule-fields">{draft.schedules.map((schedule, index) => <div className="schedule-row" key={`${schedule.time}-${index}`}><div className="compact-fields"><label>Время<input type="time" value={schedule.time} onChange={(event) => { updateSchedule(index, { time: event.target.value }); setValidationMessage(null); }} /></label><label>Количество, {stockUnit}<input value={schedule.quantity} onChange={(event) => { updateSchedule(index, { quantity: event.target.value }); setValidationMessage(null); }} inputMode="decimal" placeholder="Например, 1" /></label></div>{draft.schedules.length > 1 ? <button className="remove-schedule" type="button" onClick={() => removeSchedule(index)}>Убрать этот приём</button> : null}</div>)}</div><button className="secondary-button" type="button" onClick={addSchedule}>＋ Добавить время приёма</button></> : <><h2>Проверьте детали</h2><p>Нажмите на блок, если хотите его исправить.</p><article className="review-card"><button className="review-section" type="button" onClick={() => setScreen(1)}><strong>{draft.name}</strong><p>{draft.form} · {draft.amount} {draft.unit}</p><small>Изменить препарат</small></button><hr /><button className="review-section" type="button" onClick={() => setScreen(2)}><small>ПРИЁМ</small>{draft.schedules.map((schedule, index) => <p key={`${schedule.time}-${index}`}>Каждый день · {schedule.time} · {schedule.quantity} {stockUnit}</p>)}<small>АПТЕЧКА</small><p>{draft.quantity} {stockUnit}{draft.expiresOn ? ` · до ${new Date(`${draft.expiresOn}T12:00:00`).toLocaleDateString('ru-RU')}` : ''}</p><small>Изменить запас и приём</small></button></article></>}{validationMessage ? <p className="flow-validation" role="alert">{validationMessage}</p> : null}</section><footer className="flow-footer"><button className="primary-button" disabled={saving} onClick={proceed}>{saving ? 'Сохраняем…' : screen === 3 ? 'Добавить лекарство' : 'Далее'}</button></footer></div>;
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
    setSaving(true); setError(null);
    void onSubmit(medication, quantity, expiresOn, packageId).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Не удалось добавить упаковку.')).finally(() => setSaving(false));
  };
  return <div className="modal-backdrop"><section className="package-sheet"><div className="modal-handle" /><button className="close package-close" disabled={saving} onClick={onClose}>×</button><h2>Новая упаковка</h2><p>{medication.name}. Она будет учитываться отдельно по сроку годности.</p><label>Количество, {unit}<input value={quantity} onChange={(event) => { setQuantity(event.target.value); setError(null); }} inputMode="decimal" placeholder="Например, 20" autoFocus /></label><label>Срок годности · необязательно<input value={expiresOn} onChange={(event) => { setExpiresOn(event.target.value); setError(null); }} type="date" min={dateKey(today())} /></label>{error ? <p className="flow-validation" role="alert">{error}</p> : null}<button className="primary-button" disabled={saving} onClick={save}>{saving ? 'Добавляем…' : 'Добавить упаковку'}</button></section></div>;
}
function MedicationDetails({ medication, packages, schedules, onClose, onAddPackage }: { medication: Medication; packages: Package[]; schedules: MedicationSchedule[]; onClose: () => void; onAddPackage: () => void }) {
  const currentDate = dateKey(today());
  const unit = packages[0]?.unit ?? (['Жидкость', 'Капли', 'Сироп'].includes(medication.form) ? 'мл' : 'шт.');
  const available = packages.filter((item) => !item.expires_on || item.expires_on >= currentDate).reduce((sum, item) => sum + Number(item.quantity_remaining), 0);
  return <div className="modal-backdrop"><section className="details-sheet"><div className="modal-handle" /><button className="close details-close" onClick={onClose}>×</button><span className="med-icon details-icon" style={{ background: medication.color }}>◉</span><h2>{medication.name}</h2><p className="details-subtitle">{medication.form} · {medication.amount} {medication.unit}</p><section className="details-section"><h3>В аптечке</h3><strong>{available} {unit} доступно для приёма</strong>{packages.length ? <div className="package-list">{packages.map((item, index) => { const expired = Boolean(item.expires_on && item.expires_on < currentDate && Number(item.quantity_remaining) > 0); return <article key={item.id} className={expired ? 'package-row expired' : 'package-row'}><b>Упаковка {index + 1}</b><span>Осталось {item.quantity_remaining} {item.unit}{item.expires_on ? ` · до ${new Date(`${item.expires_on}T12:00:00`).toLocaleDateString('ru-RU')}` : ' · срок не указан'}{expired ? ' · просрочена' : ''}</span></article>; })}</div> : <p className="details-empty">Упаковок пока нет.</p>}</section><section className="details-section"><h3>Приём</h3>{schedules.length ? [...schedules].sort((left, right) => left.scheduled_time.localeCompare(right.scheduled_time)).map((schedule) => <p key={schedule.id}>Каждый день в {schedule.scheduled_time.slice(0, 5)} · {schedule.dose_quantity} {schedule.dose_unit}</p>) : <p>Расписание ещё не добавлено.</p>}</section><button className="primary-button" onClick={onAddPackage}>＋ Добавить упаковку</button></section></div>;
}
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) { return <button className={active ? 'tab active' : 'tab'} onClick={onClick}><span>{icon}</span>{label}</button>; }
