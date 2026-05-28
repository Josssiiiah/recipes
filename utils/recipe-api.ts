import type { RecipeInput } from '@/types/recipe';
import { abbreviateAmount } from '@/utils/abbreviate-units';
import { formatNumberedInstructions } from '@/utils/format-numbered-instructions';
import { normalizeRecipeSource } from '@/utils/recipe-source';

type ParseRecipeResponse = {
  recipe?: Partial<RecipeInput> & { description?: string };
  error?: string;
};

const configuredRecipeApiBaseUrl = process.env.EXPO_PUBLIC_RECIPE_API_URL?.replace(/\/+$/, '');
const localRecipeApiBaseUrl = typeof __DEV__ !== 'undefined' && __DEV__ ? 'http://localhost:4874' : '';
const recipeApiBaseUrl = configuredRecipeApiBaseUrl || localRecipeApiBaseUrl;

export async function importRecipeFromInput(input: string): Promise<RecipeInput> {
  const response = await fetch(`${getRecipeApiBaseUrl()}/api/recipes/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  });

  return readRecipeResponse(response);
}

export async function importRecipeFromImage({
  imageBase64,
  mimeType,
}: {
  imageBase64: string;
  mimeType: string;
}): Promise<RecipeInput> {
  const response = await fetch(`${getRecipeApiBaseUrl()}/api/recipes/import-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageBase64, mimeType }),
  });

  return readRecipeResponse(response);
}

export async function parseRecipePrompt(prompt: string): Promise<RecipeInput> {
  return importRecipeFromInput(prompt);
}

function getRecipeApiBaseUrl() {
  if (recipeApiBaseUrl) {
    return recipeApiBaseUrl;
  }

  throw new Error(
    'Recipe API URL is not configured for this build. Set EXPO_PUBLIC_RECIPE_API_URL in the EAS production environment and upload a new TestFlight build.',
  );
}

async function readRecipeResponse(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as ParseRecipeResponse;

  if (!response.ok) {
    throw new Error(payload.error || `Recipe import failed with status ${response.status}.`);
  }

  return normalizeRecipeResponse(payload);
}

function normalizeRecipeResponse(payload: ParseRecipeResponse): RecipeInput {
  const recipe = payload.recipe;

  if (!recipe || typeof recipe !== 'object') {
    throw new Error('Recipe generation returned an empty response.');
  }

  const title = typeof recipe.title === 'string' ? recipe.title.trim() : '';
  const description = typeof recipe.description === 'string' ? recipe.description.trim() : '';
  const instructions = typeof recipe.instructions === 'string' ? recipe.instructions.trim() : '';
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients
        .map((ingredient) => ({
          name: typeof ingredient?.name === 'string' ? ingredient.name.trim() : '',
          amount:
            typeof ingredient?.amount === 'string' ? abbreviateAmount(ingredient.amount) : '',
        }))
        .filter((ingredient) => ingredient.name.length > 0)
    : [];

  if (!title || !description || !instructions || ingredients.length === 0) {
    throw new Error('Recipe generation returned an incomplete recipe.');
  }

  const source = normalizeRecipeSource(recipe.source);

  return {
    title,
    description,
    instructions: formatNumberedInstructions(instructions),
    ingredients,
    ...(source ? { source } : {}),
  };
}
