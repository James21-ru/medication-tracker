import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

type StoredSchedule = {
  id: string;
  medication_id: string;
  medication_name: string;
  form: string;
  amount: string;
  strength_unit: string;
  kind: 'daily' | 'weekdays' | 'custom' | 'every-n-days' | 'cycle';
  weekdays_json: string;
  time: string;
  dose_quantity: number;
  dose_unit: string;
  start_on: string;
  end_on: string | null;
  interval_days: number;
  cycle_on_days: number;
  cycle_off_days: number;
};

const database = SQLite.openDatabaseAsync('medication-tracker.db');
// iOS keeps only a limited number of pending local notifications. We reserve a
// small buffer instead of relying on the platform to silently discard a dose.
// Repeating daily/weekly triggers do not consume one slot per day.
const horizonDays = 180;
const maxScheduledNotifications = 60;

export type NotificationSettings = { doseReminders: boolean; repeatedReminders: boolean; timeZoneAware: boolean };
export type SystemNotificationPermission = 'granted' | 'denied' | 'not-determined' | 'unavailable';
export type ReminderSyncResult = {
  permissionGranted: boolean;
  scheduledMain: number;
  omittedMain: number;
  scheduledRepeated: number;
  omittedRepeated: number;
  coverageEndsOn: string | null;
  timeZone: string | null;
};
const defaultSettings: NotificationSettings = { doseReminders: false, repeatedReminders: false, timeZoneAware: true };

const emptySyncResult = (permissionGranted: boolean): ReminderSyncResult => ({
  permissionGranted,
  scheduledMain: 0,
  omittedMain: 0,
  scheduledRepeated: 0,
  omittedRepeated: 0,
  coverageEndsOn: null,
  timeZone: currentTimeZone(),
});

export function configureReminders() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
}

function hasPermission(status: Notifications.NotificationPermissionsStatus) {
  if (status.granted) return true;
  if (Platform.OS !== 'ios') return status.granted;
  const authorization = status.ios?.status;
  return authorization === Notifications.IosAuthorizationStatus.AUTHORIZED
    || authorization === Notifications.IosAuthorizationStatus.PROVISIONAL
    || authorization === Notifications.IosAuthorizationStatus.EPHEMERAL;
}

export async function getSystemNotificationPermission(): Promise<SystemNotificationPermission> {
  if (Platform.OS === 'web') return 'unavailable';
  const status = await Notifications.getPermissionsAsync();
  if (hasPermission(status)) return 'granted';
  if (Platform.OS === 'ios' && status.ios?.status === Notifications.IosAuthorizationStatus.NOT_DETERMINED) return 'not-determined';
  return status.canAskAgain ? 'not-determined' : 'denied';
}

export async function enableReminders() {
  if (Platform.OS === 'web') return false;
  let permission = await Notifications.getPermissionsAsync();
  if (!hasPermission(permission)) permission = await Notifications.requestPermissionsAsync();
  if (!hasPermission(permission)) return false;
  await syncScheduledReminders();
  return true;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const db = await database; await ensureNotificationSettings(db);
  const rows = await db.getAllAsync<{ key: keyof NotificationSettings; value: string }>('SELECT key, value FROM notification_settings');
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return { doseReminders: values.get('doseReminders') === 'true', repeatedReminders: values.get('repeatedReminders') === 'true', timeZoneAware: values.get('timeZoneAware') !== 'false' };
}

export async function saveNotificationSettings(next: NotificationSettings): Promise<ReminderSyncResult> {
  const db = await database; await ensureNotificationSettings(db);
  await db.withTransactionAsync(async () => { for (const [key, value] of Object.entries(next)) await db.runAsync('INSERT OR REPLACE INTO notification_settings (key, value) VALUES (?, ?)', key, String(value)); });
  return syncScheduledReminders();
}

