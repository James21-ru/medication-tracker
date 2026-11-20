import type { LifeCareData } from './domain/models';

export type ReportStats = { planned: number; taken: number; skipped: number; overdue: number; adherence: number; dailyTaken: number[] };

const periodTitle = (period: 'week' | 'month') => period === 'week' ? 'за последние 7 дней' : 'за последние 30 дней';
const text = (context: CanvasRenderingContext2D, value: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
  const words = value.split(' ');
  let line = '';
  let cursor = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth && line) { context.fillText(line, x, cursor); line = word; cursor += lineHeight; }
    else line = next;
  }
  if (line) context.fillText(line, x, cursor);
  return cursor;
};

const roundRect = (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, color: string) => {
  context.fillStyle = color;
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
};

export async function downloadMedicationReport(data: LifeCareData, period: 'week' | 'month', dates: string[], stats: ReportStats) {
  const { jsPDF } = await import('jspdf');
  const canvas = document.createElement('canvas');
  canvas.width = 1240;
  canvas.height = 1754;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Не удалось подготовить отчёт.');
  context.fillStyle = '#F6F7F8';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#15181D';
  context.font = '700 48px -apple-system, BlinkMacSystemFont, Arial, sans-serif';
  context.fillText('LifeCare', 88, 110);
  context.fillStyle = '#737985';
  context.font = '400 25px -apple-system, BlinkMacSystemFont, Arial, sans-serif';
  context.fillText('Персональный отчёт о приёмах', 88, 151);
  context.fillStyle = '#1479ED';
  context.font = '700 18px -apple-system, BlinkMacSystemFont, Arial, sans-serif';
  context.fillText('СОБЛЮДЕНИЕ ГРАФИКА', 88, 245);
  context.fillStyle = '#15181D';
  context.font = '700 62px -apple-system, BlinkMacSystemFont, Arial, sans-serif';
  context.fillText(`${stats.adherence}%`, 88, 316);
  context.fillStyle = '#737985';
  context.font = '400 25px -apple-system, BlinkMacSystemFont, Arial, sans-serif';
  context.fillText(`${stats.taken} из ${stats.planned} приёмов отмечено ${periodTitle(period)}`, 88, 360);
  roundRect(context, 88, 404, 1064, 20, 10, '#E1E5EA');
  roundRect(context, 88, 404, Math.max(0, 1064 * stats.adherence / 100), 20, 10, '#1479ED');
  const boxes = [{ label: 'Принято', value: stats.taken, color: '#E0F7EF', ink: '#078263' }, { label: 'Без отметки', value: stats.overdue, color: '#FFF2D7', ink: '#A16909' }, { label: 'Пропущено', value: stats.skipped, color: '#FDE9E9', ink: '#BD4646' }];
  boxes.forEach((box, index) => { const x = 88 + index * 360; roundRect(context, x, 476, 344, 172, 26, '#FFFFFF'); roundRect(context, x + 26, 501, 42, 42, 13, box.color); context.fillStyle = box.ink; context.font = '700 23px -apple-system, BlinkMacSystemFont, Arial, sans-serif'; context.fillText(String(box.value), x + 26, 603); context.fillStyle = '#737985'; context.font = '400 20px -apple-system, BlinkMacSystemFont, Arial, sans-serif'; context.fillText(box.label, x + 26, 628); });
  roundRect(context, 88, 696, 1064, 370, 28, '#FFFFFF');
  context.fillStyle = '#15181D'; context.font = '700 30px -apple-system, BlinkMacSystemFont, Arial, sans-serif'; context.fillText('Динамика отмеченных приёмов', 120, 754);
  const bars = stats.dailyTaken.slice(-7); const max = Math.max(1, ...bars);
  bars.forEach((value, index) => { const x = 130 + index * 140; const height = Math.max(12, (value / max) * 200); roundRect(context, x, 990 - height, 78, height, 16, '#1479ED'); context.fillStyle = '#737985'; context.font = '600 18px -apple-system, BlinkMacSystemFont, Arial, sans-serif'; context.fillText(String(index + 1), x + 28, 1028); });
  const records = data.doseRecords.filter((record) => dates.includes(record.date));
  const medicationRows = data.medications.map((medication) => ({ name: medication.name, form: medication.form, taken: records.filter((record) => record.medicationId === medication.id && record.status === 'taken').length, skipped: records.filter((record) => record.medicationId === medication.id && record.status === 'skipped').length })).filter((row) => row.taken || row.skipped).slice(0, 5);
  let y = 1135;
  context.fillStyle = '#15181D'; context.font = '700 30px -apple-system, BlinkMacSystemFont, Arial, sans-serif'; context.fillText('Препараты', 88, y); y += 45;
  if (!medicationRows.length) { context.fillStyle = '#737985'; context.font = '400 22px -apple-system, BlinkMacSystemFont, Arial, sans-serif'; context.fillText('В выбранном периоде нет отметок о приёмах.', 88, y + 20); }
  medicationRows.forEach((row) => { roundRect(context, 88, y, 1064, 116, 20, '#FFFFFF'); context.fillStyle = '#15181D'; context.font = '700 24px -apple-system, BlinkMacSystemFont, Arial, sans-serif'; const last = text(context, row.name, 116, y + 40, 650, 28); context.fillStyle = '#737985'; context.font = '400 19px -apple-system, BlinkMacSystemFont, Arial, sans-serif'; context.fillText(row.form, 116, last + 27); context.fillStyle = '#078263'; context.font = '700 22px -apple-system, BlinkMacSystemFont, Arial, sans-serif'; context.fillText(`${row.taken} принято`, 850, y + 45); context.fillStyle = '#A16909'; context.font = '600 18px -apple-system, BlinkMacSystemFont, Arial, sans-serif'; context.fillText(`${row.skipped} пропущено`, 850, y + 77); y += 134; });
  context.fillStyle = '#737985'; context.font = '400 17px -apple-system, BlinkMacSystemFont, Arial, sans-serif'; context.fillText(`Создано ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(new Date())}. Данные хранятся только на вашем устройстве.`, 88, 1662);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 595.28, 841.89);
  const blob = pdf.output('blob');
  const file = new File([blob], `lifecare-report-${period}.pdf`, { type: 'application/pdf' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Отчёт LifeCare' }); return; }
  pdf.save(file.name);
}
