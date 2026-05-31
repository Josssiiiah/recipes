import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import {
  createStoredInventoryItem,
  deleteStoredInventoryItem,
  fetchStoredInventoryItems,
  type StoredInventoryItem,
} from '@/utils/recipe-api';

export type InventoryItem = StoredInventoryItem;
export type InventoryViewMode = 'grid' | 'list';

const INVENTORY_VIEW_MODE_KEY = 'recipe-library:inventory-view-mode:v1';
const ADD_COMPLETED_SHOPPING_ITEMS_TO_INVENTORY_KEY =
  'recipe-library:add-completed-shopping-items-to-inventory:v1';
const listeners = new Set<() => void>();

let itemsLoaded = false;
let itemsLoading: Promise<void> | null = null;
let itemsSnapshot: InventoryItem[] = [];
let viewModeLoaded = false;
let viewModeLoading: Promise<void> | null = null;
let viewModeRevision = 0;
let viewModeSnapshot: InventoryViewMode = 'grid';
let addCompletedShoppingItemsToInventoryLoaded = false;
let addCompletedShoppingItemsToInventoryLoading: Promise<void> | null = null;
let addCompletedShoppingItemsToInventoryRevision = 0;
let addCompletedShoppingItemsToInventorySnapshot = true;

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function toDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function todayDateOnly() {
  return toDateOnly(new Date());
}

function emit() {
  listeners.forEach((listener) => listener());
}

function readItems() {
  if (!itemsLoaded) {
    void refreshInventoryItems();
  }

  return itemsSnapshot;
}

function readViewMode(): InventoryViewMode {
  if (viewModeLoaded) {
    return viewModeSnapshot;
  }

  void loadViewMode();
  return viewModeSnapshot;
}

function readAddCompletedShoppingItemsToInventory(): boolean {
  if (addCompletedShoppingItemsToInventoryLoaded) {
    return addCompletedShoppingItemsToInventorySnapshot;
  }

  void loadAddCompletedShoppingItemsToInventory();
  return addCompletedShoppingItemsToInventorySnapshot;
}

function loadViewMode() {
  if (viewModeLoaded || viewModeLoading) {
    return viewModeLoading;
  }

  const revision = viewModeRevision;
  viewModeLoading = (async () => {
    try {
      const raw = await AsyncStorage.getItem(INVENTORY_VIEW_MODE_KEY);
      const nextMode = raw === 'list' ? 'list' : 'grid';

      if (revision === viewModeRevision && viewModeSnapshot !== nextMode) {
        viewModeSnapshot = nextMode;
        emit();
      }
    } catch (error) {
      console.error('Failed to read inventory view mode from async storage.', error);
    } finally {
      viewModeLoaded = true;
      viewModeLoading = null;
    }
  })();

  return viewModeLoading;
}

function loadAddCompletedShoppingItemsToInventory() {
  if (
    addCompletedShoppingItemsToInventoryLoaded ||
    addCompletedShoppingItemsToInventoryLoading
  ) {
    return addCompletedShoppingItemsToInventoryLoading;
  }

  const revision = addCompletedShoppingItemsToInventoryRevision;
  addCompletedShoppingItemsToInventoryLoading = (async () => {
    try {
      const raw = await AsyncStorage.getItem(ADD_COMPLETED_SHOPPING_ITEMS_TO_INVENTORY_KEY);
      const nextValue = raw === 'false' ? false : true;

      if (
        revision === addCompletedShoppingItemsToInventoryRevision &&
        addCompletedShoppingItemsToInventorySnapshot !== nextValue
      ) {
        addCompletedShoppingItemsToInventorySnapshot = nextValue;
        emit();
      }
    } catch (error) {
      console.error(
        'Failed to read inventory auto-add setting from async storage.',
        error,
      );
    } finally {
      addCompletedShoppingItemsToInventoryLoaded = true;
      addCompletedShoppingItemsToInventoryLoading = null;
    }
  })();

  return addCompletedShoppingItemsToInventoryLoading;
}

function replaceItemsSnapshot(items: InventoryItem[]) {
  itemsSnapshot = items;
  itemsLoaded = true;
  emit();
}

