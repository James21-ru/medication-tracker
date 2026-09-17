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
const horizonDays = 28;
const maxScheduledNotifications = 60;

export function configureReminders() {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
}

function hasPermission(status: Notifications.NotificationPermissionsStatus) {
  if (Platform.OS !== 'ios') return status.granted;
  const authorization = status.ios?.status;
  return authorization === Notifications.IosAuthorizationStatus.AUTHORIZED
    || authorization === Notifications.IosAuthorizationStatus.PROVISIONAL
    || authorization === Notifications.IosAuthorizationStatus.EPHEMERAL;
}

export async function enableReminders() {
  if (Platform.OS === 'web') return false;
  let permission = await Notifications.getPermissionsAsync();
  if (!hasPermission(permission)) permission = await Notifications.requestPermissionsAsync();
  if (!hasPermission(permission)) return false;
  await syncScheduledReminders();
  return true;
}

export async function syncScheduledReminders() {
  if (Platform.OS === 'web') return false;
  if (!hasPermission(await Notifications.getPermissionsAsync())) return false;

  const db = await database;
  const stored = await db.getAllAsync<{ notification_id: string }>('SELECT notification_id FROM reminder_notifications');
  await Promise.all(stored.map(({ notification_id }) => Notifications.cancelScheduledNotificationAsync(notification_id).catch(() => undefined)));
  await db.execAsync('DELETE FROM reminder_notifications');

  const schedules = await db.getAllAsync<StoredSchedule>(`SELECT s.id, s.medication_id, m.name AS medication_name, m.form, m.amount, m.unit AS strength_unit, s.kind, s.weekdays_json, s.time, s.dose_quantity, s.dose_unit, s.start_on, s.end_on, s.interval_days, s.cycle_on_days, s.cycle_off_days FROM schedules s JOIN medications m ON m.id = s.medication_id WHERE s.active = 1`);
  let count = 0;
  for (const schedule of schedules) {
    for (const trigger of triggersFor(schedule)) {
      if (count >= maxScheduledNotifications) return true;
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: `Пора принять: ${schedule.medication_name}`,
          body: `${schedule.dose_quantity} ${schedule.dose_unit} · ${schedule.form} ${schedule.amount} ${schedule.strength_unit}`,
          data: { url: '/', medicationId: schedule.medication_id, scheduleId: schedule.id },
          sound: true,
        },
        trigger,
      });
      await db.runAsync('INSERT INTO reminder_notifications (schedule_id, notification_id) VALUES (?, ?)', schedule.id, notificationId);
      count += 1;
    }
  }
  return true;
}

function triggersFor(schedule: StoredSchedule): Notifications.SchedulableNotificationTriggerInput[] {
  const [hour, minute] = schedule.time.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return [];
  const today = localDateKey(new Date());
  const weekdays = safeWeekdays(schedule.weekdays_json);
  const hasStarted = schedule.start_on <= today;
  if (!schedule.end_on && hasStarted && schedule.kind === 'daily') return [dailyTrigger(hour, minute)];
  if (!schedule.end_on && hasStarted && (schedule.kind === 'weekdays' || schedule.kind === 'custom')) return weekdays.map((weekday) => weeklyTrigger(weekday, hour, minute));
  return datedTriggers(schedule, hour, minute, weekdays);
}

function dailyTrigger(hour: number, minute: number): Notifications.SchedulableNotificationTriggerInput {
  return Platform.OS === 'ios'
    ? { type: Notifications.SchedulableTriggerInputTypes.CALENDAR, hour, minute, repeats: true }
    : { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute };
}

function weeklyTrigger(weekday: number, hour: number, minute: number): Notifications.SchedulableNotificationTriggerInput {
  const notificationWeekday = weekday + 1;
  return Platform.OS === 'ios'
    ? { type: Notifications.SchedulableTriggerInputTypes.CALENDAR, weekday: notificationWeekday, hour, minute, repeats: true }
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
