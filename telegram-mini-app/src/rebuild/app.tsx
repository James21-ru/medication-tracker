import { useEffect, useMemo, useRef, useState } from 'react';
import type { Cabinet, Medication } from './domain/models';
import { LifeCareProvider, useLifeCare } from './state/lifecare-store';
import { AddMedicationFlow } from './add-medication-flow';
import { AddPackageSheet } from './add-package-sheet';
import { EditMedicationSheet } from './edit-medication-sheet';
import { ManualDoseSheet } from './manual-dose-sheet';
import { DosesScreen } from './doses-screen';
import { ReportsScreen } from './reports-screen';
import { AccountScreen } from './account-screen';
import { ScheduleFlow } from './schedule-flow';
import { EmptyState } from './ui/empty-state';
import { Icon } from './ui/icons';
import { Sheet } from './ui/sheet';
import { SheetPresence } from './ui/sheet-presence';
import { SyncStatus } from './ui/sync-status';
import './ui/navigation-motion.css';

type Tab = 'cabinet' | 'doses' | 'reports' | 'account';

export function RebuiltApp() {
  return <LifeCareProvider><LifeCareShell /></LifeCareProvider>;
}

function LifeCareShell() {
  const { isReady, sync, retrySync } = useLifeCare();
  const [tab, setTab] = useState<Tab>('cabinet');
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);
  const noticeSequence = useRef(0);
  const announce = (text: string) => setNotice({ text, id: ++noticeSequence.current });
  useEffect(() => {
    if (!notice) return;
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 3000 : 3400;
    const timer = window.setTimeout(() => setNotice((current) => current?.id === notice.id ? null : current), duration);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!isReady) {
    const waiting = sync.status === 'loading' || sync.status === 'syncing';
    const cleared = sync.status === 'ready' && !sync.hydrated;
    return <main className="lc-loading" aria-busy={waiting}>{waiting ? <span /> : null}<h1>{waiting ? 'Загружаем аптечку' : cleared ? 'Локальная копия очищена' : 'Не удалось загрузить аптечку'}</h1><p>{waiting ? 'Проверяем данные вашего аккаунта.' : cleared ? 'Данные в аккаунте сохранены. Их можно загрузить снова.' : sync.error ?? 'Проверьте интернет и повторите попытку. Создавать аптечку заново не нужно.'}</p>{!waiting ? <button className="lc-primary-button" onClick={retrySync}>{cleared ? 'Загрузить снова' : 'Повторить'}</button> : null}</main>;
  }
  return <main className="lc-app-shell">
    <div className="lc-app-content">
      <SyncStatus />
      <div className="lc-save-notice" role="status" aria-atomic="true">
        {notice && <span key={notice.id} className="lc-save-notice__message" onAnimationEnd={(event) => {
          if (event.animationName === 'lc-save-notice-cycle') setNotice((current) => current?.id === notice.id ? null : current);
        }}>{notice.text}</span>}
      </div>
      <div className="lc-tab-content" key={tab}>
        {tab === 'cabinet' ? <CabinetScreen announce={announce} /> : tab === 'doses' ? <DosesScreen announce={announce} /> : tab === 'reports' ? <ReportsScreen /> : <AccountScreen />}
      </div>
    </div>
    <nav className="lc-tabbar" aria-label="Основная навигация">{([{ key: 'cabinet', label: 'Аптечка', icon: 'case' }, { key: 'doses', label: 'Приемы', icon: 'calendar' }, { key: 'reports', label: 'Отчеты', icon: 'chart' }, { key: 'account', label: 'Аккаунт', icon: 'person' }] as const).map((item) => <button key={item.key} aria-current={tab === item.key ? 'page' : undefined} className={tab === item.key ? 'is-active' : ''} onClick={() => setTab(item.key)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
  </main>;
}

function CabinetScreen({ announce }: { announce: (text: string) => void }) {
  const { data } = useLifeCare();
  const [cabinetId, setCabinetId] = useState<string | null>(data.cabinets[0]?.id ?? null);
  const [createOpen, setCreateOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addCabinetChooserOpen, setAddCabinetChooserOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [openedMedication, setOpenedMedication] = useState<Medication | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'name' | 'stock' | 'expiry'>('name');
  const detailMedication = openedMedication
    ? data.medications.find((medication) => medication.id === openedMedication.id) ?? openedMedication
    : null;
  const selectedCabinet = data.cabinets.find((cabinet) => cabinet.id === cabinetId) ?? data.cabinets[0] ?? null;
  const medications = useMemo(() => {
    const today = new Intl.DateTimeFormat('en-CA').format(new Date());
    const inThirtyDays = new Intl.DateTimeFormat('en-CA').format(new Date(Date.now() + 30 * 86_400_000));
    const stockFor = (medication: Medication) => data.packages.filter((item) => item.medicationId === medication.id && (!item.expiresOn || item.expiresOn >= today)).reduce((total, item) => total + item.quantity, 0);
    const expiryFor = (medication: Medication) => data.packages.filter((item) => item.medicationId === medication.id && item.quantity > 0).map((item) => item.expiresOn).filter((date): date is string => Boolean(date)).sort()[0] ?? '9999-12-31';
    return data.medications.filter((medication) => medication.cabinetId === selectedCabinet?.id && medication.name.toLocaleLowerCase('ru-RU').includes(search.trim().toLocaleLowerCase('ru-RU'))).sort((left, right) => sort === 'stock' ? stockFor(left) - stockFor(right) : sort === 'expiry' ? expiryFor(left).localeCompare(expiryFor(right)) : left.name.localeCompare(right.name, 'ru')).map((medication) => ({ medication, stock: stockFor(medication), expiresSoon: expiryFor(medication) <= inThirtyDays, expiry: expiryFor(medication) }));
  }, [data.medications, data.packages, selectedCabinet?.id, search, sort]);
  return <>
    {selectedCabinet ? <section className="lc-cabinet">
      <div className="lc-section-heading"><div><p>ПРЕПАРАТЫ</p><h1>Аптечка</h1></div><button className="lc-round-add" onClick={() => setAddCabinetChooserOpen(true)} aria-label="Добавить препарат"><Icon name="plus" /></button></div>
      <button className="lc-cabinet-switcher" onClick={() => setChooserOpen(true)}><span className="lc-cabinet-switcher__icon"><Icon name="case" /></span><span><small>Выбранная аптечка</small><strong>{selectedCabinet.name}</strong></span><Icon name="chevron" /></button>
      <label className="lc-search"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти препарат" aria-label="Найти препарат" /></label>
      {medications.length ? <><div className="lc-sort" role="group" aria-label="Сортировка препаратов"><button className={sort === 'name' ? 'is-active' : ''} onClick={() => setSort('name')}>Все</button><button className={sort === 'stock' ? 'is-active' : ''} onClick={() => setSort('stock')}>Заканчиваются</button><button className={sort === 'expiry' ? 'is-active' : ''} onClick={() => setSort('expiry')}>Скоро истекает</button></div><div className="lc-medication-list">{medications.map(({ medication, stock, expiresSoon, expiry }) => { const packages = data.packages.filter((item) => item.medicationId === medication.id); const unit = packages[0]?.unit ?? 'шт.'; const alert = stock <= 0 ? 'Нет запаса' : expiresSoon ? `Срок до ${new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(`${expiry}T12:00:00`))}` : null; return <button className="lc-medication-card" key={medication.id} onClick={() => setOpenedMedication(medication)}><div className="lc-medication-card__icon"><Icon name="pill" /></div><div><h2>{medication.name}</h2><p>{medication.form}{medication.packageDose ? ` · ${medication.packageDose}` : ''}</p><strong className={stock <= 0 ? 'is-empty' : ''}>В наличии: {stock} {unit}</strong>{alert ? <small className={stock <= 0 ? 'is-critical' : 'is-warning'}>{alert}</small> : null}</div><Icon name="chevron" /></button>; })}</div></> : search.trim() ? <EmptyState icon="pill" title="Ничего не найдено" description="Проверьте название или очистите поиск." /> : <EmptyState icon="case" title="Здесь будут ваши препараты" description="Добавьте первый препарат, чтобы видеть запас и срок годности." action={<button className="lc-primary-button" onClick={() => setAddCabinetChooserOpen(true)}><Icon name="plus" />Добавить препарат</button>} />}
    </section> : <EmptyState icon="case" title="Создайте аптечку" description="Записывайте, какие лекарства есть дома, на работе или в поездке." action={<button className="lc-primary-button" onClick={() => setCreateOpen(true)}><Icon name="plus" />Создать аптечку</button>} />}
    <SheetPresence>{createOpen ? <CreateCabinet onClose={() => setCreateOpen(false)} onSelect={(cabinet, created) => {
      setCabinetId(cabinet.id);
      setCreateOpen(false);
      announce(created ? 'Аптечка создана' : 'Аптечка выбрана');
    }} /> : null}</SheetPresence>
    <SheetPresence>{addOpen && selectedCabinet ? <AddMedicationFlow cabinet={selectedCabinet} onClose={() => setAddOpen(false)} /> : null}</SheetPresence>
    <SheetPresence>{addCabinetChooserOpen ? <CabinetChooser current={selectedCabinet} onClose={() => setAddCabinetChooserOpen(false)} onSelect={(cabinet) => { setCabinetId(cabinet.id); setAddCabinetChooserOpen(false); setAddOpen(true); }} onCreate={() => { setAddCabinetChooserOpen(false); setCreateOpen(true); }} /> : null}</SheetPresence>
    <SheetPresence>{chooserOpen ? <CabinetChooser current={selectedCabinet} onClose={() => setChooserOpen(false)} onSelect={(cabinet) => { setCabinetId(cabinet.id); setChooserOpen(false); }} onCreate={() => { setChooserOpen(false); setCreateOpen(true); }} /> : null}</SheetPresence>
    <SheetPresence>{detailMedication ? <MedicationDetail announce={announce} medication={detailMedication} onClose={() => setOpenedMedication(null)} /> : null}</SheetPresence>
  </>;
}

function MedicationDetail({ medication, onClose, announce }: { medication: Medication; onClose: () => void; announce: (text: string) => void }) {
  const { data } = useLifeCare();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [packageOpen, setPackageOpen] = useState(false);
  const [manualDoseOpen, setManualDoseOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const packages = data.packages.filter((item) => item.medicationId === medication.id);
  const stock = packages.filter((item) => !item.expiresOn || item.expiresOn >= new Intl.DateTimeFormat('en-CA').format(new Date())).reduce((total, item) => total + item.quantity, 0);
  const unit = packages[0]?.unit ?? 'шт.';
  const schedule = data.schedules.find((item) => item.medicationId === medication.id && item.active);
  const asNeededSchedule = data.schedules.find((item) => item.medicationId === medication.id && item.active && item.frequency === 'as-needed');
  const today = new Intl.DateTimeFormat('en-CA').format(new Date());
  return <>{<Sheet title="Карточка препарата" onClose={onClose} footer={<div className="lc-flow-actions"><button className="lc-secondary-button" onClick={() => setPackageOpen(true)}>Пополнить</button><button className="lc-primary-button" onClick={() => setScheduleOpen(true)}>{schedule ? 'Изменить график' : 'Настроить прием'}</button></div>}><div className="lc-medication-detail"><div className="lc-medication-detail__icon"><Icon name="pill" /></div><h2>{medication.name}</h2><p>{medication.form}{medication.packageDose ? ` · ${medication.packageDose}` : ''}</p><section><span>В наличии</span><strong>{stock} {unit}</strong></section><section><span>График</span><strong>{schedule ? `${schedule.frequency === 'daily' ? 'Каждый день' : schedule.frequency === 'as-needed' ? 'По необходимости' : 'Настроен'}${schedule.frequency === 'as-needed' ? '' : ` в ${schedule.times.map((item) => item.time).join(', ')}`}` : 'Не настроен'}</strong></section>{asNeededSchedule ? <button className="lc-manual-dose-button" onClick={() => setManualDoseOpen(true)}>Отметить прием сейчас</button> : null}<div className="lc-medication-actions"><button onClick={() => setEditOpen(true)}>Изменить данные</button><button onClick={() => setDeleteOpen(true)}>Удалить препарат</button></div><div className="lc-package-list"><h3>Упаковки</h3>{packages.sort((left, right) => (left.expiresOn ?? '9999-12-31').localeCompare(right.expiresOn ?? '9999-12-31')).map((pack) => <div key={pack.id}><span><strong>{pack.quantity} {pack.unit}</strong><small>{pack.expiresOn ? `Годен до ${new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(`${pack.expiresOn}T12:00:00`))}` : 'Срок не указан'}</small></span><em className={pack.expiresOn && pack.expiresOn < today ? 'is-expired' : ''}>{pack.expiresOn && pack.expiresOn < today ? 'Просрочена' : 'Пригодна'}</em></div>)}</div></div></Sheet>}<SheetPresence>{scheduleOpen ? <ScheduleFlow medication={medication} unit={unit} schedule={schedule} onClose={() => setScheduleOpen(false)} onSaved={() => {
      setScheduleOpen(false);
      onClose();
      announce('График сохранен');
    }} /> : null}</SheetPresence>
    <SheetPresence>{packageOpen ? <AddPackageSheet medication={medication} unit={unit} onClose={() => setPackageOpen(false)} /> : null}</SheetPresence>
    <SheetPresence>{manualDoseOpen && asNeededSchedule ? <ManualDoseSheet medication={medication} schedule={asNeededSchedule} onClose={() => setManualDoseOpen(false)} /> : null}</SheetPresence>
    <SheetPresence>{editOpen ? <EditMedicationSheet medication={medication} onClose={() => setEditOpen(false)} /> : null}</SheetPresence>
    <SheetPresence>{deleteOpen ? <DeleteMedicationSheet medication={medication} onClose={() => setDeleteOpen(false)} onDeleted={onClose} /> : null}</SheetPresence></>;
}

function DeleteMedicationSheet({ medication, onClose, onDeleted }: { medication: Medication; onClose: () => void; onDeleted: () => void }) {
  const { deleteMedication } = useLifeCare();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <Sheet title="Удалить препарат" onClose={() => { if (!busy) onClose(); }} footer={<button className="lc-danger-button" disabled={busy} onClick={() => { if (busy) return; setBusy(true); setError(null); void deleteMedication(medication.id).then(onDeleted).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Не удалось сохранить удаление.')).finally(() => setBusy(false)); }}>Удалить препарат</button>}><div className="lc-delete-medication"><p className="lc-eyebrow">ВНИМАНИЕ</p><h2>Удалить «{medication.name}»?</h2><p>Будут удалены упаковки, графики и история отметок по этому препарату. Это действие нельзя отменить.</p>{error ? <p className="lc-form-error" role="alert">{error}</p> : null}</div></Sheet>;
}

function CreateCabinet({ onClose, onSelect }: { onClose: () => void; onSelect: (cabinet: Cabinet, created: boolean) => void }) {
  const { createCabinet } = useLifeCare();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await createCabinet(name);
      if (result.error) setError(result.error);
      else if (result.existing) onSelect(result.existing, false);
      else if (result.cabinet) onSelect(result.cabinet, true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось сохранить аптечку.');
    } finally {
      setBusy(false);
    }
  }
  return <Sheet title="Новая аптечка" onClose={() => { if (!busy) onClose(); }} footer={<button className="lc-primary-button" disabled={busy || !name.trim()} onClick={submit}>Создать аптечку</button>}><div className="lc-create-cabinet"><p className="lc-eyebrow">ПЕРВЫЙ ШАГ</p><h2>Где хранятся лекарства?</h2><p>Короткое название поможет не смешивать лекарства из разных мест.</p><label className="lc-field">Название аптечки<input value={name} onChange={(event) => { setName(event.target.value); setError(''); }} placeholder="Например, Домашняя" /></label><div className="lc-suggestions"><button onClick={() => setName('Домашняя')}>Домашняя</button><button onClick={() => setName('На работе')}>На работе</button><button onClick={() => setName('В поездке')}>В поездке</button></div>{error ? <p className="lc-form-error" role="alert">{error}</p> : null}</div></Sheet>;
}

function CabinetChooser({ current, onClose, onSelect, onCreate }: { current: Cabinet; onClose: () => void; onSelect: (cabinet: Cabinet) => void; onCreate: () => void }) {
  const { data } = useLifeCare();
  return <Sheet title="Выберите аптечку" onClose={onClose} footer={<button className="lc-secondary-button" onClick={onCreate}><Icon name="plus" />Создать аптечку</button>}><div className="lc-cabinet-choices">{data.cabinets.map((cabinet) => <button key={cabinet.id} className={cabinet.id === current.id ? 'is-selected' : ''} onClick={() => onSelect(cabinet)}><span><strong>{cabinet.name}</strong><small>{data.medications.filter((item) => item.cabinetId === cabinet.id).length} препаратов</small></span>{cabinet.id === current.id ? <Icon name="check" /> : <span className="lc-radio" />}</button>)}</div></Sheet>;
}
