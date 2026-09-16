import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddMedicationFlow } from '@/components/add-medication-flow';
import { useMedications } from '@/context/medications';

export default function MedicationsScreen() {
  const { medications } = useMedications();
  const [showAddFlow, setShowAddFlow] = useState(false);
  return <View style={styles.screen}><SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>ВАШ СПИСОК</Text><Text style={styles.title}>Лекарства</Text></View><Pressable onPress={() => setShowAddFlow(true)} style={styles.addButton}><Text style={styles.addButtonText}>＋</Text></Pressable></View>
    {medications.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>Список пока пуст</Text><Text style={styles.emptyText}>Добавь первое лекарство — оно появится здесь и в расписании на сегодня.</Text><Pressable onPress={() => setShowAddFlow(true)}><Text style={styles.link}>Добавить лекарство</Text></Pressable></View> : <><Text style={styles.subtitle}>Активные · {medications.length}</Text><View style={styles.list}>{medications.map((medication) => <View key={medication.id} style={styles.row}><View style={[styles.icon, { backgroundColor: medication.color }]} /><View style={styles.info}><Text style={styles.name}>{medication.name}</Text><Text style={styles.dose}>{medication.form} · {medication.amount} {medication.unit} · {medication.time}</Text></View></View>)}</View></>}
    <AddMedicationFlow visible={showAddFlow} onClose={() => setShowAddFlow(false)} />
  </ScrollView></SafeAreaView></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' }, safeArea: { flex: 1 }, content: { padding: 20, paddingBottom: 116, flexGrow: 1 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }, eyebrow: { color: '#747A85', fontSize: 12, fontWeight: '700', letterSpacing: 0.8 }, title: { color: '#15171B', fontSize: 36, fontWeight: '700', letterSpacing: -1.1, marginTop: 2 }, addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#17191D', alignItems: 'center', justifyContent: 'center' }, addButtonText: { color: '#FFFFFF', fontSize: 27, fontWeight: '300', marginTop: -2 }, empty: { alignItems: 'center', paddingHorizontal: 28, marginTop: 130 }, emptyTitle: { color: '#17191E', fontSize: 23, fontWeight: '700' }, emptyText: { color: '#727986', fontSize: 16, textAlign: 'center', lineHeight: 23, marginTop: 10 }, link: { color: '#1688F7', fontSize: 16, fontWeight: '700', marginTop: 20 }, subtitle: { color: '#747A85', fontSize: 14, marginTop: 28, marginBottom: 10 }, list: { backgroundColor: '#FFFFFF', borderRadius: 24, overflow: 'hidden' }, row: { minHeight: 80, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EBEDF1' }, icon: { width: 40, height: 40, borderRadius: 20 }, info: { flex: 1, marginLeft: 13 }, name: { color: '#1C1F25', fontSize: 17, fontWeight: '700' }, dose: { color: '#737A85', fontSize: 13, marginTop: 3 },
});
