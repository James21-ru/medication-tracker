import { FormEvent, useEffect, useMemo, useState } from 'react';

import { supabase } from './supabase';
import { prepareTelegramApp, telegramApp } from './telegram';

type Tab = 'doses' | 'cabinet' | 'lifetab';
type Medication = { id: string; name: string; form: string; amount: string; unit: string; color: string };
type Package = { id: string; medication_id: string; quantity_remaining: number; unit: string; expires_on: string | null };
type Dose = { id: string; medication_id: string; scheduled_time: string; quantity: number; unit: string; status: 'pending' | 'taken' | 'skipped' };

const dateKey = () => new Intl.DateTimeFormat('en-CA').format(new Date());
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
    const { error: medicationError } = await supabase.from('medications').insert({ id: medicationId, name, form, amount, unit, color: '#1688F7', created_at: new Date().toISOString() });
    if (medicationError) { setMessage('Не удалось добавить препарат.'); return; }
    const { error: packageError } = await supabase.from('medication_packages').insert({ id: makeId('pack'), medication_id: medicationId, quantity_initial: quantity, quantity_remaining: quantity, unit: stockUnit, expires_on: String(fields.get('expires_on') || '') || null, created_at: new Date().toISOString() });
    if (packageError) { setMessage('Препарат создан, но упаковку добавить не удалось.'); return; }
    setShowAddMedication(false);
    await loadData();
  }

  return <main className="app-shell">
    <header className="header"><div><p className="eyebrow">LIFECARE</p><h1>{tab === 'doses' ? 'Приёмы' : tab === 'cabinet' ? 'Аптечка' : 'Таблетница'}</h1></div><button className="refresh" onClick={() => void loadData()} aria-label="Обновить данные">↻</button></header>
    {message ? <div className="message">{message}</div> : null}
    {loading ? <div className="loading">Загружаем данные…</div> : tab === 'doses' ? <Doses doses={doses} medicationById={medicationById} onMark={markDose} /> : tab === 'cabinet' ? <Cabinet medications={medications} packagesByMedication={packagesByMedication} onAdd={() => setShowAddMedication(true)} /> : <LifeTab />}
    <nav className="tabbar" aria-label="Разделы">
      <TabButton active={tab === 'doses'} onClick={() => setTab('doses')} icon="◷" label="Приёмы" />
      <TabButton active={tab === 'cabinet'} onClick={() => setTab('cabinet')} icon="▣" label="Аптечка" />
      <TabButton active={tab === 'lifetab'} onClick={() => setTab('lifetab')} icon="◉" label="Таблетница" />
    </nav>
    {showAddMedication ? <AddMedication onClose={() => setShowAddMedication(false)} onSubmit={addMedication} /> : null}
  </main>;
}

function Doses({ doses, medicationById, onMark }: { doses: Dose[]; medicationById: Map<string, Medication>; onMark: (dose: Dose, status: 'taken' | 'skipped') => Promise<void> }) {
  if (!doses.length) return <section className="empty"><div className="empty-icon">✓</div><h2>На сегодня приёмов нет</h2><p>Запланированные приёмы из LifeCare появятся здесь.</p></section>;
  return <section className="content"><p className="section-caption">СЕГОДНЯ</p>{doses.map((dose) => { const medication = medicationById.get(dose.medication_id); return <article className="dose-card" key={dose.id}><div className="dose-time">{dose.scheduled_time.slice(0, 5)}</div><div className="dose-main"><h2>{medication?.name ?? 'Препарат'}</h2><p>{medication ? `${medication.form} · ${medication.amount} ${medication.unit}` : ''} · {dose.quantity} {dose.unit}</p>{dose.status === 'pending' ? <div className="actions"><button className="secondary" onClick={() => void onMark(dose, 'skipped')}>Пропустить</button><button className="primary" onClick={() => void onMark(dose, 'taken')}>Принять</button></div> : <span className={dose.status === 'taken' ? 'status taken' : 'status skipped'}>{dose.status === 'taken' ? 'Принято' : 'Пропущено'}</span>}</div></article>; })}</section>;
}

function Cabinet({ medications, packagesByMedication, onAdd }: { medications: Medication[]; packagesByMedication: Map<string, Package[]>; onAdd: () => void }) {
  return <section className="content"><button className="primary add" onClick={onAdd}>＋ Добавить препарат</button>{medications.length ? medications.map((medication) => { const packs = packagesByMedication.get(medication.id) ?? []; const stock = packs.reduce((total, item) => total + Number(item.quantity_remaining), 0); const nextExpiry = packs.filter((item) => item.expires_on).map((item) => item.expires_on!).sort()[0]; return <article key={medication.id} className="cabinet-card"><span className="med-icon" style={{ background: medication.color }}>◉</span><div><h2>{medication.name}</h2><p>{medication.form} · {medication.amount} {medication.unit}</p><strong>В запасе: {stock} {packs[0]?.unit ?? 'шт.'}</strong>{nextExpiry ? <small>Ближайший срок: {new Date(`${nextExpiry}T12:00:00`).toLocaleDateString('ru-RU')}</small> : null}</div></article>; }) : <div className="empty"><div className="empty-icon">＋</div><h2>Аптечка пуста</h2><p>Добавьте первую упаковку — она сохранится в вашей цифровой аптечке.</p></div>}</section>;
}

function LifeTab() { const openNativeApp = () => { const url = 'lifecare://'; if (telegramApp()) window.location.assign(url); else window.location.href = url; }; return <section className="content lifetab"><div className="lifetab-visual">◫</div><p className="section-caption">LIFECARE DEVICE</p><h2>Таблетница LifeTab</h2><p>Управляйте подключённой таблетницей в нативном приложении LifeCare.</p><button className="primary" onClick={openNativeApp}>Открыть приложение</button><small>Если приложение не установлено, установите LifeCare из TestFlight или Google Play.</small></section>; }

function AddMedication({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) { return <div className="modal-backdrop"><form className="modal" onSubmit={(event) => void onSubmit(event)}><div className="modal-header"><h2>Новая упаковка</h2><button type="button" className="close" onClick={onClose}>×</button></div><label>Название<input name="name" placeholder="Например, Ибупрофен" autoFocus /></label><label>Форма<select name="form"><option>Таблетка</option><option>Капсула</option><option>Капли</option><option>Сироп</option><option>Жидкость</option></select></label><label>Сила<input name="amount" inputMode="decimal" placeholder="400" /></label><label>Единица<select name="unit"><option>мг</option><option>мкг</option><option>г</option><option>мл</option></select></label><label>Количество упаковки<input name="quantity" inputMode="decimal" placeholder="20" /></label><label>Срок годности <span>необязательно</span><input name="expires_on" type="date" /></label><button className="primary" type="submit">Добавить в аптечку</button></form></div>; }
function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) { return <button className={active ? 'tab active' : 'tab'} onClick={onClick}><span>{icon}</span>{label}</button>; }
