import { FormEvent, useEffect, useMemo, useState } from 'react';

import { supabase } from './supabase';
import { prepareTelegramApp, telegramApp } from './telegram';

type Tab = 'doses' | 'cabinet' | 'lifetab';
type Medication = { id: string; name: string; form: string; amount: string; unit: string; color: string };
type Package = { id: string; medication_id: string; quantity_remaining: number; unit: string; expires_on: string | null };
type Dose = { id: string; medication_id: string; scheduled_time: string; quantity: number; unit: string; status: 'pending' | 'taken' | 'skipped' };

const dateKey = () => new Intl.DateTimeFormat('en-CA').format(new Date());
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const Icon = ({ children }: { children: string }) => <span aria-hidden="true" className="icon">{children}</span>;

export function App() {
  const [tab, setTab] = useState<Tab>('doses');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [doses, setDoses] = useState<Dose[]>([]);
  const [showAddMedication, setShowAddMedication] = useState(false);

  async function signInAndLoad() {
    const app = prepareTelegramApp();
    if (!supabase) {
      setMessage('Mini App пока не настроен: добавьте Supabase URL и publishable key в окружение хостинга.');
      setLoading(false);
      return;
    }
    if (!app?.initData) {
      setMessage('Откройте LifeCare из Telegram, чтобы безопасно войти и увидеть свои данные.');
      setLoading(false);
      return;
    }
    const session = await supabase.auth.getSession();
    if (!session.data.session) {
      const result = await supabase.functions.invoke('telegram-mini-session', { body: { init_data: app.initData } });
      if (result.error || !result.data?.token_hash) {
        setMessage('Не удалось подтвердить Telegram-профиль. Попробуйте открыть Mini App ещё раз.');
        setLoading(false);
        return;
      }
      const auth = await supabase.auth.verifyOtp({ token_hash: result.data.token_hash, type: 'email' });
      if (auth.error) {
        setMessage('Не удалось открыть защищённую сессию. Попробуйте ещё раз.');
        setLoading(false);
        return;
      }
    }
    await loadData();
  }

  async function loadData() {
    if (!supabase) return;
    setLoading(true);
    const [medicationsResult, packagesResult, dosesResult] = await Promise.all([
      supabase.from('medications').select('id,name,form,amount,unit,color').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('medication_packages').select('id,medication_id,quantity_remaining,unit,expires_on').is('deleted_at', null).order('expires_on', { ascending: true, nullsFirst: false }),
      supabase.from('dose_events').select('id,medication_id,scheduled_time,quantity,unit,status').eq('scheduled_on', dateKey()).is('deleted_at', null).order('scheduled_time'),
    ]);
    const error = medicationsResult.error ?? packagesResult.error ?? dosesResult.error;
    if (error) setMessage('Не удалось загрузить данные. Проверьте подключение и доступ к Supabase.');
    else {
      setMedications((medicationsResult.data ?? []) as Medication[]);
      setPackages((packagesResult.data ?? []) as Package[]);
      setDoses((dosesResult.data ?? []) as Dose[]);
      setMessage(null);
    }
    setLoading(false);
  }

  useEffect(() => { void signInAndLoad(); }, []);

  const medicationById = useMemo(() => new Map(medications.map((item) => [item.id, item])), [medications]);
  const packagesByMedication = useMemo(() => packages.reduce<Map<string, Package[]>>((result, item) => {
    result.set(item.medication_id, [...(result.get(item.medication_id) ?? []), item]);
    return result;
  }, new Map()), [packages]);
  const pendingDose = doses.find((dose) => dose.status === 'pending');

  async function markDose(dose: Dose, status: 'taken' | 'skipped') {
    if (!supabase || dose.status !== 'pending') return;
    const { error } = await supabase.from('dose_events').update({ status, completed_at: new Date().toISOString() }).eq('id', dose.id).eq('status', 'pending');
    if (error) setMessage('Не удалось обновить приём. Попробуйте ещё раз.');
    else await loadData();
  }

  async function addMedication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get('name') ?? '').trim();
    const amount = String(fields.get('amount') ?? '').trim();
    const quantity = Number(fields.get('quantity'));
    if (!name || !amount || !Number.isFinite(quantity) || quantity <= 0) {
      setMessage('Укажите название, силу и количество упаковки.');
      return;
    }
    const medicationId = makeId('med');
    const form = String(fields.get('form') ?? 'Таблетка');
    const unit = String(fields.get('unit') ?? 'мг');
    const stockUnit = ['Жидкость', 'Капли', 'Сироп'].includes(form) ? 'мл' : 'шт.';
    const { error: medicationError } = await supabase.from('medications').insert({ id: medicationId, name, form, amount, unit, color: '#20A278', created_at: new Date().toISOString() });
    if (medicationError) { setMessage('Не удалось добавить препарат.'); return; }
    const { error: packageError } = await supabase.from('medication_packages').insert({ id: makeId('pack'), medication_id: medicationId, quantity_initial: quantity, quantity_remaining: quantity, unit: stockUnit, expires_on: String(fields.get('expires_on') || '') || null, created_at: new Date().toISOString() });
    if (packageError) { setMessage('Препарат создан, но упаковку добавить не удалось.'); return; }
    setShowAddMedication(false);
    await loadData();
  }

  const title = tab === 'doses' ? 'Приёмы' : tab === 'cabinet' ? 'Аптечка' : 'LifeTab';
  const eyebrow = tab === 'doses' ? 'СЕГОДНЯ' : tab === 'cabinet' ? 'ДОМАШНЯЯ АПТЕЧКА' : 'LIFECARE DEVICE';

  return <main className={`app-shell app-shell--${tab}`}>
    <header className="header">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
      {tab !== 'lifetab' ? <button className="round-button" onClick={tab === 'cabinet' ? () => setShowAddMedication(true) : () => void loadData()} aria-label={tab === 'cabinet' ? 'Добавить препарат' : 'Обновить данные'}>{tab === 'cabinet' ? '＋' : '↻'}</button> : <span className="preorder"><i />ПРЕДЗАКАЗ</span>}
    </header>
    {message ? <div className="message">{message}</div> : null}
    {loading ? <div className="loading"><span className="loader" />Загружаем данные…</div> : tab === 'doses'
      ? <Doses doses={doses} medicationById={medicationById} pendingDose={pendingDose} onMark={markDose} />
      : tab === 'cabinet'
        ? <Cabinet medications={medications} packagesByMedication={packagesByMedication} onAdd={() => setShowAddMedication(true)} />
        : <LifeTab />}
    <nav className="tabbar" aria-label="Разделы">
      <TabButton active={tab === 'doses'} onClick={() => setTab('doses')} icon="⌂" label="Приёмы" />
      <TabButton active={tab === 'cabinet'} onClick={() => setTab('cabinet')} icon="▰" label="Аптечка" />
      <TabButton active={tab === 'lifetab'} onClick={() => setTab('lifetab')} icon="◈" label="LifeTab" />
    </nav>
    {showAddMedication ? <AddMedication onClose={() => setShowAddMedication(false)} onSubmit={addMedication} /> : null}
  </main>;
}

