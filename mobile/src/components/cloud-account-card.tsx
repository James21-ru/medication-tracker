import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/context/auth';

export function CloudAccountCard() {
  const { configured, loading, user, signInWithTelegram, signOut } = useAuth();

  async function handlePress() {
    if (user) {
      Alert.alert('Выйти из аккаунта?', 'Данные останутся на этом устройстве. Облачная синхронизация будет приостановлена.', [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Выйти', style: 'destructive', onPress: () => void signOut() },
      ]);
      return;
    }
    const result = await signInWithTelegram();
    if (result.error) Alert.alert('Вход не завершён', result.error);
  }

  const name = user?.user_metadata.full_name || user?.user_metadata.first_name || 'Подключено через Telegram';
  const description = user
    ? 'Аккаунт защищён. Синхронизацию данных подключим следующим шагом.'
    : 'Войдите через Telegram, чтобы подготовить резервную копию и синхронизацию.';

  return (
    <View style={styles.card}>
      <View style={styles.icon}><Text style={styles.iconText}>☁</Text></View>
      <View style={styles.copy}>
        <Text style={styles.title}>{user ? name : 'Резервная копия'}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={user ? 'Выйти из аккаунта' : 'Войти через Telegram'}
        disabled={!configured || loading}
        onPress={() => void handlePress()}
        style={({ pressed }) => [styles.button, (pressed || loading || !configured) && styles.buttonDisabled]}>
        <Text style={styles.buttonText}>{loading ? '…' : user ? 'Выйти' : 'Войти'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', backgroundColor: '#F2F2F7', borderRadius: 24, flexDirection: 'row', marginTop: 14, padding: 16 },
  icon: { alignItems: 'center', backgroundColor: '#E0F6FF', borderRadius: 16, height: 48, justifyContent: 'center', width: 48 },
  iconText: { color: '#1688F7', fontSize: 24, fontWeight: '700' },
  copy: { flex: 1, marginLeft: 12 },
  title: { color: '#17191E', fontSize: 16, fontWeight: '700' },
  description: { color: '#747A85', fontSize: 13, lineHeight: 18, marginTop: 3 },
  button: { alignItems: 'center', backgroundColor: '#1688F7', borderRadius: 14, justifyContent: 'center', minWidth: 60, paddingHorizontal: 11, paddingVertical: 10 },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
