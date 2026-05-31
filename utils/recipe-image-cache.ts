import { Directory, EncodingType, File, Paths } from 'expo-file-system';

import type { Recipe } from '@/types/recipe';

const recipeImageDirectory = new Directory(Paths.document, 'recipe-images');
const imageExtensions = ['jpg', 'jpeg', 'png', 'webp'] as const;

type ImageExtension = (typeof imageExtensions)[number];

type InlineImage = {
  base64: string;
  extension: ImageExtension;
};

export async function hydrateRecipeImagesFromDeviceCache(recipes: Recipe[]) {
  const hydrated: Recipe[] = [];

  for (const recipe of recipes) {
    hydrated.push(await hydrateRecipeImageFromDeviceCache(recipe));
  }

  return hydrated;
}

export async function hydrateRecipeImageFromDeviceCache(recipe: Recipe): Promise<Recipe> {
  if (recipe.imageUri) {
    const cachedUri = await cacheRecipeImageUri(recipe.id, recipe.imageUri);
    return cachedUri === recipe.imageUri ? recipe : { ...recipe, imageUri: cachedUri };
  }

  if (recipe.imageStatus !== 'ready') {
    return recipe;
  }

  const cachedUri = findCachedRecipeImageUri(recipe.id);

  return cachedUri ? { ...recipe, imageUri: cachedUri } : recipe;
}

export async function cacheRecipeImageUri(recipeId: string, imageUri: string) {
  const inlineImage = parseInlineImageUri(imageUri);

  if (!inlineImage) {
    return imageUri;
  }

  try {
    ensureRecipeImageDirectory();
    deleteStaleRecipeImageFiles(recipeId, inlineImage.extension);

    const file = getRecipeImageFile(recipeId, inlineImage.extension);
    file.create({ intermediates: true, overwrite: true });
    file.write(inlineImage.base64, { encoding: EncodingType.Base64 });

    return file.uri;
  } catch (error) {
    console.error('Failed to cache recipe image on device.', {
      recipeId,
      error: getImageCacheErrorMessage(error),
    });
    return imageUri;
  }
}

export function findCachedRecipeImageUri(recipeId: string) {
  try {
    ensureRecipeImageDirectory();

    for (const extension of imageExtensions) {
      const file = getRecipeImageFile(recipeId, extension);

      if (file.exists) {
        return file.uri;
      }
    }
  } catch (error) {
    console.error('Failed to read cached recipe image from device.', {
      recipeId,
      error: getImageCacheErrorMessage(error),
    });
  }

  return null;
}

function ensureRecipeImageDirectory() {
  recipeImageDirectory.create({ intermediates: true, idempotent: true });
}

function deleteStaleRecipeImageFiles(recipeId: string, activeExtension: ImageExtension) {
  for (const extension of imageExtensions) {
    if (extension === activeExtension) {
      continue;
    }

    const file = getRecipeImageFile(recipeId, extension);

    if (file.exists) {
      file.delete();
    }
  }
}

function getRecipeImageFile(recipeId: string, extension: ImageExtension) {
  return new File(recipeImageDirectory, `${sanitizeRecipeImageFileName(recipeId)}.${extension}`);
}

function sanitizeRecipeImageFileName(recipeId: string) {
  return recipeId.replace(/[^A-Za-z0-9._-]/g, '_');
}

function parseInlineImageUri(imageUri: string): InlineImage | null {
  const match = imageUri.match(/^data:image\/(png|jpe?g|webp);base64,([\s\S]+)$/i);

  if (!match) {
    return null;
  }

  const mimeExtension = match[1].toLowerCase();
  const base64 = match[2].replace(/\s+/g, '');

  if (!base64) {
    return null;
  }

  return {
    base64,
    extension: mimeExtension === 'jpeg' ? 'jpg' : (mimeExtension as ImageExtension),
  };
}

function getImageCacheErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
