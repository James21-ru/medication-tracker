import { useMemo, useState } from 'react';
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

type Tab = 'cabinet' | 'doses' | 'reports' | 'account';

export function RebuiltApp() {
  return <LifeCareProvider><LifeCareShell /></LifeCareProvider>;
}

function LifeCareShell() {
  const { isReady } = useLifeCare();
  const [tab, setTab] = useState<Tab>('cabinet');
  if (!isReady) return <main className="lc-loading" aria-busy="true"><span /><p>Загружаем аптечку</p></main>;
  return <main className="lc-app-shell"><header className="lc-app-header"><div><span className="lc-app-header__brand">LifeCare</span><p>{tab === 'cabinet' ? 'Ваша аптечка' : tab === 'doses' ? 'План приёмов' : tab === 'reports' ? 'Динамика приёмов' : 'Профиль'}</p></div><button className="lc-avatar" aria-label="Открыть аккаунт" onClick={() => setTab('account')}><Icon name="person" /></button></header><div className="lc-app-content">{tab === 'cabinet' ? <CabinetScreen /> : tab === 'doses' ? <DosesScreen /> : tab === 'reports' ? <ReportsScreen /> : <AccountScreen />}</div><nav className="lc-tabbar" aria-label="Основная навигация">{([{ key: 'cabinet', label: 'Аптечка', icon: 'case' }, { key: 'doses', label: 'Приёмы', icon: 'calendar' }, { key: 'reports', label: 'Отчёты', icon: 'chart' }, { key: 'account', label: 'Аккаунт', icon: 'person' }] as const).map((item) => <button key={item.key} aria-current={tab === item.key ? 'page' : undefined} className={tab === item.key ? 'is-active' : ''} onClick={() => setTab(item.key)}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav></main>;
}

function CabinetScreen() {
  const { data } = useLifeCare();
  const [cabinetId, setCabinetId] = useState<string | null>(data.cabinets[0]?.id ?? null);
  const [createOpen, setCreateOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addCabinetChooserOpen, setAddCabinetChooserOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [openedMedication, setOpenedMedication] = useState<Medication | null>(null);
  const [search, setSearch] = useState('');
  const selectedCabinet = data.cabinets.find((cabinet) => cabinet.id === cabinetId) ?? data.cabinets[0] ?? null;
  const medications = useMemo(() => data.medications.filter((medication) => medication.cabinetId === selectedCabinet?.id && medication.name.toLocaleLowerCase('ru-RU').includes(search.trim().toLocaleLowerCase('ru-RU'))), [data.medications, selectedCabinet?.id, search]);
  return <>
    {selectedCabinet ? <section className="lc-cabinet">
      <button className="lc-cabinet-switcher" onClick={() => setChooserOpen(true)}><span className="lc-cabinet-switcher__icon"><Icon name="case" /></span><span><small>Выбранная аптечка</small><strong>{selectedCabinet.name}</strong></span><Icon name="chevron" /></button>
      <div className="lc-section-heading"><div><p>ПРЕПАРАТЫ</p><h1>Аптечка</h1></div><button className="lc-round-add" onClick={() => setAddCabinetChooserOpen(true)} aria-label="Добавить препарат"><Icon name="plus" /></button></div>
      <label className="lc-search"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти препарат" aria-label="Найти препарат" /></label>
      {medications.length ? <div className="lc-medication-list">{medications.map((medication) => { const packages = data.packages.filter((item) => item.medicationId === medication.id); const today = new Intl.DateTimeFormat('en-CA').format(new Date()); const stock = packages.filter((item) => !item.expiresOn || item.expiresOn >= today).reduce((total, item) => total + item.quantity, 0); return <button className="lc-medication-card" key={medication.id} onClick={() => setOpenedMedication(medication)}><div className="lc-medication-card__icon"><Icon name="pill" /></div><div><h2>{medication.name}</h2><p>{medication.form}{medication.packageDose ? ` · ${medication.packageDose}` : ''}</p><strong>В наличии: {stock} {packages[0]?.unit ?? 'шт.'}</strong></div><Icon name="chevron" /></button>; })}</div> : search.trim() ? <EmptyState icon="pill" title="Ничего не найдено" description="Проверьте название или очистите поиск." /> : <EmptyState icon="case" title="Здесь будут ваши препараты" description="Добавьте первый препарат, чтобы видеть запас и срок годности." action={<button className="lc-primary-button" onClick={() => setAddCabinetChooserOpen(true)}><Icon name="plus" />Добавить препарат</button>} />}
    </section> : <EmptyState icon="case" title="Создайте аптечку" description="Записывайте, какие лекарства есть дома, на работе или в поездке." action={<button className="lc-primary-button" onClick={() => setCreateOpen(true)}><Icon name="plus" />Создать аптечку</button>} />}
    {createOpen ? <CreateCabinet onClose={() => setCreateOpen(false)} onCreated={(cabinet) => { setCabinetId(cabinet.id); setCreateOpen(false); }} /> : null}
    {addOpen && selectedCabinet ? <AddMedicationFlow cabinet={selectedCabinet} onClose={() => setAddOpen(false)} /> : null}
    {addCabinetChooserOpen ? <CabinetChooser current={selectedCabinet} onClose={() => setAddCabinetChooserOpen(false)} onSelect={(cabinet) => { setCabinetId(cabinet.id); setAddCabinetChooserOpen(false); setAddOpen(true); }} onCreate={() => { setAddCabinetChooserOpen(false); setCreateOpen(true); }} /> : null}
    {chooserOpen ? <CabinetChooser current={selectedCabinet} onClose={() => setChooserOpen(false)} onSelect={(cabinet) => { setCabinetId(cabinet.id); setChooserOpen(false); }} onCreate={() => { setChooserOpen(false); setCreateOpen(true); }} /> : null}
    {openedMedication ? <MedicationDetail medication={openedMedication} onClose={() => setOpenedMedication(null)} /> : null}
  </>;
}

function MedicationDetail({ medication, onClose }: { medication: Medication; onClose: () => void }) {
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
  return <>{<Sheet title="Карточка препарата" onClose={onClose} footer={<div className="lc-flow-actions"><button className="lc-secondary-button" onClick={() => setPackageOpen(true)}>Пополнить</button><button className="lc-primary-button" onClick={() => setScheduleOpen(true)}>{schedule ? 'Изменить график' : 'Настроить приём'}</button></div>}><div className="lc-medication-detail"><div className="lc-medication-detail__icon"><Icon name="pill" /></div><h2>{medication.name}</h2><p>{medication.form}{medication.packageDose ? ` · ${medication.packageDose}` : ''}</p><section><span>В наличии</span><strong>{stock} {unit}</strong></section><section><span>График</span><strong>{schedule ? `${schedule.frequency === 'daily' ? 'Каждый день' : schedule.frequency === 'as-needed' ? 'По необходимости' : 'Настроен'}${schedule.frequency === 'as-needed' ? '' : ` в ${schedule.times.map((item) => item.time).join(', ')}`}` : 'Не настроен'}</strong></section>{asNeededSchedule ? <button className="lc-manual-dose-button" onClick={() => setManualDoseOpen(true)}>Отметить приём сейчас</button> : null}<div className="lc-medication-actions"><button onClick={() => setEditOpen(true)}>Изменить данные</button><button onClick={() => setDeleteOpen(true)}>Удалить препарат</button></div><div className="lc-package-list"><h3>Упаковки</h3>{packages.sort((left, right) => (left.expiresOn ?? '9999-12-31').localeCompare(right.expiresOn ?? '9999-12-31')).map((pack) => <div key={pack.id}><span><strong>{pack.quantity} {pack.unit}</strong><small>{pack.expiresOn ? `Годен до ${new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(new Date(`${pack.expiresOn}T12:00:00`))}` : 'Срок не указан'}</small></span><em className={pack.expiresOn && pack.expiresOn < today ? 'is-expired' : ''}>{pack.expiresOn && pack.expiresOn < today ? 'Просрочена' : 'Пригодна'}</em></div>)}</div></div></Sheet>}{scheduleOpen ? <ScheduleFlow medication={medication} unit={unit} schedule={schedule} onClose={() => { setScheduleOpen(false); onClose(); }} /> : null}{packageOpen ? <AddPackageSheet medication={medication} unit={unit} onClose={() => setPackageOpen(false)} /> : null}{manualDoseOpen && asNeededSchedule ? <ManualDoseSheet medication={medication} schedule={asNeededSchedule} onClose={() => setManualDoseOpen(false)} /> : null}{editOpen ? <EditMedicationSheet medication={medication} onClose={() => setEditOpen(false)} /> : null}{deleteOpen ? <DeleteMedicationSheet medication={medication} onClose={() => setDeleteOpen(false)} onDeleted={onClose} /> : null}</>;
}

function DeleteMedicationSheet({ medication, onClose, onDeleted }: { medication: Medication; onClose: () => void; onDeleted: () => void }) {
  const { deleteMedication } = useLifeCare();
  return <Sheet title="Удалить препарат" onClose={onClose} footer={<button className="lc-danger-button" onClick={() => { deleteMedication(medication.id); onDeleted(); }}>Удалить препарат</button>}><div className="lc-delete-medication"><p className="lc-eyebrow">ВНИМАНИЕ</p><h2>Удалить «{medication.name}»?</h2><p>Будут удалены упаковки, графики и история отметок по этому препарату. Это действие нельзя отменить.</p></div></Sheet>;
}

function CreateCabinet({ onClose, onCreated }: { onClose: () => void; onCreated: (cabinet: Cabinet) => void }) {
  const { createCabinet } = useLifeCare();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const submit = () => { const result = createCabinet(name); if (result.error) { setError(result.error); return; } if (result.existing) { onCreated(result.existing); return; } if (result.cabinet) onCreated(result.cabinet); };
  return <Sheet title="Новая аптечка" onClose={onClose} footer={<button className="lc-primary-button" disabled={!name.trim()} onClick={submit}>Создать аптечку</button>}><div className="lc-create-cabinet"><p className="lc-eyebrow">ПЕРВЫЙ ШАГ</p><h2>Где хранятся лекарства?</h2><p>Короткое название поможет не смешивать лекарства из разных мест.</p><label className="lc-field">Название аптечки<input autoFocus value={name} onChange={(event) => { setName(event.target.value); setError(''); }} placeholder="Например, Домашняя" /></label><div className="lc-suggestions"><button onClick={() => setName('Домашняя')}>Домашняя</button><button onClick={() => setName('На работе')}>На работе</button><button onClick={() => setName('В поездке')}>В поездке</button></div>{error ? <p className="lc-form-error" role="alert">{error}</p> : null}</div></Sheet>;
}

function CabinetChooser({ current, onClose, onSelect, onCreate }: { current: Cabinet; onClose: () => void; onSelect: (cabinet: Cabinet) => void; onCreate: () => void }) {
  const { data } = useLifeCare();
  return <Sheet title="Выберите аптечку" onClose={onClose} footer={<button className="lc-secondary-button" onClick={onCreate}><Icon name="plus" />Создать аптечку</button>}><div className="lc-cabinet-choices">{data.cabinets.map((cabinet) => <button key={cabinet.id} className={cabinet.id === current.id ? 'is-selected' : ''} onClick={() => onSelect(cabinet)}><span><strong>{cabinet.name}</strong><small>{data.medications.filter((item) => item.cabinetId === cabinet.id).length} препаратов</small></span>{cabinet.id === current.id ? <Icon name="check" /> : <span className="lc-radio" />}</button>)}</div></Sheet>;
}