function Doses({ doses, medicationById, pendingDose, onMark }: { doses: Dose[]; medicationById: Map<string, Medication>; pendingDose?: Dose; onMark: (dose: Dose, status: 'taken' | 'skipped') => Promise<void> }) {
  const taken = doses.filter((dose) => dose.status === 'taken').length;
  const date = new Date();
  const day = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(date).replace('.', '').slice(0, 1).toUpperCase();
  return <section className="doses-screen">
    <div className="today-strip"><div><b>{day}</b><span>{date.getDate()}</span></div><div className="today-strip__copy"><strong>Сегодня</strong><p>Ваш план приёмов</p></div><span className="today-strip__dot" /></div>
    <button className="utility-card"><span className="utility-icon"><Icon>ϟ</Icon></span><span><strong>Параметры уведомлений</strong><small>Напоминания о дозах включены</small></span><b>›</b></button>
    {pendingDose ? <NextDose dose={pendingDose} medication={medicationById.get(pendingDose.medication_id)} onMark={onMark} /> : <div className="empty"><div className="empty-icon">✓</div><h2>На сегодня приёмов нет</h2><p>Запланированные приёмы из LifeCare появятся здесь.</p></div>}
    {doses.length > 0 ? <><section className="progress-card"><p>ПРОГРЕСС ЗА СЕГОДНЯ</p><strong>{Math.round((taken / doses.length) * 100)}%</strong><div><i style={{ width: `${(taken / doses.length) * 100}%` }} /></div></section><p className="section-caption">ВСЕ ПРИЁМЫ</p><div className="dose-list">{doses.map((dose) => <DoseRow key={dose.id} dose={dose} medication={medicationById.get(dose.medication_id)} onMark={onMark} />)}</div></> : null}
  </section>;
}

function NextDose({ dose, medication, onMark }: { dose: Dose; medication?: Medication; onMark: (dose: Dose, status: 'taken' | 'skipped') => Promise<void> }) {
  return <article className="next-dose"><p>СЛЕДУЮЩИЙ ПРИЁМ</p><div className="next-dose__title"><span><strong>{medication?.name ?? 'Препарат'}</strong><small>{medication ? `${medication.form} · ${medication.amount} ${medication.unit}` : `${dose.quantity} ${dose.unit}`}</small></span><time>{dose.scheduled_time.slice(0, 5)}</time></div><button onClick={() => void onMark(dose, 'taken')}>Принять сейчас</button><button className="text-button" onClick={() => void onMark(dose, 'skipped')}>Пропустить</button></article>;
}

