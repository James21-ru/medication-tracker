import { useEffect, useMemo, useState } from 'react';

import { supabase } from './supabase';
import { prepareTelegramApp } from './telegram';

type Tab = 'doses' | 'cabinet' | 'lifetab';
type Medication = { id: string; name: string; form: string; amount: string; unit: string; color: string };
type Package = { id: string; medication_id: string; quantity_remaining: number; unit: string; expires_on: string | null };
type Dose = { id: string; medication_id: string; scheduled_time: string; quantity: number; unit: string; status: 'pending' | 'taken' | 'skipped' };
type MedicationDraft = { name: string; form: string; amount: string; unit: string; quantity: string; expiresOn: string };

const today = () => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
const dateKey = (date: Date) => new Intl.DateTimeFormat('en-CA').format(date);
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const blankDraft: MedicationDraft = { name: '', form: 'Таблетка', amount: '', unit: 'мг', quantity: '', expiresOn: '' };

export function App() {
  const [tab, setTab] = useState<Tab>('doses');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [doses, setDoses] = useState<Dose[]>([]);
  const [selectedDate, setSelectedDate] = useState(today);
  const [showAddMedication, setShowAddMedication] = useState(false);

  async function signInAndLoad() {
    const app = prepareTelegramApp();
    if (!supabase) { setMessage('Mini App пока не настроен: добавьте Supabase URL и publishable key в окружение хостинга.'); setLoading(false); return; }
    if (!app?.initData) { setMessage('Откройте LifeCare из Telegram, чтобы безопасно войти и увидеть свои данные.'); setLoading(false); return; }
    const session = await supabase.auth.getSession();
    if (!session.data.session) {
      const result = await supabase.functions.invoke('telegram-mini-session', { body: { init_data: app.initData } });
      if (result.error || !result.data?.token_hash) { setMessage('Не удалось подтвердить Telegram-профиль. Попробуйте открыть Mini App ещё раз.'); setLoading(false); return; }
      const auth = await supabase.auth.verifyOtp({ token_hash: result.data.token_hash, type: 'email' });
      if (auth.error) { setMessage('Не удалось открыть защищённую сессию. Попробуйте ещё раз.'); setLoading(false); return; }
    }
    await loadData(selectedDate);
  }

  async function loadData(forDate = selectedDate) {
    if (!supabase) return;
    setLoading(true);
    const [medicationsResult, packagesResult, dosesResult] = await Promise.all([
      supabase.from('medications').select('id,name,form,amount,unit,color').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('medication_packages').select('id,medication_id,quantity_remaining,unit,expires_on').is('deleted_at', null).order('expires_on', { ascending: true, nullsFirst: false }),
      supabase.from('dose_events').select('id,medication_id,scheduled_time,quantity,unit,status').eq('scheduled_on', dateKey(forDate)).is('deleted_at', null).order('scheduled_time'),
    ]);
    const error = medicationsResult.error ?? packagesResult.error ?? dosesResult.error;
    if (error) setMessage('Не удалось загрузить данные. Проверьте подключение и доступ к Supabase.');
    else { setMedications((medicationsResult.data ?? []) as Medication[]); setPackages((packagesResult.data ?? []) as Package[]); setDoses((dosesResult.data ?? []) as Dose[]); setMessage(null); }
    setLoading(false);
  }

  useEffect(() => { void signInAndLoad(); }, []);
  const medicationById = useMemo(() => new Map(medications.map((item) => [item.id, item])), [medications]);
  const packagesByMedication = useMemo(() => packages.reduce<Map<string, Package[]>>((result, item) => { result.set(item.medication_id, [...(result.get(item.medication_id) ?? []), item]); return result; }, new Map()), [packages]);

  async function chooseDate(date: Date) { setSelectedDate(date); await loadData(date); }
  async function markDose(dose: Dose, status: 'taken' | 'skipped') {
    if (!supabase || dose.status !== 'pending') return;
    const { error } = await supabase.from('dose_events').update({ status, completed_at: new Date().toISOString() }).eq('id', dose.id).eq('status', 'pending');
    if (error) setMessage('Не удалось обновить приём. Попробуйте ещё раз.'); else await loadData();
  }
  async function addMedication(draft: MedicationDraft) {
    if (!supabase) return;
    const quantity = Number(draft.quantity);
    if (!draft.name.trim() || !draft.amount.trim() || !Number.isFinite(quantity) || quantity <= 0) { setMessage('Заполните название, силу и количество упаковки.'); return; }
    const medicationId = makeId('med');
    const stockUnit = ['Жидкость', 'Капли', 'Сироп'].includes(draft.form) ? 'мл' : 'шт.';
    const { error: medicationError } = await supabase.from('medications').insert({ id: medicationId, name: draft.name.trim(), form: draft.form, amount: draft.amount.trim(), unit: draft.unit, color: '#20A278', created_at: new Date().toISOString() });
    if (medicationError) { setMessage('Не удалось добавить препарат.'); return; }
    const { error: packageError } = await supabase.from('medication_packages').insert({ id: makeId('pack'), medication_id: medicationId, quantity_initial: quantity, quantity_remaining: quantity, unit: stockUnit, expires_on: draft.expiresOn || null, created_at: new Date().toISOString() });
    if (packageError) { setMessage('Препарат создан, но упаковку добавить не удалось.'); return; }
    setShowAddMedication(false); await loadData();
  }

  const title = tab === 'doses' ? 'Приёмы' : tab === 'cabinet' ? 'Аптечка' : 'LifeTab';
  const eyebrow = tab === 'doses' ? 'СЕГОДНЯ' : tab === 'cabinet' ? 'ДОМАШНЯЯ АПТЕЧКА' : 'LIFECARE DEVICE';
  return <main className={`app-shell app-shell--${tab}`}>
    <header className="header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>{tab !== 'lifetab' ? <button className="round-button" onClick={tab === 'cabinet' ? () => setShowAddMedication(true) : () => void loadData()} aria-label={tab === 'cabinet' ? 'Добавить препарат' : 'Обновить данные'}>{tab === 'cabinet' ? '+' : '↻'}</button> : <span className="preorder"><i />ПРЕДЗАКАЗ</span>}</header>
    {message ? <div className="message">{message}</div> : null}
    {loading ? <div className="loading"><span className="loader" />Загружаем данные…</div> : tab === 'doses' ? <Doses doses={doses} medicationById={medicationById} selectedDate={selectedDate} onSelectDate={chooseDate} onMark={markDose} /> : tab === 'cabinet' ? <Cabinet medications={medications} packagesByMedication={packagesByMedication} onAdd={() => setShowAddMedication(true)} /> : <LifeTab />}
    <nav className="tabbar" aria-label="Разделы"><TabButton active={tab === 'doses'} onClick={() => setTab('doses')} icon="⌂" label="Приёмы" /><TabButton active={tab === 'cabinet'} onClick={() => setTab('cabinet')} icon="▰" label="Аптечка" /><TabButton active={tab === 'lifetab'} onClick={() => setTab('lifetab')} icon="◈" label="LifeTab" /></nav>
    {showAddMedication ? <AddMedication onClose={() => setShowAddMedication(false)} onSubmit={addMedication} /> : null}
  </main>;
}

