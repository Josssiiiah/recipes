import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Recipe } from '@/types/recipe';
import { normalizeRecipe } from '@/utils/recipe-normalization';
import type { ShoppingListItem } from '@/utils/shopping-list-store';

const LEGACY_RECIPES_KEY = 'recipe-library:recipes:v1';
const LEGACY_SHOPPING_LIST_KEY = 'recipe-library:shopping-list:v1';
const LEGACY_RECIPES_MIGRATED_KEY = 'recipe-library:legacy-recipes-migrated:v1';
const LEGACY_SHOPPING_LIST_MIGRATED_KEY = 'recipe-library:legacy-shopping-list-migrated:v1';

export async function readLegacyRecipesForMigration() {
  if (await hasMigrated(LEGACY_RECIPES_MIGRATED_KEY)) {
    return [];
  }

  return (await readLegacyJsonArray(LEGACY_RECIPES_KEY))
    .map(normalizeRecipe)
    .filter((recipe): recipe is Recipe => recipe !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markLegacyRecipesMigrated() {
  await AsyncStorage.setItem(LEGACY_RECIPES_MIGRATED_KEY, 'true');
}

export async function readLegacyShoppingListForMigration() {
  if (await hasMigrated(LEGACY_SHOPPING_LIST_MIGRATED_KEY)) {
    return [];
  }

  return (await readLegacyJsonArray(LEGACY_SHOPPING_LIST_KEY))
    .map(normalizeLegacyShoppingListItem)
    .filter((item): item is ShoppingListItem => item !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function markLegacyShoppingListMigrated() {
  await AsyncStorage.setItem(LEGACY_SHOPPING_LIST_MIGRATED_KEY, 'true');
}

async function hasMigrated(key: string) {
  return (await AsyncStorage.getItem(key)) === 'true';
}

async function readLegacyJsonArray(key: string) {
  try {
    if (typeof localStorage === 'undefined') {
      return [];
    }

    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to read legacy local data for migration.', { key, error });
    return [];
  }
}

function normalizeLegacyShoppingListItem(value: unknown): ShoppingListItem | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const item = value as Partial<ShoppingListItem>;
  const text = typeof item.text === 'string' ? item.text.trim() : '';

  if (!item.id || !text || !item.createdAt) {
    return null;
  }

  return {
    id: item.id,
    text,
    completed: Boolean(item.completed),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt ?? item.createdAt,
  };
}
