import type { Recipe, RecipeImageStatus, RecipeIngredient, RecipeInput } from '@/types/recipe';
import { abbreviateAmount } from '@/utils/abbreviate-units';
import {
  formatNumberedInstructions,
  instructionsNeedFormatting,
} from '@/utils/format-numbered-instructions';
import { normalizeRecipeSource } from '@/utils/recipe-source';

export const LEGACY_RECIPE_DESCRIPTION =
  'Saved recipe from your library. Add a description when you edit it.';

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

export function normalizeIngredientAmount(amount: string) {
  return abbreviateAmount(amount.trim());
}

export function normalizeInstructionsText(instructions: string) {
  return formatNumberedInstructions(instructions);
}

export function normalizeDescriptionText(description: unknown) {
  return typeof description === 'string' ? description.trim().replace(/\s+/g, ' ') : '';
}

export function normalizeNotesText(notes: unknown) {
  return typeof notes === 'string' ? notes.replace(/\r\n/g, '\n').trim() : '';
}

export function normalizeRecipeImageUri(imageUri: unknown) {
  const normalized = typeof imageUri === 'string' ? imageUri.trim() : '';

  if (!normalized) {
    return '';
  }

  if (
    /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(normalized) ||
    /^https?:\/\/\S+$/i.test(normalized)
  ) {
    return normalized;
  }

  return '';
}

export function normalizeRecipeImageStatus(
  status: unknown,
  imageUri: string,
): RecipeImageStatus | undefined {
  if (status === 'ready' && !imageUri) {
    return undefined;
  }

  if (status === 'pending' || status === 'ready' || status === 'failed') {
    return status;
  }

  return imageUri ? 'ready' : undefined;
}

export function storedRecipeNeedsMigration(value: unknown) {
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

export function normalizeRecipe(value: unknown): Recipe | null {
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
  const description = normalizeDescriptionText(recipe.description) || LEGACY_RECIPE_DESCRIPTION;
  const notes = normalizeNotesText(recipe.notes);
  const source = normalizeRecipeSource(recipe.source);
  const imageUri = normalizeRecipeImageUri(recipe.imageUri);
  const imageStatus = normalizeRecipeImageStatus(recipe.imageStatus, imageUri);
  const imageError = normalizeNotesText(recipe.imageError);

  return {
    id: recipe.id,
    title: recipe.title,
    description,
    ...(notes ? { notes } : {}),
    instructions,
    ingredients,
    ...(source ? { source } : {}),
    ...(imageUri ? { imageUri } : {}),
    ...(imageStatus ? { imageStatus } : {}),
    ...(imageError && imageStatus === 'failed' ? { imageError } : {}),
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt ?? recipe.createdAt,
  };
}

export function normalizeRecipeInput(input: RecipeInput) {
  const title = input.title.trim();
  const description = normalizeDescriptionText(input.description);
  const notes = normalizeNotesText(input.notes);
  const hasSource = Object.prototype.hasOwnProperty.call(input, 'source');
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
    notes: notes || undefined,
    instructions: normalizeInstructionsText(input.instructions),
    ingredients,
    ...(hasSource ? { source: source || null } : {}),
  };
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
