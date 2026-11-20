import { useState } from 'react';
import { useLifeCare } from './state/lifecare-store';
import { Icon } from './ui/icons';
import { Sheet } from './ui/sheet';

export function AccountScreen() {
  const { data } = useLifeCare();
  const [resetOpen, setResetOpen] = useState(false);
  const activeSchedules = data.schedules.filter((schedule) => schedule.active).length;
  return <section className="lc-account-screen"><div className="lc-section-heading"><div><p>ПРОСТРАНСТВО ПОЛЬЗОВАТЕЛЯ</p><h1>Аккаунт</h1></div></div><article className="lc-account-hero"><span><Icon name="person" /></span><div><h2>LifeCare на этом устройстве</h2><p>Ваши данные не требуют регистрации и остаются в браузере этого устройства.</p></div></article><section className="lc-account-section"><h2>Ваши данные</h2><div className="lc-account-list"><div><span><Icon name="case" /></span><p><strong>{data.cabinets.length}</strong><small>аптечек</small></p></div><div><span><Icon name="pill" /></span><p><strong>{data.medications.length}</strong><small>препаратов</small></p></div><div><span><Icon name="calendar" /></span><p><strong>{activeSchedules}</strong><small>графиков</small></p></div></div></section><section className="lc-account-section"><h2>Напоминания</h2><article className="lc-account-info"><span><Icon name="calendar" /></span><div><strong>План приёмов</strong><p>Приёмы отображаются в приложении. Отправка уведомлений в Telegram будет подключена после настройки чат-бота.</p></div></article></section><section className="lc-account-section"><h2>Конфиденциальность</h2><article className="lc-account-info"><span><Icon name="check" /></span><div><strong>Локальное хранение</strong><p>Препараты, упаковки, отметки и отчёты не отправляются на внешний сервер.</p></div></article><button className="lc-account-danger" onClick={() => setResetOpen(true)}>Стереть данные с устройства</button></section>{resetOpen ? <ResetDataSheet onClose={() => setResetOpen(false)} /> : null}</section>;
}

function ResetDataSheet({ onClose }: { onClose: () => void }) {
  const { resetData } = useLifeCare();
  return <Sheet title="Стереть все данные" onClose={onClose} footer={<button className="lc-danger-button" onClick={resetData}>Стереть с устройства</button>}><div className="lc-delete-medication"><p className="lc-eyebrow">ВНИМАНИЕ</p><h2>Удалить все данные?</h2><p>Будут удалены аптечки, препараты, упаковки, графики и история приёмов с этого устройства. Восстановить их нельзя.</p></div></Sheet>;
}
