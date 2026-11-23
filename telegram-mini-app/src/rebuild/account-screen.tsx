import { useState } from 'react';
import { useLifeCare } from './state/lifecare-store';
import { Icon } from './ui/icons';
import { Sheet } from './ui/sheet';

export function AccountScreen() {
  const { data } = useLifeCare();
  const [resetOpen, setResetOpen] = useState(false);
  const activeSchedules = data.schedules.filter((schedule) => schedule.active).length;
  return <section className="lc-account-screen"><div className="lc-section-heading"><div><p>ПРОСТРАНСТВО ПОЛЬЗОВАТЕЛЯ</p><h1>Аккаунт</h1></div></div><article className="lc-account-hero"><span><Icon name="person" /></span><div><h2>LifeCare в Telegram</h2><p>Данные остаются на устройстве и синхронизируются с ботом только для напоминаний и отметок приёма.</p></div></article><section className="lc-account-section"><h2>Ваши данные</h2><div className="lc-account-list"><div><span><Icon name="case" /></span><p><strong>{data.cabinets.length}</strong><small>аптечек</small></p></div><div><span><Icon name="pill" /></span><p><strong>{data.medications.length}</strong><small>препаратов</small></p></div><div><span><Icon name="calendar" /></span><p><strong>{activeSchedules}</strong><small>графиков</small></p></div></div></section><section className="lc-account-section"><h2>Напоминания в Telegram</h2><article className="lc-account-info"><span><Icon name="calendar" /></span><div><strong>Подключите бота командой /start</strong><p>В назначенное время придёт сообщение с кнопками «Принять» и «Отложить». Если не ответить, бот напомнит ещё раз через 20 минут.</p></div></article></section><section className="lc-account-section"><h2>Конфиденциальность</h2><article className="lc-account-info"><span><Icon name="check" /></span><div><strong>Контроль остаётся у вас</strong><p>Команда /stop сразу отключает сообщения бота. Основная копия данных остаётся в мини-приложении.</p></div></article><button className="lc-account-danger" onClick={() => setResetOpen(true)}>Стереть данные с устройства</button></section>{resetOpen ? <ResetDataSheet onClose={() => setResetOpen(false)} /> : null}</section>;
}

function ResetDataSheet({ onClose }: { onClose: () => void }) {
  const { resetData } = useLifeCare();
  return <Sheet title="Стереть все данные" onClose={onClose} footer={<button className="lc-danger-button" onClick={resetData}>Стереть с устройства</button>}><div className="lc-delete-medication"><p className="lc-eyebrow">ВНИМАНИЕ</p><h2>Удалить все данные?</h2><p>Будут удалены аптечки, препараты, упаковки, графики и история приёмов с этого устройства. Восстановить их нельзя.</p></div></Sheet>;
}
