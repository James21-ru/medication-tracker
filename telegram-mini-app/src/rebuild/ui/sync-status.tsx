import { useState } from 'react';
import { useLifeCare } from '../state/lifecare-store';
import { Sheet } from './sheet';
import { SheetPresence } from './sheet-presence';

export function SyncStatus() {
  const { sync, retrySync, exportLocalCopy, acceptServerCopy } = useLifeCare();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = sync.status === 'conflict' ? 'Нужно сравнить изменения' : sync.status === 'syncing' || sync.status === 'loading' ? 'Синхронизация...' : sync.status === 'error' ? 'Не удалось сохранить копию' : sync.status === 'offline' ? 'Нет связи с сервером' : sync.pending ? 'Есть неотправленные изменения' : 'Синхронизировано';
  return <>
    <aside className={`lc-sync-status lc-sync-status--${sync.status}`} role="status" aria-live="polite">
      <div><strong>{title}</strong>{sync.error ? <p>{sync.error}</p> : sync.pending ? <p>Изменения сохранены на устройстве и ожидают отправки.</p> : null}</div>
      {sync.status === 'conflict' ? <button onClick={() => setOpen(true)}>Сравнить</button> : sync.status !== 'loading' && sync.status !== 'syncing' ? <button onClick={retrySync}>{sync.status === 'ready' ? 'Обновить' : 'Повторить'}</button> : null}
    </aside>
    <SheetPresence>{open ? <Sheet title="Изменения на двух устройствах" onClose={() => { if (!busy) setOpen(false); }} footer={<button className="lc-primary-button" disabled={busy} onClick={() => {
      setBusy(true); setError(null);
      void acceptServerCopy().then(() => setOpen(false)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Не удалось сохранить локальную копию.')).finally(() => setBusy(false));
    }}>{busy ? 'Сохраняем копию...' : 'Использовать данные аккаунта'}</button>}>
      <div className="lc-sync-details"><h2>Автоматическое объединение остановлено</h2><p>Одни и те же записи изменены одновременно. Текущие данные на устройстве сохранены. Можно скачать обе версии для сравнения.</p>
        <ul>{sync.conflicts.slice(0, 8).map((item, index) => <li key={`${item.id}:${item.field}:${index}`}>{item.reason}</li>)}</ul>
        <button className="lc-secondary-button" onClick={exportLocalCopy}>Скачать копии для сравнения</button>
        <p>Кнопка ниже загрузит данные аккаунта. Текущая локальная версия останется в резервной копии на этом устройстве и будет доступна для скачивания в разделе «Аккаунт».</p>
        {error ? <p className="lc-form-error" role="alert">{error}</p> : null}
      </div>
    </Sheet> : null}</SheetPresence>
  </>;
}
