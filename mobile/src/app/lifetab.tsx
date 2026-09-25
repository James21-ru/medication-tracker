import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';

const pillboxVideo = require('@/assets/images/lifetab-pillbox.mp4');

export default function LifeTabScreen() {
  const [reserved, setReserved] = useState(false);
  const player = useVideoPlayer(pillboxVideo, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.play();
  });

  const reserve = () => {
    setReserved(true);
    Alert.alert(
      'Вы в листе ожидания',
      'Мы сохранили ваш интерес к LifeTab только на этом устройстве. Оформление заказа и передача данных пока не подключены.',
    );
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>LIFECARE DEVICE</Text>
              <Text style={styles.title}>LifeTab</Text>
            </View>
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>ПРЕДЗАКАЗ</Text>
            </View>
          </View>

          <View style={styles.hero}>
            <View style={styles.heroGlow} />
            <VideoView
              contentFit="cover"
              nativeControls={false}
              player={player}
              playsInline
              style={styles.video}
            />
          </View>

          <View style={styles.priceRow}>
            <View>
              <Text style={styles.priceLabel}>СПЕЦИАЛЬНАЯ ЦЕНА ПРЕДЗАКАЗА</Text>
              <Text style={styles.price}>от 4 990 ₽</Text>
            </View>
            <Text style={styles.delivery}>Первая партия{`\n`}в 2026 году</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Оставить заявку на LifeTab"
            disabled={reserved}
            onPress={reserve}
            style={({ pressed }) => [styles.reserveButton, pressed && !reserved && styles.pressed, reserved && styles.reserveButtonReserved]}>
            <Text style={styles.reserveButtonText}>{reserved ? 'Вы в листе ожидания' : 'Оставить заявку на предзаказ'}</Text>
            <Text style={styles.reserveButtonArrow}>→</Text>
          </Pressable>
          <Text style={styles.note}>Без оплаты и передачи контактных данных</Text>

          <Text style={styles.sectionTitle}>Как LifeTab помогает</Text>
          <View style={styles.featureGrid}>
            <Feature number="01" title="Напоминает" text="Светом и в приложении — когда подошло время приёма." />
            <Feature number="02" title="Организует" text="Порядок приёмов на неделю в одной компактной таблетнице." />
            <Feature number="03" title="Синхронизирует" text="Связывает устройство с вашим дневником LifeCare." />
            <Feature number="04" title="Подсказывает" text="Помогает заметить, что препарат или запас заканчивается." />
          </View>

          <View style={styles.privacyCard}>
            <Text style={styles.privacyIcon}>◌</Text>
            <View style={styles.privacyCopy}>
              <Text style={styles.privacyTitle}>Данные — под вашим контролем</Text>
              <Text style={styles.privacyText}>LifeTab не принимает решений о лечении и не заменяет рекомендации врача.</Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Feature({ number, title, text }: { number: string; title: string; text: string }) {
  return <View style={styles.feature}><Text style={styles.featureNumber}>{number}</Text><Text style={styles.featureTitle}>{title}</Text><Text style={styles.featureText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#EEF6FC', flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: 20, paddingBottom: 116 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  eyebrow: { color: '#5D7180', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  title: { color: '#152331', fontSize: 36, fontWeight: '700', letterSpacing: -1.2, marginTop: 2 },
  statusPill: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.72)', borderColor: 'rgba(255,255,255,0.95)', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 7, paddingHorizontal: 12, paddingVertical: 9 },
  statusDot: { backgroundColor: '#39C779', borderRadius: 4, height: 8, width: 8 },
  statusText: { color: '#307351', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  hero: { backgroundColor: '#4DBCEB', borderRadius: 32, height: 390, marginTop: 23, overflow: 'hidden' },
  heroGlow: { backgroundColor: '#BFF2FF', borderRadius: 160, height: 320, left: -70, opacity: 0.5, position: 'absolute', top: -135, width: 420 },
  video: { height: '100%', width: '100%' },
  priceRow: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginTop: 22 },
  priceLabel: { color: '#6A7D89', fontSize: 10, fontWeight: '800', letterSpacing: 0.65 },
  price: { color: '#172B3A', fontSize: 28, fontWeight: '800', letterSpacing: -0.8, marginTop: 3 },
  delivery: { color: '#657986', fontSize: 12, lineHeight: 17, textAlign: 'right' },
  reserveButton: { alignItems: 'center', backgroundColor: '#137FDC', borderRadius: 20, flexDirection: 'row', justifyContent: 'center', marginTop: 19, minHeight: 59, paddingHorizontal: 20 },
  reserveButtonReserved: { backgroundColor: '#287C63' },
  reserveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  reserveButtonArrow: { color: '#C8ECFF', fontSize: 23, fontWeight: '500', marginLeft: 10, marginTop: -2 },
  note: { color: '#71818B', fontSize: 12, marginTop: 10, textAlign: 'center' },
  sectionTitle: { color: '#172B3A', fontSize: 23, fontWeight: '800', letterSpacing: -0.55, marginBottom: 13, marginTop: 34 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  feature: { backgroundColor: 'rgba(255,255,255,0.71)', borderColor: 'rgba(255,255,255,0.9)', borderRadius: 22, borderWidth: 1, minHeight: 163, padding: 16, width: '48.5%' },
  featureNumber: { color: '#1B92D8', fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  featureTitle: { color: '#193042', fontSize: 17, fontWeight: '800', marginTop: 25 },
  featureText: { color: '#637885', fontSize: 12, lineHeight: 17, marginTop: 5 },
  privacyCard: { alignItems: 'flex-start', backgroundColor: '#DFF3FF', borderRadius: 22, flexDirection: 'row', marginTop: 22, padding: 17 },
  privacyIcon: { color: '#1688D5', fontSize: 26, lineHeight: 28 },
  privacyCopy: { flex: 1, marginLeft: 11 },
  privacyTitle: { color: '#1C4057', fontSize: 14, fontWeight: '800' },
  privacyText: { color: '#547284', fontSize: 12, lineHeight: 17, marginTop: 4 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
});
