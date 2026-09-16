import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Medication, useMedications } from '@/context/medications';

type Props = { visible: boolean; onClose: () => void };
type Form = Medication['form'];
type Unit = Medication['unit'];

const forms: Form[] = ['Капсула', 'Таблетка', 'Жидкость'];
const units: Unit[] = ['мг', 'мкг', 'г', 'мл'];
const colors = ['#2C85D3', '#8256E7', '#EC6E9D', '#E6813F', '#239B72'];

export function AddMedicationFlow({ visible, onClose }: Props) {
  const { addMedication } = useMedications();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [form, setForm] = useState<Form>('Капсула');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<Unit>('мг');
  const [time, setTime] = useState('09:00');
  const [color, setColor] = useState(colors[0]);

  const isReady = step === 0 ? name.trim().length > 0 : step === 2 ? amount.trim().length > 0 : step === 3 ? /^([01]\d|2[0-3]):[0-5]\d$/.test(time) : true;
  const title = ['Название лекарства', 'Выберите форму', 'Добавьте дозировку', 'Настройте приём', 'Проверьте детали'][step];

  function close() {
    setStep(0); setName(''); setForm('Капсула'); setAmount(''); setUnit('мг'); setTime('09:00'); setColor(colors[0]); onClose();
  }

  function next() {
    if (step < 4) return setStep((current) => current + 1);
    addMedication({ name: name.trim(), form, amount: amount.trim(), unit, time, color });
    close();
  }

  return <Modal animationType="slide" presentationStyle="pageSheet" visible={visible} onRequestClose={close}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={() => step === 0 ? close() : setStep((current) => current - 1)} style={styles.roundButton}><Text style={styles.closeText}>{step === 0 ? '×' : '‹'}</Text></Pressable>
        <Text style={styles.stepLabel}>{step + 1} из 5</Text>
        <View style={styles.roundSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.preview, { backgroundColor: color }]}><Text style={styles.previewSymbol}>{form === 'Капсула' ? '●' : form === 'Таблетка' ? '◉' : '◒'}</Text></View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{step === 0 ? 'Укажи название так, как тебе привычно его видеть.' : step === 1 ? 'Форма нужна только для понятного отображения в расписании.' : step === 2 ? 'Мы не даём медицинских рекомендаций — введи дозировку из назначения.' : step === 3 ? 'Напоминание придёт на устройство в выбранное время.' : 'Проверь данные перед добавлением.'}</Text>
        {step === 0 && <TextInput autoFocus value={name} onChangeText={setName} placeholder="Например, Витамин D3" placeholderTextColor="#9A9EAA" style={styles.input} returnKeyType="next" onSubmitEditing={next} />}
        {step === 1 && <View style={styles.choiceList}>{forms.map((item) => <Pressable key={item} onPress={() => setForm(item)} style={styles.choiceRow}><Text style={styles.choiceText}>{item}</Text><Text style={styles.check}>{form === item ? '✓' : ''}</Text></Pressable>)}</View>}
        {step === 2 && <><Text style={styles.fieldLabel}>Дозировка</Text><TextInput value={amount} onChangeText={setAmount} placeholder="Например, 400" placeholderTextColor="#9A9EAA" keyboardType="decimal-pad" style={styles.input} /><Text style={styles.fieldLabel}>Единица измерения</Text><View style={styles.unitRow}>{units.map((item) => <Pressable key={item} onPress={() => setUnit(item)} style={[styles.unit, unit === item && styles.unitSelected]}><Text style={[styles.unitText, unit === item && styles.unitTextSelected]}>{item}</Text></Pressable>)}</View></>}
        {step === 3 && <><Text style={styles.fieldLabel}>Время приёма</Text><TextInput value={time} onChangeText={setTime} placeholder="09:00" placeholderTextColor="#9A9EAA" keyboardType="numbers-and-punctuation" maxLength={5} style={styles.input} /><Text style={styles.fieldLabel}>Цвет лекарства</Text><View style={styles.colorRow}>{colors.map((item) => <Pressable key={item} onPress={() => setColor(item)} style={[styles.color, { backgroundColor: item }, color === item && styles.colorSelected]} />)}</View></>}
        {step === 4 && <View style={styles.summary}><Text style={styles.summaryName}>{name}</Text><Text style={styles.summaryMeta}>{form} · {amount} {unit}</Text><View style={styles.summaryLine} /><Text style={styles.summarySchedule}>Каждый день в {time}</Text></View>}
      </ScrollView>
      <View style={styles.footer}><Pressable disabled={!isReady} onPress={next} style={[styles.primaryButton, !isReady && styles.primaryButtonDisabled]}><Text style={styles.primaryButtonText}>{step === 4 ? 'Добавить лекарство' : 'Далее'}</Text></Pressable></View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 16 }, roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F2F3F6', alignItems: 'center', justifyContent: 'center' }, closeText: { fontSize: 34, fontWeight: '300', lineHeight: 38 }, stepLabel: { color: '#717784', fontSize: 14, fontWeight: '700' }, roundSpacer: { width: 44 }, content: { padding: 28, paddingTop: 22, flexGrow: 1 }, preview: { width: 94, height: 94, borderRadius: 47, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 12, shadowColor: '#0A66B2', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } }, previewSymbol: { color: '#FFFFFF', fontSize: 52, fontWeight: '700' }, title: { color: '#111318', fontSize: 32, fontWeight: '700', letterSpacing: -0.8, marginTop: 42 }, description: { color: '#737985', fontSize: 16, lineHeight: 23, marginTop: 12, marginBottom: 28 }, input: { backgroundColor: '#F1F2F5', color: '#17191E', borderRadius: 20, minHeight: 62, paddingHorizontal: 20, fontSize: 19 }, fieldLabel: { color: '#20232A', fontSize: 18, fontWeight: '700', marginBottom: 11, marginTop: 9 }, choiceList: { backgroundColor: '#F1F2F5', borderRadius: 22, overflow: 'hidden' }, choiceRow: { minHeight: 68, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D7DAE0' }, choiceText: { fontSize: 19, color: '#17191E' }, check: { color: '#1287F7', fontSize: 26, fontWeight: '700' }, unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 }, unit: { backgroundColor: '#F1F2F5', borderRadius: 16, minWidth: 66, paddingVertical: 13, alignItems: 'center' }, unitSelected: { backgroundColor: '#1688F7' }, unitText: { color: '#3D424C', fontSize: 16, fontWeight: '700' }, unitTextSelected: { color: '#FFFFFF' }, colorRow: { flexDirection: 'row', gap: 13, marginTop: 3 }, color: { width: 42, height: 42, borderRadius: 21 }, colorSelected: { borderWidth: 4, borderColor: '#FFFFFF', transform: [{ scale: 1.12 }], shadowColor: '#343941', shadowOpacity: 0.4, shadowRadius: 2 }, summary: { backgroundColor: '#F1F2F5', borderRadius: 24, padding: 22 }, summaryName: { color: '#16191F', fontSize: 24, fontWeight: '700' }, summaryMeta: { color: '#6D7480', fontSize: 17, marginTop: 5 }, summaryLine: { height: StyleSheet.hairlineWidth, backgroundColor: '#D7DAE0', marginVertical: 19 }, summarySchedule: { color: '#16191F', fontSize: 18, fontWeight: '600' }, footer: { padding: 22, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ECEEF1' }, primaryButton: { minHeight: 58, borderRadius: 22, backgroundColor: '#1688F7', alignItems: 'center', justifyContent: 'center' }, primaryButtonDisabled: { backgroundColor: '#CDD1D8' }, primaryButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
});
