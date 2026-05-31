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

import Colors from '@/constants/Colors';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <Tabs style={{ flex: 1, backgroundColor: colors.background }}>
      <TabSlot style={{ flex: 1, backgroundColor: colors.background }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="index" href="/" asChild>
            <TabButton
              iconName={{
                ios: 'rectangle.grid.2x2.fill',
                android: 'grid_view',
                web: 'grid_view',
              }}>
              Library
            </TabButton>
          </TabTrigger>
          <TabTrigger name="new" href="/new" asChild>
            <TabButton iconName={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' }}>
              New
            </TabButton>
          </TabTrigger>
          <TabTrigger name="list" href="/list" asChild>
            <TabButton
              iconName={{
                ios: 'cart.fill',
                android: 'shopping_cart',
                web: 'shopping_cart',
              }}>
              List
            </TabButton>
          </TabTrigger>
          <TabTrigger name="calendar" href="/calendar" asChild>
            <TabButton
              iconName={{
                ios: 'calendar',
                android: 'calendar_month',
                web: 'calendar_month',
              }}>
              Calendar
            </TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

type TabButtonProps = TabTriggerSlotProps & {
  iconName: ComponentProps<typeof SymbolView>['name'];
};

function TabButton({ children, iconName, isFocused, ...props }: TabButtonProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const tintColor = isFocused ? colors.tabIconSelected : colors.tabIconDefault;

  return (
    <Pressable {...props} style={({ pressed }) => [styles.tabButton, pressed && styles.pressed]}>
      <View style={[styles.tabButtonView, isFocused && { backgroundColor: colors.surface }]}>
        <View style={styles.iconSlot}>
          <SymbolView name={iconName} size={20} tintColor={tintColor} />
        </View>
        <Text style={[styles.tabLabel, { color: isFocused ? colors.text : colors.muted }]}>{children}</Text>
      </View>
    </Pressable>
  );
}

function CustomTabList(props: TabListProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <View {...props} style={[styles.tabListContainer, { backgroundColor: colors.background }]}>
      <View style={[styles.innerContainer, { backgroundColor: colors.surface }]}>{props.children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    padding: 12,
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
    gap: 8,
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
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  iconSlot: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
