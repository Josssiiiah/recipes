import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  type LayoutChangeEvent,
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
import type { Recipe, RecipeGenerationJob } from '@/types/recipe';
import { createLibrarySearchIndex } from '@/utils/library-search';
import { useKeyboardDockPadding } from '@/utils/use-keyboard-dock-padding';
import {
  setLibrarySortMode,
  setLibraryViewMode,
  useLibrarySortMode,
  useLibraryViewMode,
  type LibrarySortMode,
  type LibraryViewMode,
} from '@/utils/library-view';
import {
  generateAndStoreRecipeImage,
  recipeNeedsImageBackfill,
} from '@/utils/recipe-image-jobs';
import { useRecipeGenerationJobs, useRecipes } from '@/utils/recipe-store';

const sortLabels: Record<LibrarySortMode, string> = {
  recent: 'Newest',
  alphabetical: 'A-Z',
};

function sortRecipes(recipes: Recipe[], sortMode: LibrarySortMode) {
  return [...recipes].sort((a, b) => {
    if (sortMode === 'alphabetical') {
      const titleCompare = a.title.localeCompare(b.title, undefined, {
        sensitivity: 'base',
        numeric: true,
      });

      return titleCompare || b.createdAt.localeCompare(a.createdAt);
    }

    return b.createdAt.localeCompare(a.createdAt);
  });
}

function recipeGenerationJobLabel(job: RecipeGenerationJob) {
  return job.kind === 'recipe_image' ? 'recipe from image' : 'recipe';
}

