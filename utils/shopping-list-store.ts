import { useSyncExternalStore } from 'react';

import {
  markLegacyShoppingListMigrated,
  readLegacyShoppingListForMigration,
} from '@/utils/legacy-local-data';
import {
  addInventoryItemIfMissing,
  readAddCompletedShoppingItemsToInventorySetting,
} from '@/utils/inventory-store';
import {
  clearStoredCompletedShoppingListItems,
  createStoredShoppingListItem,
  deleteStoredShoppingListItem,
  fetchStoredShoppingListItems,
  toggleStoredShoppingListItem,
  type StoredShoppingListItem,
} from '@/utils/recipe-api';

export type ShoppingListItem = StoredShoppingListItem;

const listeners = new Set<() => void>();

let loaded = false;
let loading: Promise<void> | null = null;
let snapshot: ShoppingListItem[] = [];

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function readItems() {
  if (!loaded) {
    void refreshShoppingListItems();
  }

  return snapshot;
}

function replaceSnapshot(items: ShoppingListItem[]) {
  snapshot = items;
  loaded = true;
  emit();
}

export async function refreshShoppingListItems() {
  if (loading) {
    return loading;
  }

  loading = (async () => {
    try {
      const items = await fetchStoredShoppingListItems();

      if (items.length === 0) {
        const migrated = await migrateLegacyShoppingListItems();

        if (migrated.length > 0) {
          replaceSnapshot(migrated);
          return;
        }
      }

      replaceSnapshot(items);
    } catch (error) {
      console.error('Failed to read shopping-list items from Neon Postgres.', { error });
      loaded = true;
      emit();
    } finally {
      loading = null;
    }
  })();

  return loading;
}

async function migrateLegacyShoppingListItems() {
  const legacyItems = await readLegacyShoppingListForMigration();

  if (legacyItems.length === 0) {
    return [];
  }

  console.info('Migrating legacy local shopping-list items to remote recipe store.', {
    count: legacyItems.length,
  });

  const results = await Promise.allSettled(
    legacyItems.map((item) => createStoredShoppingListItem(item)),
  );
  const savedItems = results
    .map((result) => (result.status === 'fulfilled' ? result.value : null))
    .filter((item): item is ShoppingListItem => item !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (savedItems.length === legacyItems.length) {
    await markLegacyShoppingListMigrated();
  } else {
    console.error('Failed to migrate every legacy local shopping-list item.', {
      expectedCount: legacyItems.length,
      savedCount: savedItems.length,
    });
  }

  return savedItems;
}

export function subscribeShoppingList(listener: () => void) {
  listeners.add(listener);
  void refreshShoppingListItems();
  return () => listeners.delete(listener);
}

export function getShoppingListItems() {
  return readItems();
}

export function useShoppingListItems() {
  return useSyncExternalStore(subscribeShoppingList, getShoppingListItems, () => []);
}

export async function addShoppingListItem(text: string) {
  const normalizedText = text.trim();

  if (!normalizedText) {
    return null;
  }

  const now = new Date().toISOString();
  const item: ShoppingListItem = {
    id: createId(),
    text: normalizedText,
    completed: false,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const saved = await createStoredShoppingListItem(item);
    replaceSnapshot([...snapshot, saved]);
    return saved;
  } catch (error) {
    console.error('Failed to add shopping-list item to Neon Postgres.', {
      itemId: item.id,
      error,
    });
    return null;
  }
}

export async function toggleShoppingListItem(id: string) {
  const previous = snapshot.find((item) => item.id === id);

  try {
    const updated = await toggleStoredShoppingListItem(id);

    if (!updated) {
      return;
    }

    replaceSnapshot(snapshot.map((item) => (item.id === id ? updated : item)));

    if (updated.completed && !previous?.completed) {
      const shouldAddToInventory = await readAddCompletedShoppingItemsToInventorySetting();

      if (shouldAddToInventory) {
        const inventoryItem = await addInventoryItemIfMissing(updated.text);

        if (!inventoryItem) {
          console.error('Failed to add completed shopping-list item to inventory.', {
            shoppingListItemId: updated.id,
          });
        }
      }
    }
  } catch (error) {
    console.error('Failed to toggle shopping-list item in Neon Postgres.', {
      itemId: id,
      error,
    });
  }
}

export async function deleteShoppingListItem(id: string) {
  try {
    await deleteStoredShoppingListItem(id);
    replaceSnapshot(snapshot.filter((item) => item.id !== id));
  } catch (error) {
    console.error('Failed to delete shopping-list item from Neon Postgres.', {
      itemId: id,
      error,
    });
  }
}

export async function clearCompletedShoppingListItems() {
  try {
    await clearStoredCompletedShoppingListItems();
    replaceSnapshot(snapshot.filter((item) => !item.completed));
  } catch (error) {
    console.error('Failed to clear completed shopping-list items from Neon Postgres.', { error });
  }
}