export async function syncScheduledReminders(): Promise<ReminderSyncResult> {
  if (Platform.OS === 'web') return emptySyncResult(false);
  if (!hasPermission(await Notifications.getPermissionsAsync())) return emptySyncResult(false);

  const db = await database;
  const settings = await getNotificationSettings();
  const stored = await db.getAllAsync<{ notification_id: string }>('SELECT notification_id FROM reminder_notifications');
  await Promise.all(stored.map(({ notification_id }) => Notifications.cancelScheduledNotificationAsync(notification_id).catch(() => undefined)));
  await db.execAsync('DELETE FROM reminder_notifications');
  if (!settings.doseReminders) return emptySyncResult(true);

  const schedules = await db.getAllAsync<StoredSchedule>(`SELECT s.id, s.medication_id, m.name AS medication_name, m.form, m.amount, m.unit AS strength_unit, s.kind, s.weekdays_json, s.time, s.dose_quantity, s.dose_unit, s.start_on, s.end_on, s.interval_days, s.cycle_on_days, s.cycle_off_days FROM schedules s JOIN medications m ON m.id = s.medication_id WHERE s.active = 1`);
  const fixedTimeZone = settings.timeZoneAware ? undefined : currentTimeZone() ?? undefined;
  const mainJobs = schedules.flatMap((schedule) => triggersFor(schedule, 0, fixedTimeZone).map((trigger) => ({ schedule, trigger, kind: 'main' as const })));
  const repeatedJobs = settings.repeatedReminders
    ? (await Promise.all(schedules.map(async (schedule) => (await repeatedTriggersFor(db, schedule)).map((trigger) => ({ schedule, trigger, kind: 'repeat' as const })) ))).flat()
    : [];

  // Main dose reminders always win. Dated reminders are sorted across every
  // medicine, so one long course cannot consume all of the available slots.
  const orderedMain = orderJobs(mainJobs);
  const orderedRepeated = orderJobs(repeatedJobs);
  const scheduledMain = orderedMain.slice(0, maxScheduledNotifications);
  const remainingCapacity = Math.max(0, maxScheduledNotifications - scheduledMain.length);
  const scheduledRepeated = orderedRepeated.slice(0, remainingCapacity);

  for (const job of [...scheduledMain, ...scheduledRepeated]) {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: job.kind === 'main'
        ? {
            title: `Пора принять: ${job.schedule.medication_name}`,
            body: `${job.schedule.dose_quantity} ${job.schedule.dose_unit} · ${job.schedule.form} ${job.schedule.amount} ${job.schedule.strength_unit}`,
            data: { url: '/', medicationId: job.schedule.medication_id, scheduleId: job.schedule.id },
            sound: true,
          }
        : {
            title: `Повторное напоминание: ${job.schedule.medication_name}`,
            body: `Вы уже отметили приём? ${job.schedule.dose_quantity} ${job.schedule.dose_unit}`,
            data: { url: '/', medicationId: job.schedule.medication_id, scheduleId: job.schedule.id, repeat: true },
            sound: true,
          },
      trigger: job.trigger,
    });
    await db.runAsync('INSERT INTO reminder_notifications (schedule_id, notification_id) VALUES (?, ?)', job.schedule.id, notificationId);
  }

  const datedJobs = [...scheduledMain, ...scheduledRepeated]
    .map((job) => notificationDate(job.trigger))
    .filter((date): date is Date => date !== null)
    .sort((left, right) => left.getTime() - right.getTime());
  const lastDatedJob = datedJobs.at(-1);
  return {
    permissionGranted: true,
    scheduledMain: scheduledMain.length,
    omittedMain: Math.max(0, orderedMain.length - scheduledMain.length),
    scheduledRepeated: scheduledRepeated.length,
    omittedRepeated: Math.max(0, orderedRepeated.length - scheduledRepeated.length),
    coverageEndsOn: lastDatedJob ? localDateKey(lastDatedJob) : null,
    timeZone: currentTimeZone(),
  };
}

type ReminderJob = { schedule: StoredSchedule; trigger: Notifications.SchedulableNotificationTriggerInput; kind: 'main' | 'repeat' };

function orderJobs<T extends ReminderJob>(jobs: T[]) {
  return [...jobs].sort((left, right) => {
    const leftDate = notificationDate(left.trigger);
    const rightDate = notificationDate(right.trigger);
    // Repeating triggers provide durable coverage and should be reserved first.
    if (!leftDate && rightDate) return -1;
    if (leftDate && !rightDate) return 1;
    return (leftDate?.getTime() ?? 0) - (rightDate?.getTime() ?? 0);
  });
}

function notificationDate(trigger: Notifications.SchedulableNotificationTriggerInput) {
  return trigger.type === Notifications.SchedulableTriggerInputTypes.DATE && trigger.date instanceof Date ? trigger.date : null;
}

