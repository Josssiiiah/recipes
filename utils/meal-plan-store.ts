import { useSyncExternalStore } from 'react';

import {
  createStoredMealPlanEntry,
  deleteStoredMealPlanEntry,
  fetchStoredMealPlanEntries,
  type StoredMealPlanEntry,
} from '@/utils/recipe-api';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';
export type MealPlanEntry = StoredMealPlanEntry;

export const MEAL_SLOTS: { slot: MealSlot; label: string; color: string }[] = [
  { slot: 'breakfast', label: 'Breakfast', color: '#e0a23b' },
  { slot: 'lunch', label: 'Lunch', color: '#2f7d4f' },
  { slot: 'dinner', label: 'Dinner', color: '#6172d6' },
];

export function slotMeta(slot: MealSlot) {
  return MEAL_SLOTS.find((item) => item.slot === slot) ?? MEAL_SLOTS[0];
}

/** Local-time date key, e.g. "2026-05-31". Avoids the UTC off-by-one from toISOString(). */
export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function parseDateKey(key: string) {
  const [year, month, day] = key.split('-').map((part) => Number.parseInt(part, 10));
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

const listeners = new Set<() => void>();

let loaded = false;
let loading: Promise<void> | null = null;
let snapshot: MealPlanEntry[] = [];

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function readEntries() {
  if (!loaded) {
    void refreshMealPlanEntries();
  }

  return snapshot;
}

function replaceSnapshot(entries: MealPlanEntry[]) {
  snapshot = entries;
  loaded = true;
  emit();
}

export async function refreshMealPlanEntries() {
  if (loading) {
    return loading;
  }

  loading = (async () => {
    try {
      replaceSnapshot(await fetchStoredMealPlanEntries());
    } catch (error) {
      console.error('Failed to read meal plan from Neon Postgres.', { error });
      loaded = true;
      emit();
    } finally {
      loading = null;
    }
  })();

  return loading;
}

export function subscribeMealPlan(listener: () => void) {
  listeners.add(listener);
  void refreshMealPlanEntries();
  return () => listeners.delete(listener);
}

export function getMealPlanEntries() {
  return readEntries();
}

export function useMealPlanEntries() {
  return useSyncExternalStore(subscribeMealPlan, getMealPlanEntries, () => []);
}

export async function assignRecipeToMealPlan(input: {
  date: string;
  slot: MealSlot;
  recipeId: string;
  recipeTitle: string;
}) {
  // Avoid duplicating the same recipe in the same date + slot.
  const alreadyAssigned = snapshot.some(
    (entry) =>
      entry.date === input.date && entry.slot === input.slot && entry.recipeId === input.recipeId,
  );

  if (alreadyAssigned) {
    return null;
  }

  const entry: MealPlanEntry = {
    id: createId(),
    date: input.date,
    slot: input.slot,
    recipeId: input.recipeId,
    recipeTitle: input.recipeTitle,
    createdAt: new Date().toISOString(),
  };

  try {
    const saved = await createStoredMealPlanEntry(entry);
    replaceSnapshot([...snapshot, saved]);
    return saved;
  } catch (error) {
    console.error('Failed to add meal-plan entry to Neon Postgres.', {
      entryId: entry.id,
      error,
    });
    return null;
  }
}

export async function removeMealPlanEntry(id: string) {
  const previous = snapshot;
  replaceSnapshot(snapshot.filter((entry) => entry.id !== id));

  try {
    await deleteStoredMealPlanEntry(id);
  } catch (error) {
    console.error('Failed to delete meal-plan entry from Neon Postgres.', {
      entryId: id,
      error,
    });
    // Restore the entry so the UI reflects the persisted state.
    replaceSnapshot(previous);
  }
}
