import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import type { Recipe } from '@/types/recipe';
import {
  assignRecipeToMealPlan,
  MEAL_SLOTS,
  parseDateKey,
  removeMealPlanEntry,
  slotMeta,
  useMealPlanEntries,
  type MealSlot,
} from '@/utils/meal-plan-store';
import { useRecipes } from '@/utils/recipe-store';

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
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

function formatDayHeading(dateKey: string) {
  const date = parseDateKey(dateKey);
  return `${WEEKDAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

export default function DayPlanScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const { date } = useLocalSearchParams<{ date: string }>();
  const dateKey = typeof date === 'string' ? date : '';

  const entries = useMealPlanEntries();
  const [pickerSlot, setPickerSlot] = useState<MealSlot | null>(null);
  const [assigningRecipeId, setAssigningRecipeId] = useState<string | null>(null);

  const entriesBySlot = useMemo(() => {
    const map: Record<MealSlot, typeof entries> = { breakfast: [], lunch: [], dinner: [] };
    for (const entry of entries) {
      if (entry.date === dateKey) {
        map[entry.slot].push(entry);
      }
    }
    return map;
  }, [entries, dateKey]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <View style={styles.topBarText}>
          <Text selectable style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {dateKey ? formatDayHeading(dateKey) : 'Day'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.iconButton,
            {
              backgroundColor: colorScheme === 'dark' ? '#26312a' : '#edf1ea',
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            tintColor={colors.muted}
            size={17}
          />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {MEAL_SLOTS.map((meta) => {
          const slotEntries = entriesBySlot[meta.slot];
          return (
            <View key={meta.slot} style={styles.slotSection}>
              <View style={styles.slotHeader}>
                <View style={[styles.dot, { backgroundColor: meta.color }]} />
                <Text style={[styles.slotTitle, { color: colors.text }]}>{meta.label}</Text>
              </View>

              {slotEntries.map((entry) => (
                <View
                  key={entry.id}
                  style={[
                    styles.entryRow,
                    { backgroundColor: colors.surface, borderColor: colors.line },
                  ]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${entry.recipeTitle}`}
                    onPress={() => router.push(`/recipe/${entry.recipeId}`)}
                    style={({ pressed }) => [styles.entryMain, { opacity: pressed ? 0.7 : 1 }]}>
                    <Text
                      selectable
                      style={[styles.entryTitle, { color: colors.text }]}
                      numberOfLines={2}>
                      {entry.recipeTitle}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${entry.recipeTitle}`}
                    hitSlop={8}
                    onPress={() => {
                      void removeMealPlanEntry(entry.id);
                    }}
                    style={({ pressed }) => [
                      styles.entryRemove,
                      {
                        backgroundColor: colorScheme === 'dark' ? '#26312a' : '#edf1ea',
                        opacity: pressed ? 0.65 : 1,
                      },
                    ]}>
                    <SymbolView
                      name={{ ios: 'xmark', android: 'close', web: 'close' }}
                      tintColor={colors.muted}
                      size={14}
                    />
                  </Pressable>
                </View>
              ))}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add a recipe to ${meta.label}`}
                onPress={() => {
                  setPickerSlot(meta.slot);
                }}
                style={({ pressed }) => [
                  styles.addRow,
                  { borderColor: colors.line, opacity: pressed ? 0.7 : 1 },
                ]}>
                <SymbolView
                  name={{ ios: 'plus', android: 'add', web: 'add' }}
                  tintColor={colors.tint}
                  size={16}
                />
                <Text style={[styles.addRowText, { color: colors.tint }]}>Add recipe</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      <RecipePickerModal
        visible={pickerSlot !== null}
        slot={pickerSlot}
        colorScheme={colorScheme}
        pendingRecipeId={assigningRecipeId}
        onClose={() => {
          if (assigningRecipeId) {
            return;
          }
          setPickerSlot(null);
        }}
        onSelect={(recipe) => {
          if (!pickerSlot || !dateKey || assigningRecipeId) {
            return;
          }

          setAssigningRecipeId(recipe.id);
          setPickerSlot(null);

          void assignRecipeToMealPlan({
            date: dateKey,
            slot: pickerSlot,
            recipeId: recipe.id,
            recipeTitle: recipe.title,
          })
            .catch((error) => {
              console.error('Failed to assign recipe from calendar day.', {
                date: dateKey,
                recipeId: recipe.id,
                slot: pickerSlot,
                error,
              });
              Alert.alert('Recipe not added', getMealPlanErrorMessage(error));
            })
            .finally(() => {
              setAssigningRecipeId(null);
            });
        }}
      />
    </View>
  );
}

function getMealPlanErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Could not add this recipe to the day. Check the connection and try again.';
}

function RecipePickerModal({
  visible,
  slot,
  colorScheme,
  pendingRecipeId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  slot: MealSlot | null;
  colorScheme: 'light' | 'dark';
  pendingRecipeId: string | null;
  onClose: () => void;
  onSelect: (recipe: Recipe) => void;
}) {
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const recipes = useRecipes();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return recipes;
    }
    return recipes.filter((recipe) => recipe.title.toLowerCase().includes(normalized));
  }, [recipes, query]);

  const heading = slot ? `Add to ${slotMeta(slot).label}` : 'Add recipe';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      onDismiss={() => setQuery('')}>
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <View style={styles.topBarText}>
            <Text selectable style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {heading}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close recipe picker"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [
              styles.iconButton,
              {
                backgroundColor: colorScheme === 'dark' ? '#26312a' : '#edf1ea',
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <SymbolView
              name={{ ios: 'xmark', android: 'close', web: 'close' }}
              tintColor={colors.muted}
              size={17}
            />
          </Pressable>
        </View>

        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.surface, borderColor: colors.line },
          ]}>
          <SymbolView
            name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
            tintColor={colors.muted}
            size={17}
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your recipes"
            placeholderTextColor={colors.muted}
            style={[styles.searchInput, { color: colors.text }]}
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>

        {filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <SymbolView
              name={{ ios: 'fork.knife', android: 'restaurant', web: 'restaurant' }}
              tintColor={colors.tint}
              size={34}
            />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {recipes.length === 0 ? 'No recipes yet' : 'No matches'}
            </Text>
            <Text style={[styles.emptyCopy, { color: colors.muted }]}>
              {recipes.length === 0
                ? 'Add recipes to your library, then plan them here.'
                : 'Try a different search.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.pickerList}
            keyboardShouldPersistTaps="handled">
            {filtered.map((recipe) => (
              <Pressable
                key={recipe.id}
                accessibilityRole="button"
                accessibilityLabel={`Add ${recipe.title}`}
                disabled={pendingRecipeId !== null}
                onPress={() => {
                  onSelect(recipe);
                }}
                style={({ pressed }) => [
                  styles.pickerRow,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.line,
                    opacity: pendingRecipeId !== null ? 0.55 : pressed ? 0.8 : 1,
                  },
                ]}>
                {recipe.imageUri ? (
                  <Image
                    source={recipe.imageUri}
                    style={styles.pickerThumb}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View
                    style={[
                      styles.pickerThumb,
                      styles.pickerThumbPlaceholder,
                      { backgroundColor: colorScheme === 'dark' ? '#26312a' : '#edf1ea' },
                    ]}>
                    <SymbolView
                      name={{ ios: 'fork.knife', android: 'restaurant', web: 'restaurant' }}
                      tintColor={colors.tint}
                      size={18}
                    />
                  </View>
                )}
                <View style={styles.pickerBody}>
                  <Text
                    style={[styles.pickerTitle, { color: colors.text }]}
                    numberOfLines={1}>
                    {recipe.title}
                  </Text>
                  {recipe.description ? (
                    <Text
                      style={[styles.pickerMeta, { color: colors.muted }]}
                      numberOfLines={1}>
                      {recipe.description}
                    </Text>
                  ) : null}
                </View>
                <SymbolView
                  name={{ ios: 'plus', android: 'add', web: 'add' }}
                  tintColor={colors.tint}
                  size={20}
                />
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  topBarText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  content: {
    gap: 24,
    padding: 18,
    paddingBottom: 48,
  },
  slotSection: {
    gap: 10,
  },
  slotHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  slotTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  dot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  entryRow: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 12,
  },
  entryMain: {
    flex: 1,
    minWidth: 0,
  },
  entryTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  entryRemove: {
    alignItems: 'center',
    borderRadius: 8,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  addRow: {
    alignItems: 'center',
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 13,
  },
  addRowText: {
    fontSize: 15,
    fontWeight: '800',
  },
  searchBar: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  pickerList: {
    gap: 10,
    padding: 18,
    paddingBottom: 48,
  },
  pickerRow: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    padding: 10,
  },
  pickerThumb: {
    borderRadius: 8,
    height: 48,
    width: 56,
  },
  pickerThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerBody: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  pickerMeta: {
    fontSize: 13,
  },
  emptyState: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 32,
    paddingTop: 64,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  emptyCopy: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
});
