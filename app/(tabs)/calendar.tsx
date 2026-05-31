import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { MEAL_SLOTS, toDateKey, useMealPlanEntries } from '@/utils/meal-plan-store';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

type DayCell = { key: string; date: Date } | null;

function buildMonthGrid(year: number, month: number): DayCell[] {
  const leadingBlanks = new Date(year, month, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: DayCell[] = [];
  for (let i = 0; i < leadingBlanks; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    cells.push({ key: toDateKey(date), date });
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

export default function CalendarScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const entries = useMealPlanEntries();

  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const cells = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  // dateKey -> set of slots with at least one entry, used for the cell dots.
  const slotsByDate = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const entry of entries) {
      (map[entry.date] ??= new Set()).add(entry.slot);
    }
    return map;
  }, [entries]);

  const plannedDays = useMemo(() => {
    const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;
    return Object.keys(slotsByDate).filter((key) => key.startsWith(monthPrefix)).length;
  }, [slotsByDate, viewYear, viewMonth]);

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  function goToMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function goToToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  }

  const horizontalPadding = width >= 800 ? 28 : 18;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: horizontalPadding, paddingTop: 22 },
        ]}>
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <Text selectable style={[styles.kicker, { color: colors.tint }]}>
              Meal Plan
            </Text>
            <Text selectable style={[styles.summary, { color: colors.muted }]}>
              {plannedDays === 0
                ? 'Tap a day to plan what you will cook.'
                : `${plannedDays} ${plannedDays === 1 ? 'day' : 'days'} planned this month`}
            </Text>
          </View>
          {!isCurrentMonth ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Jump to current month"
              onPress={goToToday}
              style={({ pressed }) => [
                styles.todayButton,
                {
                  backgroundColor: colorScheme === 'dark' ? '#1f2723' : '#eef2ec',
                  borderColor: colors.line,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <Text style={[styles.todayButtonText, { color: colors.tint }]}>Today</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.monthBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            hitSlop={12}
            onPress={() => goToMonth(-1)}
            style={({ pressed }) => [styles.monthArrow, { opacity: pressed ? 0.6 : 1 }]}>
            <SymbolView
              name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
              tintColor={colors.text}
              size={20}
            />
          </Pressable>
          <Text selectable style={[styles.monthTitle, { color: colors.text }]}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            hitSlop={12}
            onPress={() => goToMonth(1)}
            style={({ pressed }) => [styles.monthArrow, { opacity: pressed ? 0.6 : 1 }]}>
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              tintColor={colors.text}
              size={20}
            />
          </Pressable>
        </View>

        <View style={styles.weekdayRow}>
          {WEEKDAY_LABELS.map((label, index) => (
            <View key={index} style={styles.weekdayCell}>
              <Text style={[styles.weekdayLabel, { color: colors.muted }]}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.grid, { borderColor: colors.line }]}>
          {cells.map((cell, index) => {
            if (!cell) {
              return (
                <View
                  key={`blank-${index}`}
                  style={[styles.dayCell, { borderColor: colors.line }]}
                />
              );
            }

            const isToday = cell.key === todayKey;
            const activeSlots = slotsByDate[cell.key];

            return (
              <Pressable
                key={cell.key}
                accessibilityRole="button"
                accessibilityLabel={`Plan meals for ${MONTH_NAMES[viewMonth]} ${cell.date.getDate()}`}
                onPress={() => router.push(`/calendar/${cell.key}`)}
                style={({ pressed }) => [
                  styles.dayCell,
                  {
                    borderColor: colors.line,
                    backgroundColor: pressed
                      ? colorScheme === 'dark'
                        ? '#1c241d'
                        : '#eef2ec'
                      : 'transparent',
                  },
                ]}>
                <View
                  style={[
                    styles.dayNumberWrap,
                    isToday && { backgroundColor: colors.tint },
                  ]}>
                  <Text
                    style={[
                      styles.dayNumber,
                      { color: isToday ? (colorScheme === 'dark' ? '#10150f' : '#ffffff') : colors.text },
                    ]}>
                    {cell.date.getDate()}
                  </Text>
                </View>
                <View style={styles.dots}>
                  {MEAL_SLOTS.map((meta) =>
                    activeSlots?.has(meta.slot) ? (
                      <View key={meta.slot} style={[styles.dot, { backgroundColor: meta.color }]} />
                    ) : null,
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.legend, { borderColor: colors.line }]}>
          {MEAL_SLOTS.map((meta) => (
            <View key={meta.slot} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: meta.color }]} />
              <Text style={[styles.legendLabel, { color: colors.muted }]}>{meta.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    gap: 18,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  titleBlock: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  summary: {
    fontSize: 15,
    lineHeight: 20,
  },
  todayButton: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  todayButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  monthBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  monthArrow: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayCell: {
    alignItems: 'center',
    flex: 1,
  },
  weekdayLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  grid: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
  },
  dayCell: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    gap: 6,
    height: 64,
    justifyContent: 'center',
    width: `${100 / 7}%`,
  },
  dayNumberWrap: {
    alignItems: 'center',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '600',
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
  },
  dot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  legend: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 20,
    justifyContent: 'center',
    paddingTop: 16,
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  legendLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
