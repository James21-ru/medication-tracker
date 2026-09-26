import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { Platform } from 'react-native';

import { TabBarColors } from '@/constants/theme';

// On iOS the system Liquid Glass bar picks icon and label colors that stay readable whether the glass
// is light or darkened by the content behind it, so no colors are forced there. Android gets explicit
// Material colors.
const androidAppearance =
  Platform.OS === 'android'
    ? {
        backgroundColor: TabBarColors.background,
        indicatorColor: TabBarColors.indicator,
        iconColor: { default: TabBarColors.idle, selected: TabBarColors.selected },
        labelStyle: {
          default: { color: TabBarColors.idle },
          selected: { color: TabBarColors.selected, fontWeight: '600' as const },
        },
      }
    : {};

export default function AppTabs() {
  return (
    <NativeTabs {...androidAppearance}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Сегодня</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Лекарства</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="lifetab">
        <NativeTabs.Trigger.Label>LifeTab</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'pills', selected: 'pills.fill' }}
          md={{ default: 'medication', selected: 'medication' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>Профиль</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md={{ default: 'account_circle', selected: 'account_circle' }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
