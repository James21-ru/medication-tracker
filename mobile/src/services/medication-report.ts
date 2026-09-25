import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as SQLite from 'expo-sqlite';

type DoseRow = { scheduled_on: string; scheduled_time: string; medication_name: string; form: string; amount: string; strength_unit: string; quantity: number; unit: string; status: 'pending' | 'taken' | 'skipped' };
const database = SQLite.openDatabaseAsync('medication-tracker.db');

export async function createMedicationReport() {
  const end = localDateKey(new Date()); const startDate = new Date(); startDate.setDate(startDate.getDate() - 29); const start = localDateKey(startDate);
  const db = await database;
  const doses = await db.getAllAsync<DoseRow>(`SELECT e.scheduled_on, e.scheduled_time, m.name AS medication_name, m.form, m.amount, m.unit AS strength_unit, e.quantity, e.unit, e.status FROM dose_events e JOIN medications m ON m.id = e.medication_id WHERE e.scheduled_on BETWEEN ? AND ? ORDER BY e.scheduled_on DESC, e.scheduled_time DESC`, start, end);
  const html = reportHtml(start, end, doses);
  const { uri } = await Print.printToFileAsync({ html, margins: { left: 28, right: 28, top: 28, bottom: 28 } });
  return uri;
}

export async function shareMedicationReport(uri: string) {
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Отчёт LifeCare' });
  return true;
}

function reportHtml(start: string, end: string, doses: DoseRow[]) {
  const today = localDateKey(new Date()); const currentTime = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
  const dueDoses = doses.filter((dose) => dose.scheduled_on < today || (dose.scheduled_on === today && dose.scheduled_time <= currentTime));
  const taken = doses.filter((dose) => dose.status === 'taken').length; const skipped = doses.filter((dose) => dose.status === 'skipped').length; const pending = doses.filter((dose) => dose.status === 'pending').length; const dueTaken = dueDoses.filter((dose) => dose.status === 'taken').length; const adherence = dueDoses.length ? Math.round((dueTaken / dueDoses.length) * 100) : null;
  const byMedication = new Map<string, DoseRow[]>(); doses.forEach((dose) => byMedication.set(dose.medication_name, [...(byMedication.get(dose.medication_name) ?? []), dose]));
  const rows = [...byMedication.entries()].map(([name, items]) => { const itemDue = items.filter((item) => item.scheduled_on < today || (item.scheduled_on === today && item.scheduled_time <= currentTime)); const itemTaken = items.filter((item) => item.status === 'taken').length; const itemSkipped = items.filter((item) => item.status === 'skipped').length; const rate = itemDue.length ? `${Math.round((itemDue.filter((item) => item.status === 'taken').length / itemDue.length) * 100)}%` : '—'; return `<tr><td><strong>${escapeHtml(name)}</strong><br><span>${escapeHtml(`${items[0].form} ${items[0].amount} ${items[0].strength_unit}`)}</span></td><td>${items.length}</td><td>${itemDue.length}</td><td class="ok">${itemTaken}</td><td class="warn">${itemSkipped}</td><td>${rate}</td></tr>`; }).join('');
  const log = doses.slice(0, 60).map((dose) => `<tr><td>${formatDate(dose.scheduled_on)}</td><td>${dose.scheduled_time}</td><td>${escapeHtml(dose.medication_name)}</td><td>${dose.quantity} ${escapeHtml(dose.unit)}</td><td class="${dose.status === 'taken' ? 'ok' : dose.status === 'skipped' ? 'warn' : 'muted'}">${statusLabel(dose.status)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page { margin: 28px; } body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #18212B; font-size: 12px; line-height: 1.4; } h1 { font-size: 25px; margin: 0; } h2 { font-size: 16px; margin: 28px 0 10px; } .sub { color: #6E7782; margin: 5px 0 20px; } .summary { display: flex; gap: 10px; } .metric { flex: 1; background: #F1F7FC; border-radius: 12px; padding: 13px; } .metric b { display: block; font-size: 24px; color: #1679C9; } .metric span { color: #5E6874; font-size: 11px; } table { width: 100%; border-collapse: collapse; } th { color: #77818D; font-size: 10px; text-align: left; text-transform: uppercase; padding: 8px; border-bottom: 1px solid #DDE3E9; } td { padding: 10px 8px; border-bottom: 1px solid #E8EDF1; vertical-align: top; } td span, .muted { color: #77818D; } .ok { color: #16865D; } .warn { color: #B35D49; } .footer { color: #88919A; font-size: 10px; margin-top: 26px; }</style></head><body><h1>Отчёт о приёме лекарств</h1><p class="sub">Период: ${formatDate(start)} - ${formatDate(end)} · сформировано ${formatDate(end)}</p><div class="summary"><div class="metric"><b>${adherence === null ? '—' : `${adherence}%`}</b><span>соблюдение наступивших приёмов</span></div><div class="metric"><b>${dueDoses.length}</b><span>приёмов по сроку</span></div><div class="metric"><b>${taken}</b><span>приёмов отмечено</span></div><div class="metric"><b>${pending}</b><span>ожидают отметки</span></div></div><h2>По препаратам</h2><table><thead><tr><th>Препарат</th><th>План</th><th>По сроку</th><th>Принято</th><th>Пропущено</th><th>Соблюдение</th></tr></thead><tbody>${rows || '<tr><td colspan="6">За выбранный период нет данных.</td></tr>'}</tbody></table><h2>Журнал приёмов</h2><table><thead><tr><th>Дата</th><th>Время</th><th>Препарат</th><th>Количество</th><th>Статус</th></tr></thead><tbody>${log || '<tr><td colspan="5">За выбранный период нет данных.</td></tr>'}</tbody></table><p class="footer">Соблюдение считается по приёмам, время которых уже наступило. Отчёт отражает отметки пользователя и не является медицинской рекомендацией.</p></body></html>`;
}

function localDateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function formatDate(value: string) { return new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }); }
function statusLabel(status: DoseRow['status']) { return status === 'taken' ? 'Принято' : status === 'skipped' ? 'Пропущено' : 'Ожидает'; }
function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character)); }
