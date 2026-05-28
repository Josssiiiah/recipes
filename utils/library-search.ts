import Fuse from 'fuse.js';

import type { Recipe } from '@/types/recipe';
import { formatIngredient } from '@/utils/recipe-store';

type SearchableRecipe = Recipe & { ingredientText: string };

function toSearchable(recipe: Recipe): SearchableRecipe {
  return {
    ...recipe,
    ingredientText: recipe.ingredients.map(formatIngredient).join(' '),
  };
}

export function filterRecipesByQuery(recipes: Recipe[], query: string) {
  const trimmed = query.trim();
  if (!trimmed) {
    return recipes;
  }

  const fuse = new Fuse(recipes.map(toSearchable), {
    keys: ['title', 'description', 'instructions', 'ingredientText'],
    threshold: 0.4,
    ignoreLocation: true,
  });

  return fuse.search(trimmed).map((result) => result.item);
}