function RecipeGenerationStatus({
  jobs,
  colorScheme,
}: {
  jobs: RecipeGenerationJob[];
  colorScheme: 'light' | 'dark';
}) {
  const colors = Colors[colorScheme];
  const failedJob = jobs.find((job) => job.status === 'failed') ?? null;
  const activeCount = jobs.filter((job) => job.status === 'pending' || job.status === 'running').length;
  const title = failedJob
    ? `Could not generate ${recipeGenerationJobLabel(failedJob)}`
    : activeCount === 1
      ? 'Generating recipe'
      : `Generating ${activeCount} recipes`;
  const message = failedJob
    ? failedJob?.error || 'The recipe generator failed before saving anything to your library.'
    : 'This will appear in your library when it finishes.';

  return (
    <View
      style={[
        styles.generationStatus,
        {
          backgroundColor: colors.surface,
          borderColor: failedJob ? colors.accent : colors.line,
        },
      ]}>
      <SymbolView
        name={
          failedJob
            ? { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }
            : { ios: 'clock.arrow.circlepath', android: 'sync', web: 'sync' }
        }
        tintColor={failedJob ? colors.accent : colors.tint}
        size={20}
      />
      <View style={styles.generationStatusCopy}>
        <Text selectable style={[styles.generationStatusTitle, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text selectable style={[styles.generationStatusMessage, { color: colors.muted }]} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </View>
  );
}

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

function SortModeButton({
  mode,
  selectedMode,
  colorScheme,
  onPress,
}: {
  mode: LibrarySortMode;
  selectedMode: LibrarySortMode;
  colorScheme: 'light' | 'dark';
  onPress: (mode: LibrarySortMode) => void;
}) {
  const colors = Colors[colorScheme];
  const selected = mode === selectedMode;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={mode === 'recent' ? 'Most recently added' : 'Alphabetical order'}
      onPress={() => onPress(mode)}
      style={({ pressed }) => [
        styles.sortModeButton,
        {
          backgroundColor: selected
            ? colorScheme === 'dark'
              ? '#2a3530'
              : '#e4ebe5'
            : 'transparent',
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      {mode === 'recent' ? (
        <SymbolView
          name={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
          tintColor={selected ? colors.tint : colors.muted}
          size={16}
        />
      ) : null}
      <Text style={[styles.sortModeLabel, { color: selected ? colors.tint : colors.muted }]}>
        {sortLabels[mode]}
      </Text>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const recipes = useRecipes();
  const recipeGenerationJobs = useRecipeGenerationJobs();
  const viewMode = useLibraryViewMode();
  const sortMode = useLibrarySortMode();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());
  const searchDockPaddingBottom = useKeyboardDockPadding();
  const [backfillTick, setBackfillTick] = useState(0);
  const [listViewportHeight, setListViewportHeight] = useState(0);
  const [listContentHeight, setListContentHeight] = useState(0);
  const isMounted = useRef(true);
  const activeBackfillRecipeId = useRef<string | null>(null);
  const columns = viewMode === 'list' ? 1 : 2;
  const listScrollEnabled =
    listViewportHeight > 0 && listContentHeight > listViewportHeight + 1;

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (activeBackfillRecipeId.current) {
      return;
    }

    const recipe = recipes.find(recipeNeedsImageBackfill);

    if (!recipe) {
      return;
    }

    activeBackfillRecipeId.current = recipe.id;
    generateAndStoreRecipeImage(recipe, { markPending: true }).finally(() => {
      activeBackfillRecipeId.current = null;
      if (isMounted.current) {
        setBackfillTick((value) => value + 1);
      }
    });
  }, [recipes, backfillTick]);

  const searchIndex = useMemo(() => createLibrarySearchIndex(recipes), [recipes]);
  const searchResults = useMemo(() => {
    return searchIndex.search(deferredSearchQuery);
  }, [searchIndex, deferredSearchQuery]);
  const displayedRecipes = useMemo(() => {
    return deferredSearchQuery ? searchResults : sortRecipes(searchResults, sortMode);
  }, [deferredSearchQuery, searchResults, sortMode]);
  const visibleGenerationJobs = useMemo(() => {
    return recipeGenerationJobs.filter(
      (job) =>
        (job.kind === 'recipe_input' || job.kind === 'recipe_image') &&
        (job.status === 'pending' || job.status === 'running' || job.status === 'failed'),
    );
  }, [recipeGenerationJobs]);
  const isSearching = deferredSearchQuery.length > 0;
  const searchResultLabel = `${displayedRecipes.length} ${
    displayedRecipes.length === 1 ? 'result' : 'results'
  } for “${deferredSearchQuery}”`;

  function handleSearchSubmit() {
    Keyboard.dismiss();
  }

  function handleListLayout(event: LayoutChangeEvent) {
    setListViewportHeight(event.nativeEvent.layout.height);
  }

  function handleContentSizeChange(_contentWidth: number, contentHeight: number) {
    setListContentHeight(contentHeight);
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <FlatList
        style={styles.list}
        key={`${viewMode}-${columns}`}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        onLayout={handleListLayout}
        onContentSizeChange={handleContentSizeChange}
        scrollEnabled={listScrollEnabled}
        data={displayedRecipes}
        keyExtractor={(recipe) => recipe.id}
        numColumns={columns}
        ListHeaderComponent={
          recipes.length > 0 || visibleGenerationJobs.length > 0 ? (
            <View style={styles.headerStack}>
              {visibleGenerationJobs.length > 0 ? (
                <RecipeGenerationStatus jobs={visibleGenerationJobs} colorScheme={colorScheme} />
              ) : null}
              {recipes.length > 0 ? (
                <View style={styles.header}>
                  {isSearching ? (
                    <View style={styles.searchSummary}>
                      <Text selectable style={[styles.searchSummaryText, { color: colors.muted }]} numberOfLines={1}>
                        {searchResultLabel}
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.sortToggle,
                        {
                          backgroundColor: colorScheme === 'dark' ? '#1f2723' : '#eef2ec',
                          borderColor: colors.line,
                        },
                      ]}>
                      <SortModeButton
                        mode="recent"
                        selectedMode={sortMode}
                        colorScheme={colorScheme}
                        onPress={setLibrarySortMode}
                      />
                      <SortModeButton
                        mode="alphabetical"
                        selectedMode={sortMode}
                        colorScheme={colorScheme}
                        onPress={setLibrarySortMode}
                      />
                    </View>
                  )}
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
                </View>
              ) : null}
            </View>
          ) : null
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
          ) : isSearching ? (
            <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.line }]}>
              <Text selectable style={[styles.emptyTitle, { color: colors.text }]}>
                No matches
              </Text>
              <Text selectable style={[styles.emptyCopy, { color: colors.muted }]}>
                Nothing in your library matched “{deferredSearchQuery}”. Try a different title, ingredient, or note.
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
              onRetryImage={(recipe) => {
                void generateAndStoreRecipeImage(recipe, { markPending: true });
              }}
            />
          </View>
        )}
        contentContainerStyle={[
          styles.content,
          {
            backgroundColor: colors.background,
            paddingHorizontal: width >= 800 ? 28 : 18,
          },
          recipes.length === 0 || (isSearching && displayedRecipes.length === 0) ? styles.emptyContent : null,
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
          value={searchQuery}
          colorScheme={colorScheme}
          onChangeText={setSearchQuery}
          onSubmit={handleSearchSubmit}
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
  searchSummary: {
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
    minWidth: 0,
    paddingRight: 14,
  },
  searchSummaryText: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  content: {
    gap: 18,
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
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
  headerStack: {
    gap: 12,
  },
  generationStatus: {
    alignItems: 'flex-start',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  generationStatusCopy: {
    flex: 1,
    minWidth: 0,
  },
  generationStatusMessage: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  generationStatusTitle: {
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
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
  sortModeButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 34,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 10,
  },
  sortModeLabel: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16,
  },
  sortToggle: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 2,
    maxWidth: 240,
    minWidth: 196,
    padding: 3,
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
