import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddMedicationFlow } from '@/components/add-medication-flow';
import { useMedications } from '@/context/medications';

export default function TodayScreen() {
  const { medications } = useMedications();
  const [showAddFlow, setShowAddFlow] = useState(false);

  return <View style={styles.screen}><SafeAreaView style={styles.safeArea}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><View><Text style={styles.eyebrow}>ВТОРНИК, 16 СЕНТЯБРЯ</Text><Text style={styles.title}>Сегодня</Text></View><Pressable accessibilityLabel="Добавить лекарство" onPress={() => setShowAddFlow(true)} style={styles.addButton}><Text style={styles.addButtonText}>＋</Text></Pressable></View>
      {medications.length === 0 ? <EmptyState onAdd={() => setShowAddFlow(true)} /> : <Schedule medications={medications} onAdd={() => setShowAddFlow(true)} />}
    </ScrollView>
    <AddMedicationFlow visible={showAddFlow} onClose={() => setShowAddFlow(false)} />
  </SafeAreaView></View>;
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return <View style={styles.empty}><View style={styles.emptyIcon}><Text style={styles.emptyIconText}>＋</Text></View><Text style={styles.emptyTitle}>Добавьте первое лекарство</Text><Text style={styles.emptyDescription}>Мы поможем настроить простой график и напоминание. Данные пока хранятся только на этом устройстве.</Text><Pressable onPress={onAdd} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Добавить лекарство</Text></Pressable></View>;
}

function Schedule({ medications, onAdd }: { medications: ReturnType<typeof useMedications>['medications']; onAdd: () => void }) {
  return <View style={styles.schedule}><Text style={styles.sectionTitle}>Сегодняшние приёмы</Text><View style={styles.list}>{medications.map((medication) => <View key={medication.id} style={styles.row}><View style={[styles.colorMark, { backgroundColor: medication.color }]} /><View style={styles.info}><Text style={styles.time}>{medication.time}</Text><Text style={styles.name}>{medication.name}</Text><Text style={styles.details}>{medication.form} · {medication.amount} {medication.unit}</Text></View><View style={styles.status}><Text style={styles.statusText}>Ожидается</Text></View></View>)}</View><Pressable onPress={onAdd} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>＋ Добавить ещё</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' }, safeArea: { flex: 1 }, content: { padding: 20, paddingBottom: 116, flexGrow: 1 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }, eyebrow: { color: '#747A85', fontSize: 12, fontWeight: '700', letterSpacing: 0.8 }, title: { color: '#15171B', fontSize: 36, fontWeight: '700', letterSpacing: -1.1, marginTop: 2 }, addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#17191D', alignItems: 'center', justifyContent: 'center' }, addButtonText: { color: '#FFFFFF', fontSize: 27, fontWeight: '300', marginTop: -2 }, empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingTop: 100 }, emptyIcon: { height: 88, width: 88, borderRadius: 44, backgroundColor: '#DFF2FF', alignItems: 'center', justifyContent: 'center' }, emptyIconText: { color: '#1688F7', fontSize: 45, fontWeight: '300', marginTop: -4 }, emptyTitle: { color: '#17191E', fontSize: 25, fontWeight: '700', marginTop: 24, textAlign: 'center' }, emptyDescription: { color: '#727986', fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 10 }, primaryButton: { backgroundColor: '#1688F7', borderRadius: 20, minHeight: 58, paddingHorizontal: 25, alignItems: 'center', justifyContent: 'center', marginTop: 28 }, primaryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' }, schedule: { marginTop: 34 }, sectionTitle: { color: '#20232A', fontSize: 20, fontWeight: '700', marginBottom: 12 }, list: { backgroundColor: '#FFFFFF', borderRadius: 24, overflow: 'hidden' }, row: { minHeight: 84, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8EAF0' }, colorMark: { width: 8, height: 43, borderRadius: 4, marginRight: 13 }, info: { flex: 1 }, time: { color: '#6E7480', fontSize: 13, fontWeight: '600' }, name: { color: '#1C1F25', fontSize: 17, fontWeight: '700', marginTop: 2 }, details: { color: '#737A85', fontSize: 13, marginTop: 2 }, status: { backgroundColor: '#EAF4FF', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 }, statusText: { color: '#1478D4', fontSize: 11, fontWeight: '700' }, secondaryButton: { alignItems: 'center', padding: 18, marginTop: 14 }, secondaryButtonText: { color: '#1688F7', fontSize: 16, fontWeight: '700' },
});