function DoseRow({ dose, medication, onMark }: { dose: Dose; medication?: Medication; onMark: (dose: Dose, status: 'taken' | 'skipped') => Promise<void> }) {
  return <article className="dose-row"><time>{dose.scheduled_time.slice(0, 5)}</time><span className="med-icon med-icon--small" style={{ background: medication?.color ?? '#20A278' }}>◉</span><div><strong>{medication?.name ?? 'Препарат'}</strong><small>{dose.quantity} {dose.unit}</small></div>{dose.status === 'pending' ? <button onClick={() => void onMark(dose, 'taken')} aria-label="Отметить принятым">✓</button> : <span className={`dose-status ${dose.status}`}>{dose.status === 'taken' ? 'Принято' : 'Пропущено'}</span>}</article>;
}

function Cabinet({ medications, packagesByMedication, onAdd }: { medications: Medication[]; packagesByMedication: Map<string, Package[]>; onAdd: () => void }) {
  return <section className="cabinet-screen"><p className="medication-count">Препараты · {medications.length}</p>{medications.length ? medications.map((medication) => {
    const packs = packagesByMedication.get(medication.id) ?? [];
    const stock = packs.reduce((total, item) => total + Number(item.quantity_remaining), 0);
    const nextExpiry = packs.filter((item) => item.expires_on).map((item) => item.expires_on!).sort()[0];
    return <article key={medication.id} className="cabinet-card"><span className="med-icon" style={{ background: medication.color }}>◉</span><div><h2>{medication.name}</h2><p>{medication.form} · {medication.amount} {medication.unit}</p><strong>В запасе: {stock} {packs[0]?.unit ?? 'шт.'}</strong>{nextExpiry ? <small>Ближайший срок: {new Date(`${nextExpiry}T12:00:00`).toLocaleDateString('ru-RU')}</small> : null}<div className="cabinet-actions"><button>Открыть карточку ›</button><button onClick={onAdd}>＋ Упаковка</button></div></div></article>;
  }) : <div className="empty"><div className="empty-icon">＋</div><h2>Аптечка пуста</h2><p>Добавьте первую упаковку — она сохранится в цифровой аптечке.</p><button className="primary-button" onClick={onAdd}>Добавить препарат</button></div>}</section>;
}

function LifeTab() {
  const openNativeApp = () => window.location.assign('lifecare://');
  return <section className="lifetab-screen"><div className="device-hero"><div className="device-shadow" /><div className="device"><i>◖</i></div></div><div className="lifetab-price"><span><p>СПЕЦИАЛЬНАЯ ЦЕНА ПРЕДЗАКАЗА</p><strong>от 4 990 ₽</strong></span><small>Первая партия<br />в 2026 году</small></div><button className="lifetab-cta" onClick={openNativeApp}>Открыть приложение <b>→</b></button><p className="lifetab-note">Управление устройством доступно в нативном LifeCare</p><h2>Как LifeTab помогает</h2><div className="feature-list"><div><span>◷</span><p><strong>Напоминает о приёмах</strong><small>Помогает не пропускать важные дозы</small></p></div><div><span>◉</span><p><strong>Синхронизируется с аптечкой</strong><small>Отслеживает запас препаратов</small></p></div></div></section>;
}

function AddMedication({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  return <div className="modal-backdrop"><form className="modal" onSubmit={(event) => void onSubmit(event)}><div className="modal-handle" /><div className="modal-header"><span><p className="eyebrow">АПТЕЧКА</p><h2>Новая упаковка</h2></span><button type="button" className="close" onClick={onClose}>×</button></div><label>Название<input name="name" placeholder="Например, Ибупрофен" autoFocus /></label><div className="form-row"><label>Форма<select name="form"><option>Таблетка</option><option>Капсула</option><option>Капли</option><option>Сироп</option><option>Жидкость</option></select></label><label>Сила<input name="amount" inputMode="decimal" placeholder="400" /></label></div><div className="form-row"><label>Единица<select name="unit"><option>мг</option><option>мкг</option><option>г</option><option>мл</option></select></label><label>Количество<input name="quantity" inputMode="decimal" placeholder="20" /></label></div><label>Срок годности <span>необязательно</span><input name="expires_on" type="date" /></label><button className="primary-button" type="submit">Добавить в аптечку</button></form></div>;
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) { return <button className={active ? 'tab active' : 'tab'} onClick={onClick}><span>{icon}</span>{label}</button>; }
