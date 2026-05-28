import '@/utils/install-local-storage';

import { useSyncExternalStore } from 'react';

import type { Recipe, RecipeIngredient, RecipeInput } from '@/types/recipe';
import { abbreviateAmount } from '@/utils/abbreviate-units';
import {
  formatNumberedInstructions,
  instructionsNeedFormatting,
} from '@/utils/format-numbered-instructions';
import { normalizeRecipeSource } from '@/utils/recipe-source';

const RECIPES_KEY = 'recipe-library:recipes:v1';
const listeners = new Set<() => void>();

let loaded = false;
let snapshot: Recipe[] = [];

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function normalizeRecipe(value: unknown): Recipe | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const recipe = value as Partial<Recipe> & {
    body?: unknown;
    description?: string;
    items?: unknown;
  };
  if (!recipe.id || !recipe.title || !recipe.createdAt) {
    return null;
  }

  const ingredients = normalizeIngredients(recipe.ingredients, recipe.items, recipe.body);
  const instructions = normalizeInstructionsText(resolveRecipeInstructions(recipe));
  const description = normalizeDescriptionText(recipe.description);
  const source = normalizeRecipeSource(recipe.source);

  if (!description) {
    return null;
  }

  return {
    id: recipe.id,
    title: recipe.title,
    description,
    instructions,
    ingredients,
    ...(source ? { source } : {}),
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt ?? recipe.createdAt,
  };
}

function storedRecipeNeedsMigration(value: unknown) {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as { description?: unknown; instructions?: unknown };

  if (typeof record.description !== 'string' || record.description.trim().length === 0) {
    return true;
  }

  if (
    'description' in record &&
    (!('instructions' in record) || typeof record.instructions !== 'string')
  ) {
    return true;
  }

  return (
    typeof record.instructions === 'string' &&
    record.instructions.trim().length > 0 &&
    instructionsNeedFormatting(record.instructions)
  );
}

function resolveRecipeInstructions(recipe: {
  instructions?: string;
  description?: string;
  body?: unknown;
}) {
  if (typeof recipe.instructions === 'string' && recipe.instructions.trim()) {
    return recipe.instructions.trim();
  }

  if (typeof recipe.description === 'string' && recipe.description.trim()) {
    return recipe.description.trim();
  }

  if (typeof recipe.body === 'string' && recipe.body.trim()) {
    return recipe.body.trim();
  }

  return '';
}

function normalizeInstructionsText(instructions: string) {
  return formatNumberedInstructions(instructions);
}

function normalizeDescriptionText(description: unknown) {
  return typeof description === 'string' ? description.trim().replace(/\s+/g, ' ') : '';
}

function readRecipes(): Recipe[] {
  if (loaded) {
    return snapshot;
  }

  loaded = true;

  try {
    const raw = localStorage.getItem(RECIPES_KEY);
    if (!raw) {
      snapshot = [];
      return snapshot;
    }

    const parsed = JSON.parse(raw);
    const needsMigration = Array.isArray(parsed) && parsed.some(storedRecipeNeedsMigration);
    snapshot = Array.isArray(parsed)
      ? parsed
          .map(normalizeRecipe)
          .filter((recipe): recipe is Recipe => recipe !== null)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : [];

    if (needsMigration) {
      localStorage.setItem(RECIPES_KEY, JSON.stringify(snapshot));
    }
  } catch {
    snapshot = [];
  }

  return snapshot;
}

function writeRecipes(recipes: Recipe[]) {
  snapshot = recipes;
  loaded = true;
  localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes));
  emit();
}

export function parseRecipeItems(body: string) {
  return body
    .split(/\r?\n/)
    .map((item) => item.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, '').trim())
    .filter(Boolean);
}

export function getIngredientParts(ingredient: RecipeIngredient) {
  const amount = abbreviateAmount(ingredient.amount);
  const name = ingredient.name.trim();

  return { amount, name };
}

export function formatIngredient(ingredient: RecipeIngredient) {
  const { amount, name } = getIngredientParts(ingredient);

  return amount ? `${amount} ${name}` : name;
}

function normalizeIngredientAmount(amount: string) {
  return abbreviateAmount(amount.trim());
}

export function subscribeRecipes(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRecipes() {
  return readRecipes();
}

export function getRecipeById(id: string) {
  return readRecipes().find((recipe) => recipe.id === id);
}

export function useRecipes() {
  return useSyncExternalStore(subscribeRecipes, getRecipes, () => []);
}

function normalizeRecipeInput(input: RecipeInput) {
  const title = input.title.trim();
  const description = normalizeDescriptionText(input.description);
  const ingredients = input.ingredients
    .map((ingredient) => ({
      name: ingredient.name.trim(),
      amount: normalizeIngredientAmount(ingredient.amount),
    }))
    .filter((ingredient) => ingredient.name.length > 0);

  if (!description) {
    throw new Error('Recipe description is required.');
  }

  const source = normalizeRecipeSource(input.source);

  return {
    title,
    description,
    instructions: normalizeInstructionsText(input.instructions),
    ingredients,
    ...(source ? { source } : {}),
  };
}

export function addRecipe(input: RecipeInput) {
  const now = new Date().toISOString();
  const normalized = normalizeRecipeInput(input);
  const recipe: Recipe = {
    id: createId(),
    ...normalized,
    createdAt: now,
    updatedAt: now,
  };

  writeRecipes([recipe, ...readRecipes()]);
  return recipe;
}

export function updateRecipe(id: string, input: RecipeInput) {
  const recipes = readRecipes();
  const index = recipes.findIndex((recipe) => recipe.id === id);

  if (index === -1) {
    return null;
  }

  const normalized = normalizeRecipeInput(input);
  const updated: Recipe = {
    ...recipes[index],
    ...normalized,
    updatedAt: new Date().toISOString(),
  };

  writeRecipes(
    recipes
      .map((recipe) => (recipe.id === id ? updated : recipe))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );

  return updated;
}

export function deleteRecipe(id: string) {
  writeRecipes(readRecipes().filter((recipe) => recipe.id !== id));
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

function normalizeIngredients(
  value: unknown,
  legacyItems: unknown,
  legacyBody: unknown,
): RecipeIngredient[] {
  if (Array.isArray(value)) {
    const ingredients = value
      .map((ingredient) => {
        if (!ingredient || typeof ingredient !== 'object') {
          return null;
        }

        const candidate = ingredient as Partial<RecipeIngredient>;
        const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
        const amount =
          typeof candidate.amount === 'string' ? normalizeIngredientAmount(candidate.amount) : '';

        return name ? { name, amount } : null;
      })
      .filter((ingredient): ingredient is RecipeIngredient => ingredient !== null);

    if (ingredients.length > 0) {
      return ingredients;
    }
  }

  const legacyLines = Array.isArray(legacyItems)
    ? legacyItems.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : typeof legacyBody === 'string'
      ? parseRecipeItems(legacyBody)
      : [];

  return legacyLines.map((item) => ({
    name: item.trim(),
    amount: '',
  }));
}
