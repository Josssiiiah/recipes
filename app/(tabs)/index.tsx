import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LibrarySearchBar } from '@/components/library-search-bar';
import { RecipeCard } from '@/components/recipe-card';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { filterRecipesByQuery } from '@/utils/library-search';
import { setLibraryViewMode, useLibraryViewMode, type LibraryViewMode } from '@/utils/library-view';
import { deleteRecipe, useRecipes } from '@/utils/recipe-store';

function ViewModeButton({
  mode,
  selectedMode,
  colorScheme,
  onPress,
}: {
  mode: LibraryViewMode;
  selectedMode: LibraryViewMode;
  colorScheme: 'light' | 'dark';
  onPress: (mode: LibraryViewMode) => void;
}) {
  const colors = Colors[colorScheme];
  const selected = mode === selectedMode;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={mode === 'grid' ? 'Grid view' : 'List view'}
      onPress={() => onPress(mode)}
      style={({ pressed }) => [
        styles.viewModeButton,
        {
          backgroundColor: selected
            ? colorScheme === 'dark'
              ? '#2a3530'
              : '#e4ebe5'
            : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <SymbolView
        name={
          mode === 'grid'
            ? { ios: 'square.grid.2x2', android: 'grid_view', web: 'grid_view' }
            : { ios: 'list.bullet', android: 'format_list_bulleted', web: 'format_list_bulleted' }
        }
        tintColor={selected ? colors.tint : colors.muted}
        size={18}
      />
    </Pressable>
  );
}

export default function LibraryScreen() {
  const recipes = useRecipes();
  const viewMode = useLibraryViewMode();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [searchDraft, setSearchDraft] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const columns = viewMode === 'list' ? 1 : 2;

  useEffect(() => {
    const showEvent = process.env.EXPO_OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = process.env.EXPO_OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const displayedRecipes = useMemo(
    () => filterRecipesByQuery(recipes, appliedSearch),
    [recipes, appliedSearch],
  );

  function handleSearch() {
    setAppliedSearch(searchDraft.trim());
  }

  const searchDockPaddingBottom =
    keyboardHeight > 0 ? keyboardHeight + 12 : Math.max(insets.bottom, 12) + 12;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FlatList
          style={styles.list}
          key={`${viewMode}-${columns}`}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          data={displayedRecipes}
      keyExtractor={(recipe) => recipe.id}
      numColumns={columns}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text selectable style={[styles.kicker, { color: colors.tint }]}>
              Recipe Library
            </Text>
            {recipes.length > 0 ? (
              <View
                style={[
                  styles.viewToggle,
                  {
                    backgroundColor: colorScheme === 'dark' ? '#1f2723' : '#eef2ec',
                    borderColor: colors.line,
                  },
                ]}>
                <ViewModeButton
                  mode="grid"
                  selectedMode={viewMode}
                  colorScheme={colorScheme}
                  onPress={setLibraryViewMode}
                />
                <ViewModeButton
                  mode="list"
                  selectedMode={viewMode}
                  colorScheme={colorScheme}
                  onPress={setLibraryViewMode}
                />
              </View>
            ) : null}
          </View>
        </View>
      }
      ListEmptyComponent={
        recipes.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text selectable style={[styles.emptyTitle, { color: colors.text }]}>
              Start with a recipe
            </Text>
            <Text selectable style={[styles.emptyCopy, { color: colors.muted }]}>
              Describe what you want to make, generate the ingredient list, then save it to your library.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/new')}
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.tint, opacity: pressed ? 0.75 : 1 },
              ]}>
              <SymbolView
                name={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' }}
                tintColor={colorScheme === 'dark' ? '#102015' : '#ffffff'}
                size={18}
              />
              <Text style={[styles.primaryButtonText, { color: colorScheme === 'dark' ? '#102015' : '#ffffff' }]}>
                New recipe
              </Text>
            </Pressable>
          </View>
        ) : appliedSearch ? (
          <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text selectable style={[styles.emptyTitle, { color: colors.text }]}>
              No matches
            </Text>
            <Text selectable style={[styles.emptyCopy, { color: colors.muted }]}>
              Nothing in your library matched “{appliedSearch}”. Try a different title or ingredient.
            </Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <View style={[viewMode === 'list' ? styles.listItem : styles.gridItem, { width: `${100 / columns}%` }]}>
          <RecipeCard
            recipe={item}
            colorScheme={colorScheme}
            variant={viewMode}
            gridColumns={columns === 2 ? 2 : 1}
            onPress={() => router.push(`/recipe/${item.id}`)}
            onDelete={deleteRecipe}
          />
        </View>
      )}
      contentContainerStyle={[
        styles.content,
        {
          backgroundColor: colors.background,
          paddingHorizontal: width >= 800 ? 28 : 18,
        },
        recipes.length === 0 || appliedSearch ? styles.emptyContent : null,
      ]}
      />
      <View
        style={[
          styles.searchDock,
          {
            paddingBottom: searchDockPaddingBottom,
            paddingHorizontal: width >= 800 ? 28 : 18,
          },
        ]}>
        <LibrarySearchBar
          value={searchDraft}
          colorScheme={colorScheme}
          onChangeText={setSearchDraft}
          onSearch={handleSearch}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  searchDock: {
    gap: 0,
    paddingTop: 8,
  },
  content: {
    gap: 18,
    minHeight: '100%',
    paddingBottom: 32,
    paddingTop: 22,
  },
  emptyContent: {
    flexGrow: 1,
  },
  emptyCopy: {
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 430,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 16,
    justifyContent: 'center',
    minHeight: 280,
    padding: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  gridItem: {
    minWidth: 0,
    paddingBottom: 14,
    paddingHorizontal: 5,
    paddingTop: 2,
  },
  header: {
    gap: 8,
    paddingBottom: 6,
  },
  headerTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kicker: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  listItem: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  viewModeButton: {
    alignItems: 'center',
    borderRadius: 6,
    height: 34,
    justifyContent: 'center',
    width: 38,
  },
  viewToggle: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 2,
    padding: 3,
  },
});
