import type { Recipe } from '@/types/recipe';
import { startRecipeImageGeneration } from '@/utils/recipe-store';

const activeRecipeImageRequests = new Set<string>();

export function recipeNeedsImageBackfill(recipe: Recipe) {
  return !recipe.imageUri && !recipe.imageStatus;
}

export function recipeCanGenerateImage(recipe: Recipe) {
  return !recipe.imageUri && recipe.imageStatus !== 'failed';
}

export async function generateAndStoreRecipeImage(
  recipe: Recipe,
  options: {
    markPending?: boolean;
  } = {},
) {
  if (
    recipe.imageUri ||
    (recipe.imageStatus === 'failed' && !options.markPending) ||
    activeRecipeImageRequests.has(recipe.id)
  ) {
    return;
  }

  activeRecipeImageRequests.add(recipe.id);

  try {
    const updated = await startRecipeImageGeneration(recipe.id);

    if (!updated) {
      console.warn('Recipe image generation could not be queued because the recipe was missing.', {
        recipeId: recipe.id,
      });
    }
  } catch (error) {
    const message = getRecipeImageErrorMessage(error);

    console.warn('Recipe image generation enqueue request failed.', {
      recipeId: recipe.id,
      markPending: options.markPending === true,
      message,
    });
  } finally {
    activeRecipeImageRequests.delete(recipe.id);
  }
}

function getRecipeImageErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