function Doses({ doses, medicationById, selectedDate, onSelectDate, onMark }: { doses: Dose[]; medicationById: Map<string, Medication>; selectedDate: Date; onSelectDate: (date: Date) => Promise<void>; onMark: (dose: Dose, status: 'taken' | 'skipped') => Promise<void> }) {
  const pendingDose = doses.find((dose) => dose.status === 'pending');
  const taken = doses.filter((dose) => dose.status === 'taken').length;
  const isToday = dateKey(selectedDate) === dateKey(today());
  return <section className="doses-screen"><Calendar selectedDate={selectedDate} onSelect={onSelectDate} /><button className="utility-card"><span className="utility-icon">ϟ</span><span><strong>Параметры уведомлений</strong><small>Напоминания о дозах включены</small></span><b>›</b></button><button className="utility-card report-card"><span className="utility-icon">↗</span><span><strong>Отчёт о приёмах</strong><small>PDF за последние 30 дней</small></span><em>PDF</em></button>{pendingDose ? <NextDose dose={pendingDose} medication={medicationById.get(pendingDose.medication_id)} onMark={onMark} /> : <div className="empty"><div className="empty-icon">✓</div><h2>{isToday ? 'На сегодня приёмов нет' : 'На этот день приёмов нет'}</h2><p>Выберите другой день с запланированными приёмами.</p></div>}{doses.length > 0 ? <><section className="progress-card"><p>ПРОГРЕСС ЗА {isToday ? 'СЕГОДНЯ' : 'ДЕНЬ'}</p><strong>{Math.round((taken / doses.length) * 100)}%</strong><div><i style={{ width: `${(taken / doses.length) * 100}%` }} /></div></section><p className="section-caption">ВСЕ ПРИЁМЫ</p><div className="dose-list">{doses.map((dose) => <DoseRow key={dose.id} dose={dose} medication={medicationById.get(dose.medication_id)} onMark={onMark} />)}</div></> : null}</section>;
}

