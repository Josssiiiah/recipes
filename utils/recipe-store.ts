import { useSyncExternalStore } from 'react';

import type { Recipe, RecipeGenerationJob, RecipeImageStatus, RecipeInput } from '@/types/recipe';
import {
  markLegacyRecipesMigrated,
  readLegacyRecipesForMigration,
} from '@/utils/legacy-local-data';
import {
  createStoredRecipe,
  createRecipeGenerationJobFromImage,
  createRecipeGenerationJobFromInput,
  createRecipeImageGenerationJob,
  deleteStoredRecipe,
  fetchRecipeGenerationJobs,
  fetchStoredRecipes,
  updateStoredRecipe,
  updateStoredRecipeImageState,
  updateStoredRecipeNotes,
} from '@/utils/recipe-api';
import {
  hydrateRecipeImageFromDeviceCache,
  hydrateRecipeImagesFromDeviceCache,
} from '@/utils/recipe-image-cache';
import {
  formatIngredient,
  getIngredientParts,
  normalizeNotesText,
  normalizeRecipeInput,
  normalizeRecipeImageStatus,
  normalizeRecipeImageUri,
  parseRecipeItems,
} from '@/utils/recipe-normalization';

export { formatIngredient, getIngredientParts, parseRecipeItems };

const listeners = new Set<() => void>();

let loaded = false;
let loading: Promise<void> | null = null;
let snapshot: Recipe[] = [];
let recipeGenerationJobs: RecipeGenerationJob[] = [];
let pendingWorkRefreshTimeout: ReturnType<typeof setTimeout> | null = null;

const pendingWorkRefreshDelayMs = 2500;

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function readRecipes(): Recipe[] {
  if (!loaded) {
    void refreshRecipes();
  }

  return snapshot;
}

function replaceSnapshot(recipes: Recipe[]) {
  snapshot = recipes;
  loaded = true;
  emit();
  schedulePendingWorkRefresh();
}

export async function refreshRecipes() {
  if (loading) {
    return loading;
  }

  loading = (async () => {
    try {
      const recipes = await fetchStoredRecipes();
      const hydratedRecipes = await hydrateRecipeImagesFromDeviceCache(recipes);

      if (hydratedRecipes.length === 0) {
        const migrated = await migrateLegacyRecipes();

        if (migrated.length > 0) {
          replaceSnapshot(await hydrateRecipeImagesFromDeviceCache(migrated));
          return;
        }
      }

      const missingReadyImages = hydratedRecipes.some(
        (recipe) => recipe.imageStatus === 'ready' && !recipe.imageUri,
      );

      if (missingReadyImages) {
        const recipesWithInlineImages = await fetchStoredRecipes({ includeImages: true });
        replaceSnapshot(await hydrateRecipeImagesFromDeviceCache(recipesWithInlineImages));
        return;
      }

      replaceSnapshot(hydratedRecipes);
    } catch (error) {
      console.error('Failed to read recipes from Neon Postgres.', { error });
      loaded = true;
      emit();
    } finally {
      loading = null;
    }
  })();

  return loading;
}

async function refreshRecipeGenerationJobs() {
  const hadActiveJobs = hasActiveRecipeGenerationJobs();

  try {
    recipeGenerationJobs = await fetchRecipeGenerationJobs();
    emit();

    if (hadActiveJobs || hasCompletedRecipeGenerationJobs()) {
      await refreshRecipes();
    }
  } catch (error) {
    console.warn('Failed to refresh recipe generation jobs.', { error });
  } finally {
    schedulePendingWorkRefresh();
  }
}

function upsertRecipeGenerationJob(job: RecipeGenerationJob | null) {
  if (!job) {
    return;
  }

  recipeGenerationJobs = [
    job,
    ...recipeGenerationJobs.filter((item) => item.id !== job.id),
  ];
  emit();
  schedulePendingWorkRefresh();
}

function hasPendingRecipeWork() {
  return snapshot.some((recipe) => recipe.imageStatus === 'pending') || hasActiveRecipeGenerationJobs();
}

function hasActiveRecipeGenerationJobs() {
  return recipeGenerationJobs.some(
    (job) => job.status === 'pending' || job.status === 'running',
  );
}

function hasCompletedRecipeGenerationJobs() {
  return recipeGenerationJobs.some(
    (job) =>
      (job.kind === 'recipe_input' || job.kind === 'recipe_image') &&
      job.status === 'completed' &&
      Boolean(job.recipeId),
  );
}

function schedulePendingWorkRefresh() {
  if (pendingWorkRefreshTimeout || !hasPendingRecipeWork()) {
    return;
  }

  pendingWorkRefreshTimeout = setTimeout(() => {
    pendingWorkRefreshTimeout = null;
    void refreshPendingWork();
  }, pendingWorkRefreshDelayMs);
}

async function refreshPendingWork() {
  const shouldRefreshRecipes = snapshot.some((recipe) => recipe.imageStatus === 'pending');

  await refreshRecipeGenerationJobs();

  if (shouldRefreshRecipes) {
    await refreshRecipes();
  }
}

