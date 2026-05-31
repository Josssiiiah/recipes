import Fuse from 'fuse.js';

import type { Recipe } from '@/types/recipe';
import { formatIngredient } from '@/utils/recipe-normalization';

type SearchableRecipe = {
  recipe: Recipe;
  title: string;
  description: string;
  notes: string;
  instructions: string;
  ingredientNames: string;
  ingredientText: string;
  source: string;
  normalizedTitle: string;
  normalizedIngredientNames: string;
  normalizedSearchText: string;
};

export type LibrarySearchIndex = {
  search: (query: string) => Recipe[];
};

const tokenPattern = /[a-z0-9]+/g;

function normalizeForSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function getTokens(value: string) {
  return normalizeForSearch(value).match(tokenPattern) ?? [];
}

function toSearchable(recipe: Recipe): SearchableRecipe {
  const ingredientNames = recipe.ingredients.map((ingredient) => ingredient.name).join(' ');
  const ingredientText = recipe.ingredients.map(formatIngredient).join(' ');
  const searchText = [
    recipe.title,
    recipe.description,
    recipe.notes,
    recipe.instructions,
    ingredientNames,
    ingredientText,
    recipe.source,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    recipe,
    title: recipe.title,
    description: recipe.description,
    notes: recipe.notes ?? '',
    instructions: recipe.instructions,
    ingredientNames,
    ingredientText,
    source: recipe.source ?? '',
    normalizedTitle: normalizeForSearch(recipe.title),
    normalizedIngredientNames: normalizeForSearch(ingredientNames),
    normalizedSearchText: normalizeForSearch(searchText),
  };
}

function scoreExactMatch(item: SearchableRecipe, query: string, tokens: string[]) {
  let score = 0;

  if (item.normalizedTitle === query) {
    score -= 1000;
  } else if (item.normalizedTitle.startsWith(query)) {
    score -= 260;
  } else if (item.normalizedTitle.includes(query)) {
    score -= 180;
  }

  if (item.normalizedIngredientNames.includes(query)) {
    score -= 110;
  }

  for (const token of tokens) {
    if (item.normalizedTitle.startsWith(token)) {
      score -= 70;
    } else if (item.normalizedTitle.includes(token)) {
      score -= 46;
    }

    if (item.normalizedIngredientNames.includes(token)) {
      score -= 32;
    }
  }

  return score;
}

export function createLibrarySearchIndex(recipes: Recipe[]): LibrarySearchIndex {
  const searchableRecipes = recipes.map(toSearchable);
  const fuse = new Fuse(searchableRecipes, {
    fieldNormWeight: 0.65,
    ignoreDiacritics: true,
    ignoreLocation: true,
    includeScore: true,
    keys: [
      { name: 'title', weight: 0.42 },
      { name: 'ingredientNames', weight: 0.25 },
      { name: 'description', weight: 0.14 },
      { name: 'ingredientText', weight: 0.1 },
      { name: 'notes', weight: 0.05 },
      { name: 'source', weight: 0.025 },
      { name: 'instructions', weight: 0.015 },
    ],
    minMatchCharLength: 2,
    threshold: 0.34,
  });

  return {
    search(query: string) {
      const trimmed = query.trim();

      if (!trimmed) {
        return recipes;
      }

      const normalizedQuery = normalizeForSearch(trimmed);
      const tokens = getTokens(trimmed);

      if (tokens.length === 0) {
        return recipes;
      }

      const ranked = new Map<string, { recipe: Recipe; score: number }>();

      for (const item of searchableRecipes) {
        if (!tokens.every((token) => item.normalizedSearchText.includes(token))) {
          continue;
        }

        ranked.set(item.recipe.id, {
          recipe: item.recipe,
          score: scoreExactMatch(item, normalizedQuery, tokens),
        });
      }

      if (ranked.size === 0 && normalizedQuery.length > 1) {
        for (const result of fuse.search(trimmed)) {
          const existing = ranked.get(result.item.recipe.id);
          const score = (result.score ?? 1) * 100;

          if (!existing || score < existing.score) {
            ranked.set(result.item.recipe.id, {
              recipe: result.item.recipe,
              score,
            });
          }
        }
      }

      return [...ranked.values()]
        .sort((a, b) => a.score - b.score || b.recipe.createdAt.localeCompare(a.recipe.createdAt))
        .map((result) => result.recipe);
    },
  };
}

export function filterRecipesByQuery(recipes: Recipe[], query: string) {
  return createLibrarySearchIndex(recipes).search(query);
}
