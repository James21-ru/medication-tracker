import { DarkTheme, DefaultTheme, router, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';
import {
  Manrope_200ExtraLight,
  Manrope_300Light,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AuthProvider } from '@/context/auth';
import { MedicationProvider } from '@/context/medications';
import { configureReminders } from '@/services/reminders';

SplashScreen.preventAutoHideAsync();
configureReminders();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    Manrope_200ExtraLight,
    Manrope_300Light,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const openToday = () => router.navigate('/');
    if (Notifications.getLastNotificationResponse()?.notification.request.content.data?.url === '/') openToday();
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.content.data?.url === '/') openToday();
    });
    return () => subscription.remove();
  }, []);
  if (!fontsLoaded) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <MedicationProvider>
          <AnimatedSplashOverlay />
          <AppTabs />
        </MedicationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
