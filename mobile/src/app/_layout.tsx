import { DarkTheme, DefaultTheme, router, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { MedicationProvider } from '@/context/medications';
import { configureReminders } from '@/services/reminders';

SplashScreen.preventAutoHideAsync();
configureReminders();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const openToday = () => router.navigate('/');
    if (Notifications.getLastNotificationResponse()?.notification.request.content.data?.url === '/') openToday();
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.content.data?.url === '/') openToday();
    });
    return () => subscription.remove();
  }, []);
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <MedicationProvider>
        <AnimatedSplashOverlay />
        <AppTabs />
      </MedicationProvider>
    </ThemeProvider>
  );
}
