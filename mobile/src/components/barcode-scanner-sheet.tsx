import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

type Props = { visible: boolean; onClose: () => void; onScanned?: (barcode: string) => void; mode?: 'barcode' | 'prescription' };

export function BarcodeScannerSheet({ visible, onClose, onScanned, mode = 'barcode' }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  useEffect(() => { if (visible) setScanned(false); }, [visible]);

  function scan(value: string) {
    if (scanned) return;
    setScanned(true);
    onScanned?.(value);
  }

  if (!visible) return null;
  if (!permission) return <Modal visible animationType="fade"><View style={styles.permission}><ActivityIndicator color="#1688F7" /></View></Modal>;
  const prescription = mode === 'prescription';
  const title = prescription ? 'Сканировать назначение' : 'Сканировать штрихкод';
  const permissionText = prescription ? 'Камера используется только для просмотра назначения перед распознаванием.' : 'Камера используется только для считывания штрихкода с упаковки.';
  const tip = prescription ? 'Поместите назначение целиком в рамку' : 'Наведите камеру на штрихкод упаковки';
  const bottomText = prescription ? 'Распознавание и перенос плана лечения будут добавлены следующим этапом. Фото не сохраняется.' : 'После считывания вы заполните название и параметры препарата вручную.';
  if (!permission.granted) return <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><View style={styles.permission}><View style={styles.permissionIcon}><Text style={styles.permissionIconText}>▥</Text></View><Text style={styles.permissionTitle}>Нужен доступ к камере</Text><Text style={styles.permissionText}>{permissionText}</Text><Pressable onPress={() => void requestPermission()} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><Text style={styles.primaryText}>Разрешить камеру</Text></Pressable><Pressable onPress={onClose} style={({ pressed }) => pressed && styles.pressed}><Text style={styles.cancel}>Не сейчас</Text></Pressable></View></Modal>;

  return <Modal visible animationType="slide" onRequestClose={onClose}><View style={styles.cameraScreen}><CameraView style={StyleSheet.absoluteFill} facing="back" onBarcodeScanned={!prescription && !scanned ? ({ data }) => scan(data) : undefined} /><View style={styles.overlay}><View style={styles.top}><Pressable onPress={onClose} style={({ pressed }) => [styles.close, pressed && styles.pressed]}><Text style={styles.closeText}>×</Text></Pressable><Text style={styles.heading}>{title}</Text><View style={styles.placeholder} /></View><View style={styles.center}><View style={[styles.frame, prescription && styles.documentFrame]} /><Text style={styles.tip}>{tip}</Text></View><View style={styles.bottom}><Text style={styles.bottomText}>{bottomText}</Text></View></View></View></Modal>;
}

const styles = StyleSheet.create({
  permission: { flex: 1, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }, permissionIcon: { width: 78, height: 78, borderRadius: 39, backgroundColor: '#E3F3FF', alignItems: 'center', justifyContent: 'center' }, permissionIconText: { color: '#1688F7', fontSize: 36 }, permissionTitle: { color: '#17191E', fontSize: 25, fontWeight: '700', marginTop: 24, textAlign: 'center' }, permissionText: { color: '#707784', fontSize: 16, lineHeight: 23, textAlign: 'center', marginTop: 10 }, primary: { backgroundColor: '#1688F7', minHeight: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', marginTop: 28 }, primaryText: { color: '#FFF', fontSize: 17, fontWeight: '700' }, cancel: { color: '#68717E', fontSize: 16, fontWeight: '700', marginTop: 20 }, cameraScreen: { flex: 1, backgroundColor: '#0D1118' }, overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.22)', justifyContent: 'space-between' }, top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 22 }, close: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }, closeText: { color: '#13161B', fontSize: 29, fontWeight: '300', lineHeight: 32 }, heading: { color: '#FFF', fontSize: 17, fontWeight: '700' }, placeholder: { width: 42 }, center: { alignItems: 'center' }, frame: { width: 262, height: 174, borderRadius: 24, borderWidth: 2, borderColor: '#FFF', backgroundColor: 'rgba(255,255,255,0.06)' }, documentFrame: { width: 290, height: 390, borderRadius: 18 }, tip: { color: '#FFF', fontSize: 15, fontWeight: '600', textAlign: 'center', marginTop: 18 }, bottom: { backgroundColor: 'rgba(13,17,24,0.80)', paddingHorizontal: 28, paddingVertical: 28 }, bottomText: { color: '#E3E7EC', fontSize: 14, lineHeight: 20, textAlign: 'center' }, pressed: { opacity: 0.68, transform: [{ scale: 0.97 }] },
});
