import { useState } from 'react';
import { useLifeCare } from './state/lifecare-store';
import { Icon } from './ui/icons';
import { Sheet } from './ui/sheet';
import { SheetPresence } from './ui/sheet-presence';

export function AccountScreen() {
  const { data, exportLocalCopy, legacyCopies } = useLifeCare();
  const [resetOpen, setResetOpen] = useState(false);
  const activeSchedules = data.schedules.filter((schedule) => schedule.active).length;
  return <section className="lc-account-screen">
    <div className="lc-section-heading"><div><p>ПРОСТРАНСТВО ПОЛЬЗОВАТЕЛЯ</p><h1>Аккаунт</h1></div></div>
    <article className="lc-account-hero"><span><Icon name="person" /></span><div><h2>LifeCare в Telegram</h2><p>Аптечки связаны с аккаунтом Telegram. На устройстве хранится копия для работы без сети. Состояние синхронизации показано над экраном.</p></div></article>
    <section className="lc-account-section"><h2>Ваши данные</h2><div className="lc-account-list"><div><span><Icon name="case" /></span><p><strong>{data.cabinets.length}</strong><small>аптечек</small></p></div><div><span><Icon name="pill" /></span><p><strong>{data.medications.length}</strong><small>препаратов</small></p></div><div><span><Icon name="calendar" /></span><p><strong>{activeSchedules}</strong><small>графиков</small></p></div></div></section>
    <section className="lc-account-section"><h2>Напоминания в Telegram</h2><article className="lc-account-info"><span><Icon name="calendar" /></span><div><strong>Подключите бота командой /start</strong><p>В назначенное время придет сообщение с кнопками «Принять» и «Отложить». Если не ответить, бот напомнит еще раз через 20 минут.</p></div></article></section>
    {legacyCopies.length ? <LegacyCopies /> : null}
    <section className="lc-account-section"><h2>Копии данных</h2><article className="lc-account-info"><span><Icon name="check" /></span><div><strong>Контроль остается у вас</strong><p>Команда /stop отключает сообщения бота. Можно скачать данные, включая сохраненные версии при конфликте.</p></div></article><button className="lc-secondary-button" onClick={exportLocalCopy}>Скачать копию данных</button><button className="lc-account-danger" onClick={() => setResetOpen(true)}>Очистить копию на устройстве</button></section>
    <SheetPresence>{resetOpen ? <ResetDataSheet onClose={() => setResetOpen(false)} /> : null}</SheetPresence>
  </section>;
}

function LegacyCopies() {
  const { legacyCopies, importLegacy, exportLegacy, sync } = useLifeCare();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return <section className="lc-account-section lc-legacy-copies"><h2>Данные прежней версии</h2><p>На устройстве найдены старые копии без привязки к аккаунту. Они сохранены отдельно. Добавляйте только свои данные.</p><label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Подтверждаю, что эти данные принадлежат мне</label>
    {legacyCopies.map((copy, index) => <article key={index}><strong>Копия {index + 1}: {copy.cabinets.length} аптечек, {copy.medications.length} препаратов</strong><div><button className="lc-secondary-button" onClick={() => exportLegacy(index)}>Скачать</button><button className="lc-secondary-button" disabled={!confirmed || busy || !sync.remoteLoaded || sync.status === 'conflict'} onClick={() => {
      setBusy(true); setMessage(null);
      void importLegacy(index).then((error) => setMessage(error ?? 'Копия добавлена. Исходные данные сохранены отдельно.')).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Не удалось добавить копию.')).finally(() => setBusy(false));
    }}>Добавить в аккаунт</button></div></article>)}
    {!sync.remoteLoaded ? <p>Для добавления сначала загрузите данные аккаунта.</p> : null}{message ? <p role="status">{message}</p> : null}
  </section>;
}

function ResetDataSheet({ onClose }: { onClose: () => void }) {
  const { resetData, sync } = useLifeCare();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <Sheet title="Очистить копию на устройстве" onClose={() => { if (!busy) onClose(); }} footer={<button className="lc-danger-button" disabled={busy} onClick={() => {
    setBusy(true); setError(null);
    void resetData().catch((reason: unknown) => { setError(reason instanceof Error ? reason.message : 'Не удалось очистить копию.'); setBusy(false); });
  }}>{busy ? 'Очищаем...' : 'Очистить копию'}</button>}><div className="lc-delete-medication"><p className="lc-eyebrow">ВНИМАНИЕ</p><h2>Очистить это устройство?</h2><p>Данные в аккаунте останутся. Их можно загрузить снова. Старые копии прежней версии эта кнопка не удаляет.</p>{sync.pending ? <p className="lc-form-error">Есть неотправленные изменения. Сначала синхронизируйте или скачайте их: при очистке они будут удалены с устройства.</p> : null}{error ? <p className="lc-form-error" role="alert">{error}</p> : null}</div></Sheet>;
}
