import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NotificationSettings, ReminderSyncResult, SystemNotificationPermission } from '@/services/reminders';

type Props = {
  visible: boolean;
  settings: NotificationSettings;
  permission: SystemNotificationPermission;
  syncResult: ReminderSyncResult | null;
  onClose: () => void;
  onChange: (patch: Partial<NotificationSettings>) => void;
};

export function NotificationSettingsSheet({ visible, settings, permission, syncResult, onClose, onChange }: Props) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Уведомления</Text>
          <Pressable accessibilityLabel="Закрыть параметры уведомлений" hitSlop={10} onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.iconCircle}><Text style={styles.icon}>⌁</Text></View>
          <Text style={styles.title}>Параметры уведомлений</Text>
          <Text style={styles.description}>Настройте, как LifeCare будет напоминать о запланированных приёмах.</Text>

          <PermissionStatus permission={permission} doseRemindersEnabled={settings.doseReminders} />

          <View style={styles.group}>
            <SettingRow label="Напоминание о дозах" value={settings.doseReminders} onValueChange={(value) => onChange({ doseReminders: value })} />
            <SettingRow label="Повторные напоминания" value={settings.repeatedReminders} onValueChange={(value) => onChange({ repeatedReminders: value })} />
            <SettingRow label="Смена часового пояса" value={settings.timeZoneAware} onValueChange={(value) => onChange({ timeZoneAware: value })} />
          </View>

          <Text style={styles.hint}>{settings.repeatedReminders && settings.doseReminders ? 'Повторное уведомление придёт через 20 минут. Если вы отметите приём в приложении, расписание уведомлений обновится.' : 'Напоминания используют время, указанное в графике препарата.'}</Text>
          {settings.doseReminders ? <Text style={styles.timeZoneHint}>{settings.timeZoneAware
            ? `В поездках ежедневные напоминания ориентируются на местное время устройства${syncResult?.timeZone ? ` (${syncResult.timeZone})` : ''}.`
            : `Ежедневные напоминания закреплены за текущим часовым поясом${syncResult?.timeZone ? ` (${syncResult.timeZone})` : ''}.`}</Text> : null}
          {syncResult?.coverageEndsOn && syncResult.omittedMain === 0 && syncResult.omittedRepeated === 0 ? <View style={styles.coverageNotice}>
            <Text style={styles.coverageTitle}>План напоминаний подготовлен</Text>
            <Text style={styles.coverageText}>Разовые напоминания запланированы до {formatDate(syncResult.coverageEndsOn)}. Открывайте LifeCare время от времени — приложение продлит план для длинных курсов.</Text>
          </View> : null}
          {syncResult && (syncResult.omittedMain > 0 || syncResult.omittedRepeated > 0) ? <View style={styles.limitNotice}>
            <Text style={styles.limitTitle}>Часть уведомлений ждёт обновления</Text>
            <Text style={styles.limitText}>{syncResult.omittedMain > 0
              ? 'Основные напоминания не поместились в системный лимит. Откройте LifeCare до указанной даты, чтобы продолжить их планирование.'
              : `Повторные напоминания запланированы до ${formatDate(syncResult.coverageEndsOn)}. Основные напоминания о дозах сохранены полностью.`}</Text>
          </View> : null}
          <Text style={styles.privacy}>Уведомления создаются на вашем устройстве. Данные о лекарствах не передаются на сервер.</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function PermissionStatus({ permission, doseRemindersEnabled }: { permission: SystemNotificationPermission; doseRemindersEnabled: boolean }) {
  if (permission === 'granted') return <View style={[styles.permissionCard, styles.permissionGranted]}>
    <Text style={styles.permissionTitle}>Уведомления разрешены на устройстве</Text>
    <Text style={styles.permissionText}>{doseRemindersEnabled ? 'LifeCare может присылать напоминания о дозах.' : 'Теперь включите «Напоминание о дозах» ниже, чтобы начать получать напоминания.'}</Text>
  </View>;
  if (permission === 'unavailable') return null;
  return <View style={[styles.permissionCard, styles.permissionDenied]}>
    <Text style={styles.permissionTitle}>{permission === 'not-determined' ? 'Разрешение ещё не выбрано' : 'Уведомления отключены в iPhone'}</Text>
    <Text style={styles.permissionText}>{permission === 'not-determined' ? 'Включите напоминание о дозах — iPhone запросит разрешение.' : 'Откройте настройки LifeCare и разрешите уведомления. После возврата приложение проверит это автоматически.'}</Text>
    {permission === 'denied' ? <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} style={({ pressed }) => [styles.settingsButton, pressed && styles.settingsButtonPressed]}><Text style={styles.settingsButtonText}>Открыть настройки iPhone</Text></Pressable> : null}
  </View>;
}

