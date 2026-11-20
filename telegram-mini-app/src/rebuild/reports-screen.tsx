import { useMemo, useState } from 'react';
import type { MedicationSchedule } from './domain/models';
import { useLifeCare } from './state/lifecare-store';
import { EmptyState } from './ui/empty-state';
import { Icon } from './ui/icons';

type Period = 'week' | 'month';
const toKey = (date: Date) => new Intl.DateTimeFormat('en-CA').format(date);
const daysBetween = (from: string, to: string) => Math.floor((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000);

function occursOn(schedule: MedicationSchedule, date: string) {
  if (!schedule.active || schedule.frequency === 'as-needed' || date < schedule.startOn || (schedule.endOn && date > schedule.endOn)) return false;
  if (schedule.frequency === 'daily') return true;
  if (schedule.frequency === 'weekdays') return schedule.weekdays.includes(new Date(`${date}T12:00:00`).getDay());
  const elapsed = daysBetween(schedule.startOn, date);
  if (schedule.frequency === 'interval') return elapsed % Math.max(2, schedule.intervalDays ?? 2) === 0;
  return elapsed % (Math.max(1, schedule.activeDays ?? 1) + Math.max(1, schedule.restDays ?? 1)) < Math.max(1, schedule.activeDays ?? 1);
}

function rangeFor(period: Period) {
  const end = new Date();
  const count = period === 'week' ? 7 : 30;
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(end);
    day.setDate(end.getDate() - (count - 1 - index));
    return toKey(day);
  });
}

export function ReportsScreen() {
  const { data } = useLifeCare();
  const [period, setPeriod] = useState<Period>('week');
  const dates = useMemo(() => rangeFor(period), [period]);
  const stats = useMemo(() => {
    const planned = dates.reduce((total, date) => total + data.schedules.filter((schedule) => occursOn(schedule, date)).reduce((count, schedule) => count + schedule.times.length, 0), 0);
    const entries = data.doseRecords.filter((record) => dates.includes(record.date));
    const taken = entries.filter((record) => record.status === 'taken').length;
    const skipped = entries.filter((record) => record.status === 'skipped').length;
    const completed = taken + skipped;
    const adherence = planned ? Math.round((taken / planned) * 100) : 0;
    const overdue = Math.max(0, planned - completed);
    const dailyTaken = dates.map((date) => entries.filter((record) => record.date === date && record.status === 'taken').length);
    return { planned, taken, skipped, overdue, adherence, dailyTaken };
  }, [data, dates]);

  if (!data.schedules.length && !data.doseRecords.length) return <EmptyState icon="chart" title="Пока нет данных для отчёта" description="Когда появятся приёмы, здесь отобразится статистика за неделю и месяц." />;
  const labels = period === 'week' ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] : dates.slice(-7).map((date) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric' }).format(new Date(`${date}T12:00:00`)));
  const chart = period === 'week' ? stats.dailyTaken : stats.dailyTaken.slice(-7);
  const chartMax = Math.max(1, ...chart);
  return <section className="lc-reports-screen"><div className="lc-section-heading"><div><p>ЗДОРОВЬЕ В ДИНАМИКЕ</p><h1>Отчёты</h1></div></div><p className="lc-reports-lead">Статистика формируется только из отметок о приёмах.</p><article className="lc-adherence-card"><div><p>СОБЛЮДЕНИЕ ГРАФИКА</p><h2>{stats.adherence}%</h2><span>{stats.taken} из {stats.planned} приёмов отмечено</span></div><div className="lc-progress-ring" style={{ '--progress': `${stats.adherence * 3.6}deg` } as React.CSSProperties}><strong>{stats.adherence}%</strong></div></article><div className="lc-period-switch" role="group" aria-label="Период отчёта"><button className={period === 'week' ? 'is-active' : ''} onClick={() => setPeriod('week')}>Неделя</button><button className={period === 'month' ? 'is-active' : ''} onClick={() => setPeriod('month')}>Месяц</button></div><article className="lc-chart-card"><div><span>Регулярность</span><strong>{stats.taken} из {stats.planned} приёмов</strong></div><div className="lc-bars">{chart.map((value, index) => <div key={`${labels[index]}-${index}`}><i><b style={{ height: `${Math.max(8, (value / chartMax) * 100)}%` }} /></i><small>{labels[index]}</small></div>)}</div></article><div className="lc-report-stats"><Stat icon="check" value={stats.taken} label="Вовремя" /><Stat icon="calendar" value={stats.overdue} label="Без отметки" /><Stat icon="close" value={stats.skipped} label="Пропущено" /></div><article className="lc-report-note"><span><Icon name="chart" /></span><div><h2>{stats.adherence >= 80 ? 'Хороший ритм' : stats.adherence > 0 ? 'Есть что улучшить' : 'Начните отмечать приёмы'}</h2><p>{stats.adherence >= 80 ? 'Вы регулярно отмечаете приёмы. Продолжайте в том же ритме.' : 'Отмечайте приёмы в разделе «Приёмы», чтобы видеть динамику.'}</p></div></article></section>;
}

function Stat({ icon, value, label }: { icon: 'check' | 'calendar' | 'close'; value: number; label: string }) {
  return <article><span className={`lc-report-stats__icon lc-report-stats__icon--${icon}`}><Icon name={icon} /></span><strong>{value}</strong><small>{label}</small></article>;
}