function writeViewMode(mode: InventoryViewMode) {
  viewModeSnapshot = mode;
  viewModeLoaded = true;
  viewModeRevision += 1;

  void AsyncStorage.setItem(INVENTORY_VIEW_MODE_KEY, mode).catch((error: unknown) => {
    console.error('Failed to persist inventory view mode to async storage.', error);
  });

  emit();
}

function writeAddCompletedShoppingItemsToInventory(enabled: boolean) {
  addCompletedShoppingItemsToInventorySnapshot = enabled;
  addCompletedShoppingItemsToInventoryLoaded = true;
  addCompletedShoppingItemsToInventoryRevision += 1;

  void AsyncStorage.setItem(
    ADD_COMPLETED_SHOPPING_ITEMS_TO_INVENTORY_KEY,
    enabled ? 'true' : 'false',
  ).catch((error: unknown) => {
    console.error('Failed to persist inventory auto-add setting to async storage.', error);
  });

  emit();
}

export async function refreshInventoryItems() {
  if (itemsLoading) {
    return itemsLoading;
  }

  itemsLoading = (async () => {
    try {
      replaceItemsSnapshot(await fetchStoredInventoryItems());
    } catch (error) {
      console.error('Failed to read inventory items from Neon Postgres.', error);
      itemsLoaded = true;
      emit();
    } finally {
      itemsLoading = null;
    }
  })();

  return itemsLoading;
}

export function subscribeInventory(listener: () => void) {
  listeners.add(listener);
  void refreshInventoryItems();
  return () => listeners.delete(listener);
}

export function getInventoryItems() {
  return readItems();
}

export function getInventoryViewMode() {
  return readViewMode();
}

export function getAddCompletedShoppingItemsToInventory() {
  return readAddCompletedShoppingItemsToInventory();
}

export async function readAddCompletedShoppingItemsToInventorySetting() {
  await loadAddCompletedShoppingItemsToInventory();
  return addCompletedShoppingItemsToInventorySnapshot;
}

export function useInventoryItems() {
  return useSyncExternalStore(subscribeInventory, getInventoryItems, () => []);
}

export function useInventoryViewMode() {
  return useSyncExternalStore(subscribeInventory, getInventoryViewMode, () => 'grid' as InventoryViewMode);
}

export function useAddCompletedShoppingItemsToInventory() {
  return useSyncExternalStore(
    subscribeInventory,
    getAddCompletedShoppingItemsToInventory,
    () => true,
  );
}

export function setInventoryViewMode(mode: InventoryViewMode) {
  if (readViewMode() === mode) {
    return;
  }

  writeViewMode(mode);
}

export function setAddCompletedShoppingItemsToInventory(enabled: boolean) {
  if (readAddCompletedShoppingItemsToInventory() === enabled) {
    return;
  }

  writeAddCompletedShoppingItemsToInventory(enabled);
}

export async function addInventoryItem(text: string) {
  const normalizedText = text.trim();

  if (!normalizedText) {
    return null;
  }

  const today = todayDateOnly();
  const item: InventoryItem = {
    id: createId(),
    text: normalizedText,
    createdAt: today,
    updatedAt: today,
  };

  try {
    const saved = await createStoredInventoryItem(item);
    replaceItemsSnapshot([...itemsSnapshot, saved].sort(sortInventoryItems));
    return saved;
  } catch (error) {
    console.error('Failed to add inventory item to Neon Postgres.', error);
    return null;
  }
}

export async function addInventoryItemIfMissing(text: string) {
  const normalizedText = text.trim();

  if (!normalizedText) {
    return null;
  }

  if (!itemsLoaded) {
    await refreshInventoryItems();
  }

  const existing = itemsSnapshot.find(
    (item) => normalizeInventoryText(item.text) === normalizeInventoryText(normalizedText),
  );

  if (existing) {
    return existing;
  }

  return addInventoryItem(normalizedText);
}

export async function deleteInventoryItem(id: string) {
  try {
    await deleteStoredInventoryItem(id);
    replaceItemsSnapshot(itemsSnapshot.filter((item) => item.id !== id));
  } catch (error) {
    console.error('Failed to delete inventory item from Neon Postgres.', error);
  }
}

function normalizeInventoryText(text: string) {
  return text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function sortInventoryItems(left: InventoryItem, right: InventoryItem) {
  return (
    left.text.localeCompare(right.text, undefined, { sensitivity: 'base' }) ||
    left.createdAt.localeCompare(right.createdAt)
  );
}
