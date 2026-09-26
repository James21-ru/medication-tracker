import { Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Image, StyleSheet } from 'react-native';

import { TabBarColors } from '@/constants/theme';

const ICON_SIZE = 24;

// A JavaScript tab bar instead of NativeTabs: on iOS 26 the system bar is Liquid Glass and adapts
// to the content under it, so its background cannot be pinned. This bar is opaque, looks the same
// on every screen and on Android, and sits below the screens instead of floating over them.
export default function AppTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: TabBarColors.selected,
        tabBarInactiveTintColor: TabBarColors.idle,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
        sceneStyle: styles.scene,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Сегодня',
          tabBarIcon: ({ color }) => <Image source={require('@/assets/images/tabIcons/home.png')} style={[styles.image, { tintColor: color }]} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Лекарства',
          tabBarIcon: ({ color }) => <Image source={require('@/assets/images/tabIcons/explore.png')} style={[styles.image, { tintColor: color }]} />,
        }}
      />
      <Tabs.Screen
        name="lifetab"
        options={{
          title: 'LifeTab',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView name={{ ios: focused ? 'pills.fill' : 'pills', android: 'medication' }} tintColor={color} size={ICON_SIZE} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Профиль',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={{ ios: focused ? 'person.crop.circle.fill' : 'person.crop.circle', android: 'account_circle' }}
              tintColor={color}
              size={ICON_SIZE}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: TabBarColors.background,
    borderTopColor: TabBarColors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 0,
  },
  label: { fontSize: 11, fontWeight: '600' },
  scene: { backgroundColor: '#F7F8FA' },
  image: { height: ICON_SIZE, width: ICON_SIZE },
});
