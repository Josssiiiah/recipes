import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Pressable, useColorScheme, View, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/Colors';
import { TAB_BAR_CONTENT_HEIGHT } from '@/constants/tab-bar';

const ICON_SIZE = 20;
const ICON_SLOT_SIZE = 24;

type TabIconName = ComponentProps<typeof SymbolView>['name'];

type TabConfig = {
  name: string;
  href: '/' | '/new' | '/list' | '/calendar';
  label: string;
  icon: TabIconName;
  selectedIcon: TabIconName;
};

const TABS: TabConfig[] = [
  {
    name: 'index',
    href: '/',
    label: 'Library',
    icon: { ios: 'square.grid.2x2', android: 'grid_view', web: 'grid_view' },
    selectedIcon: { ios: 'rectangle.grid.2x2.fill', android: 'grid_view', web: 'grid_view' },
  },
  {
    name: 'new',
    href: '/new',
    label: 'New',
    icon: { ios: 'plus.circle', android: 'add_circle', web: 'add_circle' },
    selectedIcon: { ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' },
  },
  {
    name: 'list',
    href: '/list',
    label: 'List',
    icon: { ios: 'cart', android: 'shopping_cart', web: 'shopping_cart' },
    selectedIcon: { ios: 'cart.fill', android: 'shopping_cart', web: 'shopping_cart' },
  },
  {
    name: 'calendar',
    href: '/calendar',
    label: 'Calendar',
    icon: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
    selectedIcon: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  },
];

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const insets = useSafeAreaInsets();

  return (
    <Tabs style={{ flex: 1, backgroundColor: colors.background }}>
      <TabSlot
        style={{
          flex: 1,
          backgroundColor: colors.background,
          paddingBottom: TAB_BAR_CONTENT_HEIGHT + Math.max(insets.bottom, 12),
        }}
      />
      <TabList asChild>
        <CustomTabList>
          {TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TabButton icon={tab.icon} selectedIcon={tab.selectedIcon}>
                {tab.label}
              </TabButton>
            </TabTrigger>
          ))}
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

type TabButtonProps = TabTriggerSlotProps & {
  icon: TabIconName;
  selectedIcon: TabIconName;
};

function TabButton({ children, icon, selectedIcon, isFocused, ...props }: TabButtonProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const tintColor = isFocused ? colors.tabIconSelected : colors.tabIconDefault;

  return (
    <Pressable {...props} style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}>
      <View style={[styles.tabButtonView, isFocused && { backgroundColor: colors.background }]}>
        <View style={styles.iconSlot}>
          <SymbolView name={isFocused ? selectedIcon : icon} size={ICON_SIZE} tintColor={tintColor} />
        </View>
        <Text style={[styles.tabLabel, { color: isFocused ? colors.tint : colors.muted }]}>{children}</Text>
      </View>
    </Pressable>
  );
}

function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const insets = useSafeAreaInsets();

  return (
    <View
      {...props}
      style={[
        styles.tabListContainer,
        { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 12) },
      ]}>
      <View style={[styles.innerContainer, { backgroundColor: colors.surface }]}>{props.children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    paddingHorizontal: 12,
    paddingTop: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    maxWidth: 480,
    width: '100%',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButton: {
    flex: 1,
  },
  tabButtonView: {
    alignItems: 'center',
    flexDirection: 'column',
    gap: 4,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  iconSlot: {
    width: ICON_SLOT_SIZE,
    height: ICON_SLOT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
