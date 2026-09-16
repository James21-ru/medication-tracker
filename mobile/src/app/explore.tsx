import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const medications = [
  { name: 'Витамин D3', dose: '2 000 МЕ · ежедневно', color: '#F1B31C' },
  { name: 'Омега-3', dose: '1 000 мг · ежедневно', color: '#3B82F6' },
  { name: 'Магний', dose: '400 мг · ежедневно', color: '#8B5CF6' },
];

export default function MedicationsScreen() {
  return <View style={styles.screen}><SafeAreaView style={styles.safeArea}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.header}><View><Text style={styles.eyebrow}>ВАШ СПИСОК</Text><Text style={styles.title}>Лекарства</Text></View><Pressable onPress={() => Alert.alert('Скоро', 'Добавление лекарства станет следующим интерактивным сценарием.')} style={styles.addButton}><Text style={styles.addButtonText}>＋</Text></Pressable></View>
    <Text style={styles.subtitle}>Активные · {medications.length}</Text>
    <View style={styles.list}>{medications.map((medication) => <Pressable key={medication.name} onPress={() => Alert.alert(medication.name, medication.dose)} style={styles.row}><View style={[styles.icon, { backgroundColor: medication.color }]} /><View style={styles.info}><Text style={styles.name}>{medication.name}</Text><Text style={styles.dose}>{medication.dose}</Text></View><Text style={styles.chevron}>›</Text></Pressable>)}</View>
  </ScrollView></SafeAreaView></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' }, safeArea: { flex: 1 }, content: { padding: 20, paddingBottom: 116 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }, eyebrow: { color: '#747A85', fontSize: 12, fontWeight: '700', letterSpacing: 0.8 }, title: { color: '#15171B', fontSize: 36, fontWeight: '700', letterSpacing: -1.1, marginTop: 2 }, subtitle: { color: '#747A85', fontSize: 14, marginTop: 28, marginBottom: 10 }, addButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#17191D', alignItems: 'center', justifyContent: 'center' }, addButtonText: { color: '#FFFFFF', fontSize: 27, fontWeight: '300', marginTop: -2 }, list: { backgroundColor: '#FFFFFF', borderRadius: 24, overflow: 'hidden' }, row: { minHeight: 80, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EBEDF1' }, icon: { width: 40, height: 40, borderRadius: 20 }, info: { flex: 1, marginLeft: 13 }, name: { color: '#1C1F25', fontSize: 17, fontWeight: '700' }, dose: { color: '#737A85', fontSize: 13, marginTop: 3 }, chevron: { color: '#989EA8', fontSize: 28, fontWeight: '300' },
});
