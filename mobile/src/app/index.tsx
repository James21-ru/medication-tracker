import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type DoseStatus = 'upcoming' | 'taken' | 'later';
type Dose = { id: string; medication: string; dosage: string; time: string; color: string; status: DoseStatus };

const initialDoses: Dose[] = [
  { id: 'vitamin-d', medication: 'Витамин D3', dosage: '2 000 МЕ · 1 капсула', time: '09:00', color: '#F1B31C', status: 'upcoming' },
  { id: 'omega-3', medication: 'Омега-3', dosage: '1 000 мг · 1 капсула', time: '13:00', color: '#3B82F6', status: 'taken' },
  { id: 'magnesium', medication: 'Магний', dosage: '400 мг · 1 таблетка', time: '21:30', color: '#8B5CF6', status: 'later' },
];

function GlassSurface({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'ios' && isGlassEffectAPIAvailable()) {
    return <GlassView glassEffectStyle="clear" tintColor="rgba(255,255,255,0.42)" style={styles.glass}>{children}</GlassView>;
  }
  return <View style={[styles.glass, styles.glassFallback]}>{children}</View>;
}

export default function TodayScreen() {
  const [doses, setDoses] = useState(initialDoses);
  const [selectedDay, setSelectedDay] = useState(16);
  const completed = doses.filter((dose) => dose.status === 'taken').length;
  const upcoming = doses.find((dose) => dose.status === 'upcoming');

  function confirmDose(dose: Dose) {
    Alert.alert('Отметить приём', `${dose.medication} · ${dose.dosage}`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Пропущено', style: 'destructive' },
      { text: 'Принято', onPress: () => setDoses((items) => items.map((item) => item.id === dose.id ? { ...item, status: 'taken' } : item)) },
    ]);
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.topLine}>
            <View><Text style={styles.eyebrow}>ВТОРНИК, 16 СЕНТЯБРЯ</Text><Text style={styles.title}>Сегодня</Text></View>
            <Pressable accessibilityLabel="Добавить лекарство" onPress={() => Alert.alert('Скоро', 'Мастер добавления лекарства — следующий экран MVP.')} style={styles.addButton}><Text style={styles.addButtonText}>＋</Text></Pressable>
          </View>

          <View style={styles.days} accessibilityLabel="Выбор дня">
            {[14, 15, 16, 17, 18].map((day, index) => <Pressable key={day} onPress={() => setSelectedDay(day)} style={[styles.day, selectedDay === day && styles.daySelected]}><Text style={[styles.dayName, selectedDay === day && styles.dayNameSelected]}>{['Вс', 'Пн', 'Вт', 'Ср', 'Чт'][index]}</Text><Text style={[styles.dayNumber, selectedDay === day && styles.dayNumberSelected]}>{day}</Text></Pressable>)}
          </View>

          <GlassSurface><Text style={styles.summaryLabel}>{completed === doses.length ? 'Все приёмы отмечены' : 'Ваш день'}</Text><View style={styles.summaryRow}><Text style={styles.summaryValue}>{completed}</Text><Text style={styles.summaryOf}>из {doses.length} приёмов завершено</Text></View></GlassSurface>

          {upcoming ? <View style={styles.section}><Text style={styles.sectionTitle}>Ближайший приём</Text><Pressable onPress={() => confirmDose(upcoming)} style={styles.nextCard}><View style={[styles.colorMark, { backgroundColor: upcoming.color }]} /><DoseInfo dose={upcoming} /><View style={styles.takeButton}><Text style={styles.takeButtonText}>Отметить</Text></View></Pressable></View> : <View style={styles.completeCard}><Text style={styles.completeEmoji}>✓</Text><Text style={styles.completeTitle}>На сегодня всё</Text><Text style={styles.completeText}>Все запланированные приёмы отмечены.</Text></View>}

          <View style={styles.section}><Text style={styles.sectionTitle}>Расписание</Text><View style={styles.list}>{doses.map((dose) => <Pressable key={dose.id} disabled={dose.status === 'taken'} onPress={() => confirmDose(dose)} style={styles.listRow}><View style={[styles.colorMark, { backgroundColor: dose.color }]} /><DoseInfo dose={dose} />{dose.status === 'taken' ? <View style={styles.takenBadge}><Text style={styles.takenBadgeText}>Принято</Text></View> : <Text style={styles.chevron}>›</Text>}</Pressable>)}</View></View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function DoseInfo({ dose }: { dose: Dose }) {
  return <View style={styles.doseInfo}><Text style={styles.doseTime}>{dose.time}</Text><Text style={styles.doseName}>{dose.medication}</Text><Text style={styles.doseDetails}>{dose.dosage}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' }, safeArea: { flex: 1 }, content: { paddingHorizontal: 20, paddingBottom: 116 },
  topLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }, eyebrow: { color: '#747A85', fontSize: 12, fontWeight: '700', letterSpacing: 0.8 }, title: { color: '#15171B', fontSize: 36, fontWeight: '700', letterSpacing: -1.1, marginTop: 2 },
  addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#17191D', alignItems: 'center', justifyContent: 'center' }, addButtonText: { color: '#FFFFFF', fontSize: 27, fontWeight: '300', marginTop: -2 },
  days: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 27 }, day: { alignItems: 'center', width: 49, paddingVertical: 8, borderRadius: 18 }, daySelected: { backgroundColor: '#17191D' }, dayName: { color: '#858B95', fontSize: 12, fontWeight: '600' }, dayNameSelected: { color: '#B9BEC7' }, dayNumber: { color: '#25282E', fontSize: 18, fontWeight: '700', marginTop: 3 }, dayNumberSelected: { color: '#FFFFFF' },
  glass: { marginTop: 22, padding: 18, borderRadius: 24, overflow: 'hidden' }, glassFallback: { backgroundColor: 'rgba(255,255,255,0.74)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.92)' }, summaryLabel: { color: '#5E6570', fontSize: 13, fontWeight: '600' }, summaryRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 3 }, summaryValue: { color: '#181A1F', fontSize: 34, fontWeight: '700', letterSpacing: -1 }, summaryOf: { color: '#5E6570', fontSize: 15, marginLeft: 8 },
  section: { marginTop: 30 }, sectionTitle: { color: '#20232A', fontSize: 19, fontWeight: '700', marginBottom: 12 }, nextCard: { backgroundColor: '#FFFFFF', padding: 17, borderRadius: 24, flexDirection: 'row', alignItems: 'center', shadowColor: '#112340', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 2 }, colorMark: { height: 43, width: 8, borderRadius: 4, marginRight: 13 }, doseInfo: { flex: 1 }, doseTime: { color: '#6E7480', fontSize: 13, fontWeight: '600' }, doseName: { color: '#1C1F25', fontSize: 17, fontWeight: '700', marginTop: 2 }, doseDetails: { color: '#737A85', fontSize: 13, marginTop: 2 }, takeButton: { backgroundColor: '#1E2026', borderRadius: 15, paddingHorizontal: 12, paddingVertical: 10 }, takeButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  completeCard: { alignItems: 'center', backgroundColor: '#E9F7EF', marginTop: 30, padding: 25, borderRadius: 24 }, completeEmoji: { color: '#147A45', fontSize: 24, fontWeight: '700' }, completeTitle: { color: '#155D37', fontSize: 19, fontWeight: '700', marginTop: 8 }, completeText: { color: '#367653', fontSize: 14, marginTop: 4 },
  list: { backgroundColor: '#FFFFFF', borderRadius: 24, overflow: 'hidden' }, listRow: { minHeight: 84, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EBEDF1' }, takenBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: '#E9F7EF' }, takenBadgeText: { color: '#177044', fontSize: 12, fontWeight: '700' }, chevron: { color: '#989EA8', fontSize: 28, fontWeight: '300' },
});