function Calendar({ selectedDate, onSelect }: { selectedDate: Date; onSelect: (date: Date) => Promise<void> }) {
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(selectedDate); date.setDate(selectedDate.getDate() + index - 3); return date; });
  const heading = dateKey(selectedDate) === dateKey(today()) ? 'Сегодня' : new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(selectedDate);
  return <section className="calendar"><h2>{heading}</h2><p>Выберите день с запланированными приёмами</p><div className="calendar-days">{days.map((date) => { const selected = dateKey(date) === dateKey(selectedDate); return <button key={dateKey(date)} className={selected ? 'calendar-day active' : 'calendar-day'} onClick={() => void onSelect(date)}><b>{new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(date).replace('.', '').slice(0, 1).toUpperCase()}</b><span>{date.getDate()}</span><i /></button>; })}</div></section>;
}

function NextDose({ dose, medication, onMark }: { dose: Dose; medication?: Medication; onMark: (dose: Dose, status: 'taken' | 'skipped') => Promise<void> }) { return <article className="next-dose"><p>СЛЕДУЮЩИЙ ПРИЁМ</p><div className="next-dose__title"><span><strong>{medication?.name ?? 'Препарат'}</strong><small>{medication ? `${medication.form} · ${medication.amount} ${medication.unit}` : `${dose.quantity} ${dose.unit}`}</small></span><time>{dose.scheduled_time.slice(0, 5)}</time></div><button onClick={() => void onMark(dose, 'taken')}>Принять сейчас</button><button className="text-button" onClick={() => void onMark(dose, 'skipped')}>Пропустить</button></article>; }
function DoseRow({ dose, medication, onMark }: { dose: Dose; medication?: Medication; onMark: (dose: Dose, status: 'taken' | 'skipped') => Promise<void> }) { return <article className="dose-row"><time>{dose.scheduled_time.slice(0, 5)}</time><span className="med-icon med-icon--small" style={{ background: medication?.color ?? '#20A278' }}>◉</span><div><strong>{medication?.name ?? 'Препарат'}</strong><small>{dose.quantity} {dose.unit}</small></div>{dose.status === 'pending' ? <button onClick={() => void onMark(dose, 'taken')} aria-label="Отметить принятым">✓</button> : <span className={`dose-status ${dose.status}`}>{dose.status === 'taken' ? 'Принято' : 'Пропущено'}</span>}</article>; }

function Cabinet({ medications, packagesByMedication, onAdd }: { medications: Medication[]; packagesByMedication: Map<string, Package[]>; onAdd: () => void }) { return <section className="cabinet-screen"><p className="medication-count">Препараты · {medications.length}</p>{medications.length ? medications.map((medication) => { const packs = packagesByMedication.get(medication.id) ?? []; const stock = packs.reduce((total, item) => total + Number(item.quantity_remaining), 0); const nextExpiry = packs.filter((item) => item.expires_on).map((item) => item.expires_on!).sort()[0]; return <article key={medication.id} className="cabinet-card"><span className="med-icon" style={{ background: medication.color }}>◉</span><div><h2>{medication.name}</h2><p>{medication.form} · {medication.amount} {medication.unit}</p><strong>В запасе: {stock} {packs[0]?.unit ?? 'шт.'}</strong>{nextExpiry ? <small>Ближайший срок: {new Date(`${nextExpiry}T12:00:00`).toLocaleDateString('ru-RU')}</small> : null}<div className="cabinet-actions"><button>Открыть карточку ›</button><button onClick={onAdd}>＋ Упаковка</button></div></div></article>; }) : <div className="empty"><div className="empty-icon">＋</div><h2>Аптечка пуста</h2><p>Добавьте первую упаковку — она сохранится в цифровой аптечке.</p><button className="primary-button" onClick={onAdd}>Добавить препарат</button></div>}</section>; }
function LifeTab() { return <section className="lifetab-screen"><div className="device-hero"><div className="device-shadow" /><div className="device"><i>◖</i></div></div><div className="lifetab-price"><span><p>СПЕЦИАЛЬНАЯ ЦЕНА ПРЕДЗАКАЗА</p><strong>от 4 990 ₽</strong></span><small>Первая партия<br />в 2026 году</small></div><button className="lifetab-cta" onClick={() => window.location.assign('lifecare://')}>Открыть приложение <b>→</b></button><p className="lifetab-note">Управление устройством доступно в нативном LifeCare</p><h2>Как LifeTab помогает</h2><div className="feature-list"><div><span>◷</span><p><strong>Напоминает о приёмах</strong><small>Помогает не пропускать важные дозы</small></p></div><div><span>◉</span><p><strong>Синхронизируется с аптечкой</strong><small>Отслеживает запас препаратов</small></p></div></div></section>; }

