import '@/utils/install-local-storage';

import { useSyncExternalStore } from 'react';

export type ShoppingListItem = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

const SHOPPING_LIST_KEY = 'recipe-library:shopping-list:v1';
const listeners = new Set<() => void>();

let loaded = false;
let snapshot: ShoppingListItem[] = [];

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function normalizeItem(value: unknown): ShoppingListItem | null {
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

function readItems() {
  if (loaded) {
    return snapshot;
  }

  loaded = true;

  try {
    const raw = localStorage.getItem(SHOPPING_LIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    snapshot = Array.isArray(parsed)
      ? parsed
          .map(normalizeItem)
          .filter((item): item is ShoppingListItem => item !== null)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      : [];
  } catch {
    snapshot = [];
  }

  return snapshot;
}

function writeItems(items: ShoppingListItem[]) {
  snapshot = items;
  loaded = true;
  localStorage.setItem(SHOPPING_LIST_KEY, JSON.stringify(items));
  emit();
}

export function subscribeShoppingList(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getShoppingListItems() {
  return readItems();
}

export function useShoppingListItems() {
  return useSyncExternalStore(subscribeShoppingList, getShoppingListItems, () => []);
}

export function addShoppingListItem(text: string) {
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

  writeItems([...readItems(), item]);
  return item;
}

export function toggleShoppingListItem(id: string) {
  writeItems(
    readItems().map((item) =>
      item.id === id
        ? {
            ...item,
            completed: !item.completed,
            updatedAt: new Date().toISOString(),
          }
        : item,
    ),
  );
}

export function deleteShoppingListItem(id: string) {
  writeItems(readItems().filter((item) => item.id !== id));
}

export function clearCompletedShoppingListItems() {
  writeItems(readItems().filter((item) => !item.completed));
}