function formatDate(value: string | null) {
  if (!value) return 'ближайшего периода';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(year, month - 1, day));
}

function SettingRow({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={() => onValueChange(!value)} style={[styles.toggle, value && styles.toggleOn]}><View style={[styles.toggleThumb, value && styles.toggleThumbOn]} /></Pressable></View>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#FFFFFF', flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', height: 62, justifyContent: 'center', paddingHorizontal: 20 },
  headerTitle: { color: '#14171D', fontSize: 17, fontWeight: '800' },
  closeButton: { alignItems: 'center', backgroundColor: '#F1F2F5', borderRadius: 21, height: 42, justifyContent: 'center', position: 'absolute', right: 20, top: 10, width: 42 },
  closeText: { color: '#1C2027', fontSize: 31, fontWeight: '300', marginTop: -4 },
  content: { paddingBottom: 36, paddingHorizontal: 24, paddingTop: 23 },
  iconCircle: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#E4F5FF', borderRadius: 43, height: 86, justifyContent: 'center', width: 86 },
  icon: { color: '#1688F7', fontSize: 42, fontWeight: '700', marginTop: -3 },
  title: { color: '#12151A', fontSize: 30, fontWeight: '800', letterSpacing: -0.8, marginTop: 27 },
  description: { color: '#737A85', fontSize: 16, lineHeight: 23, marginTop: 10 },
  permissionCard: { borderRadius: 18, marginTop: 18, padding: 14 },
  permissionGranted: { backgroundColor: '#E8F8EE' },
  permissionDenied: { backgroundColor: '#FFF4E5' },
  permissionTitle: { color: '#243129', fontSize: 14, fontWeight: '800' },
  permissionText: { color: '#5F6D64', fontSize: 13, lineHeight: 18, marginTop: 5 },
  settingsButton: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: 11, marginTop: 11, paddingHorizontal: 12, paddingVertical: 9 },
  settingsButtonPressed: { opacity: 0.65 },
  settingsButtonText: { color: '#1688F7', fontSize: 13, fontWeight: '800' },
  group: { backgroundColor: '#F2F3F6', borderRadius: 22, marginTop: 28, overflow: 'hidden' },
  row: { alignItems: 'center', borderBottomColor: '#D9DCE1', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 64, paddingHorizontal: 18 },
  rowLabel: { color: '#1C2027', fontSize: 16, fontWeight: '600' },
  toggle: { alignItems: 'flex-start', backgroundColor: '#C8CDD4', borderRadius: 17, height: 32, justifyContent: 'center', paddingHorizontal: 3, width: 52 },
  toggleOn: { alignItems: 'flex-end', backgroundColor: '#1688F7' },
  toggleThumb: { backgroundColor: '#FFFFFF', borderRadius: 13, elevation: 1, height: 26, shadowColor: '#304152', shadowOffset: { height: 1, width: 0 }, shadowOpacity: 0.18, shadowRadius: 2, width: 26 },
  toggleThumbOn: { backgroundColor: '#FFFFFF' },
  hint: { color: '#6E7682', fontSize: 13, lineHeight: 19, marginTop: 16 },
  timeZoneHint: { color: '#6E7682', fontSize: 13, lineHeight: 19, marginTop: 9 },
  coverageNotice: { backgroundColor: '#EDF7FF', borderRadius: 16, marginTop: 14, padding: 14 },
  coverageTitle: { color: '#195D91', fontSize: 14, fontWeight: '800' },
  coverageText: { color: '#3B7096', fontSize: 13, lineHeight: 18, marginTop: 5 },
  limitNotice: { backgroundColor: '#FFF4D9', borderRadius: 16, marginTop: 14, padding: 14 },
  limitTitle: { color: '#5F4200', fontSize: 14, fontWeight: '800' },
  limitText: { color: '#72551A', fontSize: 13, lineHeight: 18, marginTop: 5 },
  privacy: { color: '#8B929C', fontSize: 12, lineHeight: 17, marginTop: 27 },
});