function triggersFor(schedule: StoredSchedule, offsetMinutes = 0, timeZone?: string): Notifications.SchedulableNotificationTriggerInput[] {
  const [hour, minute] = schedule.time.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return [];
  const [reminderHour, reminderMinute] = addMinutes(hour, minute, offsetMinutes);
  const today = localDateKey(new Date());
  const weekdays = safeWeekdays(schedule.weekdays_json);
  const hasStarted = schedule.start_on <= today;
  if (!schedule.end_on && hasStarted && schedule.kind === 'daily') return [dailyTrigger(reminderHour, reminderMinute, timeZone)];
  if (!schedule.end_on && hasStarted && (schedule.kind === 'weekdays' || schedule.kind === 'custom')) return weekdays.map((weekday) => weeklyTrigger(weekday, reminderHour, reminderMinute, timeZone));
  return datedTriggers(schedule, reminderHour, reminderMinute, weekdays);
}

async function repeatedTriggersFor(db: SQLite.SQLiteDatabase, schedule: StoredSchedule) {
  const [hour, minute] = schedule.time.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return [];
  const [reminderHour, reminderMinute] = addMinutes(hour, minute, 20);
  const triggers = datedTriggers(schedule, reminderHour, reminderMinute, safeWeekdays(schedule.weekdays_json));
  const today = localDateKey(new Date());
  const todayEvent = await db.getFirstAsync<{ status: 'pending' | 'taken' | 'skipped' }>('SELECT status FROM dose_events WHERE schedule_id = ? AND scheduled_on = ?', schedule.id, today);
  if (!todayEvent || todayEvent.status === 'pending') return triggers;
  return triggers.filter((trigger) => trigger.type !== Notifications.SchedulableTriggerInputTypes.DATE || !(trigger.date instanceof Date) || localDateKey(trigger.date) !== today);
}

function dailyTrigger(hour: number, minute: number, timeZone?: string): Notifications.SchedulableNotificationTriggerInput {
  return Platform.OS === 'ios'
    ? { type: Notifications.SchedulableTriggerInputTypes.CALENDAR, hour, minute, repeats: true, ...(timeZone ? { timezone: timeZone } : {}) }
    : { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute };
}

function weeklyTrigger(weekday: number, hour: number, minute: number, timeZone?: string): Notifications.SchedulableNotificationTriggerInput {
  const notificationWeekday = weekday + 1;
  return Platform.OS === 'ios'
    ? { type: Notifications.SchedulableTriggerInputTypes.CALENDAR, weekday: notificationWeekday, hour, minute, repeats: true, ...(timeZone ? { timezone: timeZone } : {}) }
    : { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: notificationWeekday, hour, minute };
}

function datedTriggers(schedule: StoredSchedule, hour: number, minute: number, weekdays: number[]) {
  const now = new Date();
  const start = parseDate(schedule.start_on);
  if (!start) return [];
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + horizonDays);
  const end = schedule.end_on ? parseDate(schedule.end_on) : horizon;
  if (!end) return [];
  const until = end < horizon ? end : horizon;
  const firstDay = start > new Date(now.getFullYear(), now.getMonth(), now.getDate()) ? start : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const result: Notifications.SchedulableNotificationTriggerInput[] = [];
  for (let day = firstDay; day <= until; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    if (!isScheduledOn(schedule, day, weekdays)) continue;
    const date = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
    if (date > now) result.push({ type: Notifications.SchedulableTriggerInputTypes.DATE, date });
  }
  return result;
}

function isScheduledOn(schedule: StoredSchedule, day: Date, weekdays: number[]) {
  const start = parseDate(schedule.start_on);
  if (!start) return false;
  const elapsedDays = Math.round((day.getTime() - start.getTime()) / 86_400_000);
  if (elapsedDays < 0) return false;
  if (schedule.kind === 'every-n-days') return schedule.interval_days > 0 && elapsedDays % schedule.interval_days === 0;
  if (schedule.kind === 'cycle') {
    const length = schedule.cycle_on_days + schedule.cycle_off_days;
    return length > 0 && elapsedDays % length < schedule.cycle_on_days;
  }
  return schedule.kind === 'daily' || weekdays.includes(day.getDay());
}

function safeWeekdays(value: string) {
  try { const days = JSON.parse(value); return Array.isArray(days) ? days.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6) : []; } catch { return []; }
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return localDateKey(date) === value ? date : null;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function currentTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}

function addMinutes(hour: number, minute: number, offset: number) { const total = hour * 60 + minute + offset; return [Math.floor((total % 1_440) / 60), total % 60] as const; }
async function ensureNotificationSettings(db: SQLite.SQLiteDatabase) { await db.execAsync('CREATE TABLE IF NOT EXISTS notification_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)'); for (const [key, value] of Object.entries(defaultSettings)) await db.runAsync('INSERT OR IGNORE INTO notification_settings (key, value) VALUES (?, ?)', key, String(value)); }
