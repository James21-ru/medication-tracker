import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { CloudAccountCard } from '@/components/cloud-account-card';
import { useAuth } from '@/context/auth';

export default function AccountScreen() {
  const { user } = useAuth();
  return (
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.eyebrow}>ПРОФИЛЬ</Text>
          <Text style={styles.title}>Ваш аккаунт</Text>
          <Text style={styles.intro}>
            {user
              ? 'Вы вошли через Telegram. Этот аккаунт понадобится для резервной копии и синхронизации между устройствами.'
              : 'Подключите Telegram, чтобы в дальнейшем сохранять резервную копию и синхронизировать данные между устройствами.'}
          </Text>

          <CloudAccountCard />

          <View style={styles.note}>
            <Text style={styles.noteTitle}>Ваши данные — у вас</Text>
            <Text style={styles.noteText}>Препараты и отметки о приёмах продолжают храниться на устройстве. Вход не влияет на напоминания и не является медицинской рекомендацией.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8FA' },
  safeArea: { flex: 1 },
  content: { flexGrow: 1, padding: 20, paddingBottom: 24, paddingTop: 30 },
  eyebrow: { color: '#747A85', fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  title: { color: '#15171B', fontSize: 36, fontWeight: '700', letterSpacing: -1.1, marginTop: 2 },
  intro: { color: '#69717D', fontSize: 16, lineHeight: 23, marginTop: 14 },
  note: { backgroundColor: '#FFFFFF', borderRadius: 24, marginTop: 24, padding: 20 },
  noteTitle: { color: '#1B1E25', fontSize: 17, fontWeight: '800' },
  noteText: { color: '#747A85', fontSize: 14, lineHeight: 21, marginTop: 8 },
});