function AddMedication({ onClose, onSubmit }: { onClose: () => void; onSubmit: (draft: MedicationDraft) => Promise<void> }) {
  const [screen, setScreen] = useState<'choice' | 1 | 2 | 3>('choice');
  const [draft, setDraft] = useState<MedicationDraft>(blankDraft);
  const patch = (values: Partial<MedicationDraft>) => setDraft((current) => ({ ...current, ...values }));
  const validDetails = Boolean(draft.name.trim() && draft.amount.trim());
  const validStock = Number(draft.quantity) > 0;
  const formOptions = ['Таблетка', 'Капсула', 'Капли', 'Сироп', 'Инъекция', 'Мазь', 'Спрей', 'Порошок', 'Жидкость'];
  if (screen === 'choice') return <div className="modal-backdrop"><section className="choice-sheet"><div className="modal-handle" /><button className="close choice-close" onClick={onClose}>×</button><h2>Добавить в аптечку</h2><p>Выберите удобный способ</p><div className="method-switch"><button className="active">⌕ Вручную</button><button onClick={() => window.alert('Сканирование штрихкода подключим следующим шагом.')}>▥ Сканирование штрихкода</button></div><div className="choice-card"><h3>Ручной ввод</h3><p>Заполните карточку по упаковке: название, форму, дозировку и срок годности.</p><button className="primary-button" onClick={() => setScreen(1)}>Продолжить</button></div><button className="scan-prescription" onClick={() => window.alert('Сканирование назначения врача подключим следующим шагом.')}>▥ Сканировать назначение врача</button></section></div>;
  return <div className="modal-backdrop"><section className="flow-sheet"><header className="flow-header"><button className="close" onClick={screen === 1 ? onClose : () => setScreen(screen === 3 ? 2 : 1)}>{screen === 1 ? '×' : '‹'}</button><b>{screen} из 3</b><span /></header><div className="flow-progress"><i style={{ width: `${Number(screen) * 33.333}%` }} /></div><div className="medicine-orb">◉</div>{screen === 1 ? <><h2>Препарат</h2><p>Запишите название и силу препарата так, как указано на упаковке.</p><label>Название<input value={draft.name} onChange={(event) => patch({ name: event.target.value })} placeholder="Например, Ибупрофен" autoFocus /></label><label>Форма</label><div className="form-pills">{formOptions.map((form) => <button key={form} className={draft.form === form ? 'selected' : ''} onClick={() => patch({ form })}>{form}</button>)}</div><label>Сила препарата<input value={draft.amount} onChange={(event) => patch({ amount: event.target.value })} inputMode="decimal" placeholder="Например, 400" /></label><div className="unit-pills">{['мг', 'мкг', 'г', 'мл'].map((unit) => <button key={unit} className={draft.unit === unit ? 'selected' : ''} onClick={() => patch({ unit })}>{unit}</button>)}</div></> : screen === 2 ? <><h2>Запас в аптечке</h2><p>Укажите, сколько сейчас дома. Остаток изменится только после отметки «Принять».</p><label>Количество, шт.<input value={draft.quantity} onChange={(event) => patch({ quantity: event.target.value })} inputMode="decimal" placeholder="Например, 20" autoFocus /></label><label>Срок годности · необязательно<input value={draft.expiresOn} onChange={(event) => patch({ expiresOn: event.target.value })} type="date" /></label></> : <><h2>Проверьте детали</h2><p>Проверьте ключевые данные перед сохранением.</p><article className="review-card"><strong>{draft.name}</strong><p>{draft.form} · {draft.amount} {draft.unit}</p><hr /><small>ПРИЁМ</small><p>Без расписания</p><small>АПТЕЧКА</small><p>{draft.quantity} шт.{draft.expiresOn ? ` · до ${new Date(`${draft.expiresOn}T12:00:00`).toLocaleDateString('ru-RU')}` : ''}</p></article></>}</section><footer className="flow-footer"><button className="primary-button" disabled={screen === 1 ? !validDetails : screen === 2 ? !validStock : false} onClick={() => screen === 3 ? void onSubmit(draft) : setScreen(screen === 1 ? 2 : 3)}>{screen === 3 ? 'Добавить лекарство' : 'Далее'}</button></footer></div>;
}
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) { return <button className={active ? 'tab active' : 'tab'} onClick={onClick}><span>{icon}</span>{label}</button>; }