async function migrateLegacyRecipes() {
  const legacyRecipes = await readLegacyRecipesForMigration();

  if (legacyRecipes.length === 0) {
    return [];
  }

  console.info('Migrating legacy local recipes to remote recipe store.', {
    count: legacyRecipes.length,
  });

  const results = await Promise.allSettled(legacyRecipes.map((recipe) => createStoredRecipe(recipe)));
  const savedRecipes = results
    .map((result) => (result.status === 'fulfilled' ? result.value : null))
    .filter((recipe): recipe is Recipe => recipe !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (savedRecipes.length === legacyRecipes.length) {
    await markLegacyRecipesMigrated();
  } else {
    console.error('Failed to migrate every legacy local recipe.', {
      expectedCount: legacyRecipes.length,
      savedCount: savedRecipes.length,
    });
  }

  return savedRecipes;
}

export function subscribeRecipes(listener: () => void) {
  listeners.add(listener);
  void refreshRecipes();
  void refreshRecipeGenerationJobs();
  return () => listeners.delete(listener);
}

export function getRecipes() {
  return readRecipes();
}

export function getRecipeGenerationJobs() {
  return recipeGenerationJobs;
}

export function getRecipeById(id: string) {
  return readRecipes().find((recipe) => recipe.id === id);
}

export function useRecipes() {
  return useSyncExternalStore(subscribeRecipes, getRecipes, () => []);
}

export function useRecipeGenerationJobs() {
  return useSyncExternalStore(subscribeRecipes, getRecipeGenerationJobs, () => []);
}

export async function addRecipe(input: RecipeInput) {
  const now = new Date().toISOString();
  const normalized = normalizeRecipeInput(input);
  const { source, ...recipeFields } = normalized;
  const recipe: Recipe = {
    id: createId(),
    ...recipeFields,
    ...(source ? { source } : {}),
    createdAt: now,
    updatedAt: now,
  };

  try {
    const saved = await createStoredRecipe(recipe);
    const hydrated = await hydrateRecipeImageFromDeviceCache(saved);
    replaceSnapshot([hydrated, ...snapshot.filter((item) => item.id !== hydrated.id)]);
    void startRecipeImageGeneration(hydrated.id);
    return hydrated;
  } catch (error) {
    console.error('Failed to add recipe to Neon Postgres.', {
      recipeId: recipe.id,
      error,
    });
    throw error;
  }
}

export async function startRecipeGenerationFromInput(input: string) {
  try {
    const job = await createRecipeGenerationJobFromInput(input);
    upsertRecipeGenerationJob(job);
    return job;
  } catch (error) {
    console.error('Failed to enqueue recipe generation job.', { error });
    throw error;
  }
}

export async function startRecipeGenerationFromImage(input: {
  imageBase64: string;
  mimeType: string;
}) {
  try {
    const job = await createRecipeGenerationJobFromImage(input);
    upsertRecipeGenerationJob(job);
    return job;
  } catch (error) {
    console.error('Failed to enqueue recipe image import job.', { error });
    throw error;
  }
}

export async function startRecipeImageGeneration(id: string) {
  try {
    const result = await createRecipeImageGenerationJob(id);
    upsertRecipeGenerationJob(result.job);

    const hydrated = await hydrateRecipeImageFromDeviceCache(result.recipe);
    replaceSnapshot(snapshot.map((recipe) => (recipe.id === id ? hydrated : recipe)));
    return hydrated;
  } catch (error) {
    console.error('Failed to enqueue recipe image generation job.', {
      recipeId: id,
      error,
    });
    return null;
  }
}

export async function updateRecipe(id: string, input: RecipeInput) {
  const normalized = normalizeRecipeInput(input);

  try {
    const updated = await updateStoredRecipe(id, normalized);

    if (!updated) {
      return null;
    }

    const hydrated = await hydrateRecipeImageFromDeviceCache(updated);
    replaceSnapshot(snapshot.map((recipe) => (recipe.id === id ? hydrated : recipe)));
    return hydrated;
  } catch (error) {
    console.error('Failed to update recipe in Neon Postgres.', {
      recipeId: id,
      error,
    });
    return null;
  }
}

export async function updateRecipeImageState(
  id: string,
  input: {
    imageStatus: RecipeImageStatus;
    imageUri?: string | null;
    imageError?: string | null;
  },
) {
  const imageUri = normalizeRecipeImageUri(input.imageUri);
  const imageStatus = normalizeRecipeImageStatus(input.imageStatus, imageUri);
  const imageError = normalizeNotesText(input.imageError);

  if (!imageStatus) {
    return null;
  }

  try {
    const updated = await updateStoredRecipeImageState(id, {
      imageStatus,
      imageUri,
      imageError,
    });

    if (!updated) {
      return null;
    }

    const hydrated = await hydrateRecipeImageFromDeviceCache(updated);
    replaceSnapshot(snapshot.map((recipe) => (recipe.id === id ? hydrated : recipe)));
    return hydrated;
  } catch (error) {
    console.error('Failed to update recipe image state in Neon Postgres.', {
      recipeId: id,
      imageStatus,
      error,
    });
    return null;
  }
}

export async function updateRecipeNotes(id: string, notes: string) {
  const normalizedNotes = normalizeNotesText(notes);

  try {
    const updated = await updateStoredRecipeNotes(id, normalizedNotes ?? '');

    if (!updated) {
      return null;
    }

    const hydrated = await hydrateRecipeImageFromDeviceCache(updated);
    replaceSnapshot(snapshot.map((recipe) => (recipe.id === id ? hydrated : recipe)));
    return hydrated;
  } catch (error) {
    console.error('Failed to update recipe notes in Neon Postgres.', {
      recipeId: id,
      error,
    });
    return null;
  }
}

export async function deleteRecipe(id: string) {
  try {
    await deleteStoredRecipe(id);
    replaceSnapshot(snapshot.filter((recipe) => recipe.id !== id));
  } catch (error) {
    console.error('Failed to delete recipe from Neon Postgres.', {
      recipeId: id,
      error,
    });
  }
}

export function formatRecipeDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}
