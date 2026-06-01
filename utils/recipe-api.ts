import type { Recipe, RecipeGenerationJob, RecipeImageStatus, RecipeInput } from '@/types/recipe';
import { abbreviateAmount } from '@/utils/abbreviate-units';
import { getRecipeClientId } from '@/utils/client-owner';
import { getDefaultRecipeApiBaseUrl } from '@/utils/recipe-api-base';
import {
  formatNumberedInstructions,
  hasUnusableInstructionStep,
} from '@/utils/format-numbered-instructions';
import { normalizeRecipeSource } from '@/utils/recipe-source';

type ParseRecipeResponse = {
  recipe?: Partial<RecipeInput> & { description?: string };
  error?: string;
};

export type InventoryScanItem = {
  name: string;
  quantity: string | null;
  storage: string | null;
  text: string;
};

type InventoryScanResponse = {
  items?: Array<Partial<InventoryScanItem>>;
  error?: string;
};

type RecipeImageResponse = {
  imageUri?: string;
  error?: string;
};

type RecipeGenerationJobsResponse = {
  jobs?: Array<Partial<RecipeGenerationJob>>;
  job?: Partial<RecipeGenerationJob> | null;
  recipe?: Recipe;
  error?: string;
};

export type StoredShoppingListItem = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StoredInventoryItem = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredMealSlot = 'breakfast' | 'lunch' | 'dinner';

export type StoredMealPlanEntry = {
  id: string;
  date: string;
  slot: StoredMealSlot;
  recipeId: string;
  recipeTitle: string;
  createdAt: string;
};

type RecipesResponse = {
  recipes?: Recipe[];
  recipe?: Recipe;
  error?: string;
};

type ShoppingListResponse = {
  items?: StoredShoppingListItem[];
  item?: StoredShoppingListItem;
  error?: string;
};

type InventoryResponse = {
  items?: StoredInventoryItem[];
  item?: StoredInventoryItem;
  error?: string;
};

type MealPlanResponse = {
  entries?: StoredMealPlanEntry[];
  entry?: StoredMealPlanEntry;
  error?: string;
};

type RecipeApiOperation =
  | 'recipeInputImport'
  | 'recipeImageImport'
  | 'recipeImageGenerate'
  | 'recipeGenerationJobCreate'
  | 'recipeImageGenerationJobCreate'
  | 'recipeGenerationJobsList'
  | 'inventoryImageScan'
  | 'recipesList'
  | 'recipeCreate'
  | 'recipeUpdate'
  | 'recipeImageStateUpdate'
  | 'recipeNotesUpdate'
  | 'recipeDelete'
  | 'shoppingListList'
  | 'shoppingListCreate'
  | 'shoppingListToggle'
  | 'shoppingListDelete'
  | 'shoppingListClearCompleted'
  | 'inventoryList'
  | 'inventoryCreate'
  | 'inventoryDelete'
  | 'mealPlanList'
  | 'mealPlanCreate'
  | 'mealPlanDelete';
type RecipeApiErrorCode =
  | 'TIMEOUT'
  | 'NETWORK_UNAVAILABLE'
  | 'REQUEST_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'SERVER_FAILURE'
  | 'MALFORMED_RESPONSE'
  | 'INPUT_ERROR'
  | 'CONFIGURATION_ERROR';
type RecipeApiFailureDetails = {
  operation: RecipeApiOperation;
  code: RecipeApiErrorCode;
  status?: number;
  requestId?: string;
};

const configuredRecipeApiBaseUrl = process.env.EXPO_PUBLIC_RECIPE_API_URL?.replace(/\/+$/, '');
const localRecipeApiBaseUrl =
  typeof __DEV__ !== 'undefined' && __DEV__ ? getDefaultRecipeApiBaseUrl() : '';
const recipeApiBaseUrl = configuredRecipeApiBaseUrl || localRecipeApiBaseUrl;
const recipeInputImportTimeoutMs = 75_000;
const imageImportTimeoutMs = 90_000;
const imageGenerationTimeoutMs = 135_000;
const inventoryScanTimeoutMs = 75_000;
const dataRequestTimeoutMs = 20_000;

export class RecipeApiError extends Error {
  readonly code: RecipeApiErrorCode;
  readonly status?: number;
  readonly requestId?: string;
  readonly operation: RecipeApiOperation;

  constructor(message: string, details: RecipeApiFailureDetails) {
    super(message);
    this.name = 'RecipeApiError';
    this.code = details.code;
    this.status = details.status;
    this.requestId = details.requestId;
    this.operation = details.operation;
  }
}

export async function importRecipeFromInput(input: string): Promise<RecipeInput> {
  const result = await requestJsonWithTimeout<ParseRecipeResponse>({
    operation: 'recipeInputImport',
    timeoutMs: recipeInputImportTimeoutMs,
    url: `${getRecipeApiBaseUrl('recipeInputImport')}/api/recipes/import`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input }),
    },
  });

  return readRecipeResponse(result.payload, result);
}

export async function importRecipeFromImage({
  imageBase64,
  mimeType,
}: {
  imageBase64: string;
  mimeType: string;
}): Promise<RecipeInput> {
  const result = await requestJsonWithTimeout<ParseRecipeResponse>({
    operation: 'recipeImageImport',
    timeoutMs: imageImportTimeoutMs,
    url: `${getRecipeApiBaseUrl('recipeImageImport')}/api/recipes/import-image`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageBase64, mimeType }),
    },
  });

  return readRecipeResponse(result.payload, result);
}

export async function scanInventoryFromImage({
  imageBase64,
  mimeType,
}: {
  imageBase64: string;
  mimeType: string;
}): Promise<{ items: InventoryScanItem[] }> {
  const result = await requestJsonWithTimeout<InventoryScanResponse>({
    operation: 'inventoryImageScan',
    timeoutMs: inventoryScanTimeoutMs,
    url: `${getRecipeApiBaseUrl('inventoryImageScan')}/api/inventory/scan-image`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageBase64, mimeType }),
    },
  });

  return readInventoryScanResponse(result.payload, result);
}

export async function generateRecipeImage(recipe: RecipeInput): Promise<{ imageUri: string }> {
  const result = await requestJsonWithTimeout<RecipeImageResponse>({
    operation: 'recipeImageGenerate',
    timeoutMs: imageGenerationTimeoutMs,
    url: `${getRecipeApiBaseUrl('recipeImageGenerate')}/api/recipes/generate-image`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: recipe.title,
        description: recipe.description,
        ingredients: recipe.ingredients,
      }),
    },
  });

  return readRecipeImageResponse(result.payload, result);
}

export async function createRecipeGenerationJobFromInput(
  input: string,
): Promise<RecipeGenerationJob> {
  const result = await requestJsonWithTimeout<RecipeGenerationJobsResponse>({
    operation: 'recipeGenerationJobCreate',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('recipeGenerationJobCreate')}/api/recipes/generation-jobs/input`,
    init: jsonRequest('POST', { input }),
  });

  return readRecipeGenerationJobResponse(result);
}

export async function createRecipeGenerationJobFromImage({
  imageBase64,
  mimeType,
}: {
  imageBase64: string;
  mimeType: string;
}): Promise<RecipeGenerationJob> {
  const result = await requestJsonWithTimeout<RecipeGenerationJobsResponse>({
    operation: 'recipeGenerationJobCreate',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('recipeGenerationJobCreate')}/api/recipes/generation-jobs/image`,
    init: jsonRequest('POST', { imageBase64, mimeType }),
  });

  return readRecipeGenerationJobResponse(result);
}

export async function fetchRecipeGenerationJobs(): Promise<RecipeGenerationJob[]> {
  const result = await requestJsonWithTimeout<RecipeGenerationJobsResponse>({
    operation: 'recipeGenerationJobsList',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('recipeGenerationJobsList')}/api/recipes/generation-jobs`,
    init: {
      method: 'GET',
    },
  });

  if (!Array.isArray(result.payload.jobs)) {
    throwMalformedDataResponse('The service returned generation jobs the app could not read.', result);
  }

  return result.payload.jobs
    .map(normalizeRecipeGenerationJob)
    .filter((job): job is RecipeGenerationJob => job !== null);
}

export async function createRecipeImageGenerationJob(
  id: string,
): Promise<{ recipe: Recipe; job: RecipeGenerationJob | null }> {
  const result = await requestJsonWithTimeout<RecipeGenerationJobsResponse>({
    operation: 'recipeImageGenerationJobCreate',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('recipeImageGenerationJobCreate')}/api/recipes/${encodeURIComponent(
      id,
    )}/image/generation-jobs`,
    init: {
      method: 'POST',
    },
  });

  if (!result.payload.recipe) {
    throwMalformedDataResponse('The service returned a recipe the app could not read.', result);
  }

  return {
    recipe: result.payload.recipe,
    job: result.payload.job ? normalizeRecipeGenerationJob(result.payload.job) : null,
  };
}

export async function parseRecipePrompt(prompt: string): Promise<RecipeInput> {
  return importRecipeFromInput(prompt);
}

export async function fetchStoredRecipes(
  options: {
    includeImages?: boolean;
  } = {},
): Promise<Recipe[]> {
  const searchParams = options.includeImages ? '?includeImages=1' : '';
  const result = await requestJsonWithTimeout<RecipesResponse>({
    operation: 'recipesList',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('recipesList')}/api/recipes${searchParams}`,
    init: {
      method: 'GET',
    },
  });

  if (!Array.isArray(result.payload.recipes)) {
    throwMalformedDataResponse('The service returned recipes the app could not read.', result);
  }

  return result.payload.recipes;
}

export async function createStoredRecipe(recipe: Recipe): Promise<Recipe> {
  const result = await requestJsonWithTimeout<RecipesResponse>({
    operation: 'recipeCreate',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('recipeCreate')}/api/recipes`,
    init: jsonRequest('POST', recipe),
  });

  return readStoredRecipeResponse(result);
}

export async function updateStoredRecipe(id: string, recipe: RecipeInput): Promise<Recipe | null> {
  const result = await requestJsonWithTimeout<RecipesResponse>({
    operation: 'recipeUpdate',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('recipeUpdate')}/api/recipes/${encodeURIComponent(id)}`,
    init: jsonRequest('PUT', recipe),
  });

  return readStoredRecipeResponse(result);
}

export async function updateStoredRecipeImageState(
  id: string,
  input: {
    imageStatus: RecipeImageStatus;
    imageUri?: string | null;
    imageError?: string | null;
  },
): Promise<Recipe | null> {
  const result = await requestJsonWithTimeout<RecipesResponse>({
    operation: 'recipeImageStateUpdate',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('recipeImageStateUpdate')}/api/recipes/${encodeURIComponent(id)}/image`,
    init: jsonRequest('PATCH', input),
  });

  return readStoredRecipeResponse(result);
}

export async function updateStoredRecipeNotes(id: string, notes: string): Promise<Recipe | null> {
  const result = await requestJsonWithTimeout<RecipesResponse>({
    operation: 'recipeNotesUpdate',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('recipeNotesUpdate')}/api/recipes/${encodeURIComponent(id)}/notes`,
    init: jsonRequest('PATCH', { notes }),
  });

  return readStoredRecipeResponse(result);
}

export async function deleteStoredRecipe(id: string): Promise<void> {
  await requestJsonWithTimeout<unknown>({
    operation: 'recipeDelete',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('recipeDelete')}/api/recipes/${encodeURIComponent(id)}`,
    init: {
      method: 'DELETE',
    },
  });
}

export async function fetchStoredShoppingListItems(): Promise<StoredShoppingListItem[]> {
  const result = await requestJsonWithTimeout<ShoppingListResponse>({
    operation: 'shoppingListList',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('shoppingListList')}/api/shopping-list`,
    init: {
      method: 'GET',
    },
  });

  if (!Array.isArray(result.payload.items)) {
    throwMalformedDataResponse('The service returned shopping-list items the app could not read.', result);
  }

  return result.payload.items;
}

export async function createStoredShoppingListItem(
  item: StoredShoppingListItem,
): Promise<StoredShoppingListItem> {
  const result = await requestJsonWithTimeout<ShoppingListResponse>({
    operation: 'shoppingListCreate',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('shoppingListCreate')}/api/shopping-list`,
    init: jsonRequest('POST', item),
  });

  return readStoredShoppingListItemResponse(result);
}

export async function toggleStoredShoppingListItem(id: string): Promise<StoredShoppingListItem | null> {
  const result = await requestJsonWithTimeout<ShoppingListResponse>({
    operation: 'shoppingListToggle',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('shoppingListToggle')}/api/shopping-list/${encodeURIComponent(id)}/toggle`,
    init: {
      method: 'PATCH',
    },
  });

  return readStoredShoppingListItemResponse(result);
}

export async function deleteStoredShoppingListItem(id: string): Promise<void> {
  await requestJsonWithTimeout<unknown>({
    operation: 'shoppingListDelete',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('shoppingListDelete')}/api/shopping-list/${encodeURIComponent(id)}`,
    init: {
      method: 'DELETE',
    },
  });
}

export async function clearStoredCompletedShoppingListItems(): Promise<void> {
  await requestJsonWithTimeout<unknown>({
    operation: 'shoppingListClearCompleted',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('shoppingListClearCompleted')}/api/shopping-list/completed`,
    init: {
      method: 'DELETE',
    },
  });
}

export async function fetchStoredInventoryItems(): Promise<StoredInventoryItem[]> {
  const result = await requestJsonWithTimeout<InventoryResponse>({
    operation: 'inventoryList',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('inventoryList')}/api/inventory`,
    init: {
      method: 'GET',
    },
  });

  if (!Array.isArray(result.payload.items)) {
    throwMalformedDataResponse('The service returned inventory items the app could not read.', result);
  }

  return result.payload.items;
}

export async function createStoredInventoryItem(item: StoredInventoryItem): Promise<StoredInventoryItem> {
  const result = await requestJsonWithTimeout<InventoryResponse>({
    operation: 'inventoryCreate',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('inventoryCreate')}/api/inventory`,
    init: jsonRequest('POST', item),
  });

  return readStoredInventoryItemResponse(result);
}

export async function deleteStoredInventoryItem(id: string): Promise<void> {
  await requestJsonWithTimeout<unknown>({
    operation: 'inventoryDelete',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('inventoryDelete')}/api/inventory/${encodeURIComponent(id)}`,
    init: {
      method: 'DELETE',
    },
  });
}

export async function fetchStoredMealPlanEntries(): Promise<StoredMealPlanEntry[]> {
  const result = await requestJsonWithTimeout<MealPlanResponse>({
    operation: 'mealPlanList',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('mealPlanList')}/api/meal-plan`,
    init: {
      method: 'GET',
    },
  });

  if (!Array.isArray(result.payload.entries)) {
    throwMalformedDataResponse('The service returned a meal plan the app could not read.', result);
  }

  return result.payload.entries;
}

export async function createStoredMealPlanEntry(
  entry: StoredMealPlanEntry,
): Promise<StoredMealPlanEntry> {
  const result = await requestJsonWithTimeout<MealPlanResponse>({
    operation: 'mealPlanCreate',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('mealPlanCreate')}/api/meal-plan`,
    init: jsonRequest('POST', entry),
  });

  return readStoredMealPlanEntryResponse(result);
}

export async function deleteStoredMealPlanEntry(id: string): Promise<void> {
  await requestJsonWithTimeout<unknown>({
    operation: 'mealPlanDelete',
    timeoutMs: dataRequestTimeoutMs,
    url: `${getRecipeApiBaseUrl('mealPlanDelete')}/api/meal-plan/${encodeURIComponent(id)}`,
    init: {
      method: 'DELETE',
    },
  });
}

function getRecipeApiBaseUrl(operation: RecipeApiOperation) {
  if (recipeApiBaseUrl) {
    return recipeApiBaseUrl;
  }

  throw new RecipeApiError('Recipe import is not configured for this build.', {
    operation,
    code: 'CONFIGURATION_ERROR',
  });
}

async function requestJsonWithTimeout<T>({
  operation,
  timeoutMs,
  url,
  init,
}: {
  operation: RecipeApiOperation;
  timeoutMs: number;
  url: string;
  init: RequestInit;
}): Promise<{ payload: T; requestId?: string; status: number; operation: RecipeApiOperation }> {
  const controller = new AbortController();
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    const scopedInit = await addOwnerHeader(operation, init);
    const response = await fetch(url, {
      ...scopedInit,
      signal: controller.signal,
    });
    const requestId = getRequestId(response);
    let payload: unknown = null;

    try {
      payload = await response.json();
    } catch {
      if (response.ok && response.status === 204) {
        return {
          payload: null as T,
          requestId,
          status: response.status,
          operation,
        };
      }

      if (response.ok) {
        throwApiError('The service returned a response the app could not read. Try again.', {
          operation,
          code: 'MALFORMED_RESPONSE',
          status: response.status,
          requestId,
        });
      }
    }

    if (!response.ok) {
      throwApiError(getHttpErrorMessage(response.status, payload, operation), {
        operation,
        code: getHttpErrorCode(response.status),
        status: response.status,
        requestId,
      });
    }

    return {
      payload: payload as T,
      requestId,
      status: response.status,
      operation,
    };
  } catch (error) {
    if (error instanceof RecipeApiError) {
      throw error;
    }

    if (didTimeout || isAbortError(error)) {
      throwApiError(getTimeoutMessage(operation), {
        operation,
        code: 'TIMEOUT',
      });
    }

    throwApiError('No network connection. Check your internet and try again.', {
      operation,
      code: 'NETWORK_UNAVAILABLE',
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function addOwnerHeader(operation: RecipeApiOperation, init: RequestInit) {
  if (!isDataOperation(operation)) {
    return init;
  }

  const headers = new Headers(init.headers);
  headers.set('X-Recipe-Client-ID', await getRecipeClientId());

  return {
    ...init,
    headers,
  };
}

function readRecipeResponse(
  payload: ParseRecipeResponse,
  details: { operation: RecipeApiOperation; requestId?: string; status: number },
) {
  return normalizeRecipeResponse(payload, details);
}

function readInventoryScanResponse(
  payload: InventoryScanResponse,
  details: { operation: RecipeApiOperation; requestId?: string; status: number },
) {
  if (!Array.isArray(payload.items)) {
    throwApiError('The service returned an inventory scan the app could not read. Try again.', {
      operation: details.operation,
      code: 'MALFORMED_RESPONSE',
      status: details.status,
      requestId: details.requestId,
    });
  }

  return {
    items: payload.items
      .map(normalizeInventoryScanItem)
      .filter((item): item is InventoryScanItem => item !== null),
  };
}

function readRecipeImageResponse(
  payload: RecipeImageResponse,
  details: { operation: RecipeApiOperation; requestId?: string; status: number },
) {
  const imageUri = typeof payload.imageUri === 'string' ? payload.imageUri.trim() : '';

  if (!isRenderableImageUri(imageUri)) {
    throwApiError('The service returned an image the app could not read. Try again.', {
      operation: details.operation,
      code: 'MALFORMED_RESPONSE',
      status: details.status,
      requestId: details.requestId,
    });
  }

  return { imageUri };
}

function readRecipeGenerationJobResponse(
  result: {
    payload: RecipeGenerationJobsResponse;
    operation: RecipeApiOperation;
    requestId?: string;
    status: number;
  },
) {
  const job = normalizeRecipeGenerationJob(result.payload.job);

  if (!job) {
    throwMalformedDataResponse('The service returned a generation job the app could not read.', result);
  }

  return job;
}

function normalizeRecipeResponse(
  payload: ParseRecipeResponse,
  details: { operation: RecipeApiOperation; requestId?: string; status: number },
): RecipeInput {
  const recipe = payload.recipe;

  if (!recipe || typeof recipe !== 'object') {
    throwApiError('The service returned an empty recipe. Try again.', {
      operation: details.operation,
      code: 'MALFORMED_RESPONSE',
      status: details.status,
      requestId: details.requestId,
    });
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
    throwApiError('The service returned an incomplete recipe. Try again.', {
      operation: details.operation,
      code: 'MALFORMED_RESPONSE',
      status: details.status,
      requestId: details.requestId,
    });
  }

  const formattedInstructions = formatNumberedInstructions(instructions);

  if (!formattedInstructions || hasUnusableInstructionStep(instructions)) {
    throwApiError('The service returned an incomplete recipe. Try again.', {
      operation: details.operation,
      code: 'MALFORMED_RESPONSE',
      status: details.status,
      requestId: details.requestId,
    });
  }

  const source = normalizeRecipeSource(recipe.source);

  return {
    title,
    description,
    instructions: formattedInstructions,
    ingredients,
    ...(source ? { source } : {}),
  };
}

function getRequestId(response: Response) {
  return response.headers.get('x-request-id') ?? response.headers.get('X-Request-ID') ?? undefined;
}

function getHttpErrorCode(status: number): RecipeApiErrorCode {
  if (status === 413) {
    return 'REQUEST_TOO_LARGE';
  }

  if (status === 429) {
    return 'RATE_LIMITED';
  }

  if (status >= 500) {
    return 'SERVER_FAILURE';
  }

  if (status >= 400) {
    return 'INPUT_ERROR';
  }

  return 'MALFORMED_RESPONSE';
}

function getHttpErrorMessage(status: number, payload: unknown, operation: RecipeApiOperation) {
  if (status === 413) {
    const backendMessage = getPayloadError(payload);

    if (backendMessage) {
      return backendMessage;
    }

    if (operation === 'recipeInputImport') {
      return 'That recipe is too large to import. Try a shorter recipe or link.';
    }

    if (operation === 'recipeImageGenerate') {
      return 'That recipe is too large to illustrate. Shorten the title or description and try again.';
    }

    return 'That image is too large to import. Try a smaller photo.';
  }

  if (status === 429) {
    return 'The service is handling too many requests. Wait a minute and try again.';
  }

  if (status >= 500) {
    if (isDataOperation(operation)) {
      return 'The recipe database is unavailable. Try again in a moment.';
    }

    if (operation === 'inventoryImageScan') {
      return 'The scan service had trouble reading that photo. Try again in a few minutes.';
    }

    if (operation === 'recipeImageGenerate') {
      return 'The image service had trouble creating that recipe image. Try again in a few minutes.';
    }

    return 'The import service had trouble reading that recipe. Try again in a few minutes.';
  }

  const backendMessage = getPayloadError(payload);
  if (backendMessage) {
    return backendMessage;
  }

  if (operation === 'inventoryImageScan') {
    return 'The inventory photo could not be scanned. Check the photo and try again.';
  }

  if (isDataOperation(operation)) {
    return 'The recipe database could not save that change. Try again.';
  }

  if (operation === 'recipeImageGenerate') {
    return 'The recipe image could not be created. Check the recipe and try again.';
  }

  return 'That recipe could not be imported. Check the input and try again.';
}

function getPayloadError(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const error = (payload as { error?: unknown }).error;
  return typeof error === 'string' ? error.trim() : '';
}

function getTimeoutMessage(operation: RecipeApiOperation) {
  if (isDataOperation(operation)) {
    return 'The recipe database took too long to respond. Try again.';
  }

  if (operation === 'inventoryImageScan') {
    return 'The inventory scan took too long. Try again with a clearer photo.';
  }

  if (operation === 'recipeImageGenerate') {
    return 'The recipe image took too long to create. Try again from the recipe page.';
  }

  return 'The recipe import took too long. Try again with a shorter recipe or clearer photo.';
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function throwApiError(message: string, details: RecipeApiFailureDetails): never {
  const error = new RecipeApiError(message, details);

  console.warn('Recipe API request failed.', {
    operation: details.operation,
    code: details.code,
    status: details.status,
    requestId: details.requestId,
    message,
  });

  throw error;
}

function jsonRequest(method: 'POST' | 'PUT' | 'PATCH', body: unknown): RequestInit {
  return {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

function readStoredRecipeResponse(
  result: { payload: RecipesResponse; operation: RecipeApiOperation; requestId?: string; status: number },
) {
  if (!result.payload.recipe) {
    throwMalformedDataResponse('The service returned a recipe the app could not read.', result);
  }

  return result.payload.recipe;
}

function readStoredShoppingListItemResponse(
  result: { payload: ShoppingListResponse; operation: RecipeApiOperation; requestId?: string; status: number },
) {
  if (!result.payload.item) {
    throwMalformedDataResponse('The service returned a shopping-list item the app could not read.', result);
  }

  return result.payload.item;
}

function readStoredInventoryItemResponse(
  result: { payload: InventoryResponse; operation: RecipeApiOperation; requestId?: string; status: number },
) {
  if (!result.payload.item) {
    throwMalformedDataResponse('The service returned an inventory item the app could not read.', result);
  }

  return result.payload.item;
}

function readStoredMealPlanEntryResponse(
  result: { payload: MealPlanResponse; operation: RecipeApiOperation; requestId?: string; status: number },
) {
  if (!result.payload.entry) {
    throwMalformedDataResponse('The service returned a meal-plan entry the app could not read.', result);
  }

  return result.payload.entry;
}

function throwMalformedDataResponse(
  message: string,
  details: { operation: RecipeApiOperation; requestId?: string; status: number },
): never {
  throwApiError(message, {
    operation: details.operation,
    code: 'MALFORMED_RESPONSE',
    status: details.status,
    requestId: details.requestId,
  });
}

function isDataOperation(operation: RecipeApiOperation) {
  return (
    operation === 'recipeGenerationJobCreate' ||
    operation === 'recipeImageGenerationJobCreate' ||
    operation === 'recipeGenerationJobsList' ||
    operation === 'recipesList' ||
    operation === 'recipeCreate' ||
    operation === 'recipeUpdate' ||
    operation === 'recipeImageStateUpdate' ||
    operation === 'recipeNotesUpdate' ||
    operation === 'recipeDelete' ||
    operation === 'shoppingListList' ||
    operation === 'shoppingListCreate' ||
    operation === 'shoppingListToggle' ||
    operation === 'shoppingListDelete' ||
    operation === 'shoppingListClearCompleted' ||
    operation === 'inventoryList' ||
    operation === 'inventoryCreate' ||
    operation === 'inventoryDelete' ||
    operation === 'mealPlanList' ||
    operation === 'mealPlanCreate' ||
    operation === 'mealPlanDelete'
  );
}

function normalizeRecipeGenerationJob(value: unknown): RecipeGenerationJob | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<RecipeGenerationJob>;
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const kind = normalizeRecipeGenerationJobKind(candidate.kind);
  const status = normalizeRecipeGenerationJobStatus(candidate.status);
  const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt.trim() : '';
  const updatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt.trim() : '';

  if (!id || !kind || !status || !createdAt || !updatedAt) {
    return null;
  }

  const recipeId = typeof candidate.recipeId === 'string' ? candidate.recipeId.trim() : '';
  const error = typeof candidate.error === 'string' ? candidate.error.trim() : '';
  const startedAt = typeof candidate.startedAt === 'string' ? candidate.startedAt.trim() : '';
  const completedAt = typeof candidate.completedAt === 'string' ? candidate.completedAt.trim() : '';

  return {
    id,
    ...(recipeId ? { recipeId } : {}),
    kind,
    status,
    ...(error ? { error } : {}),
    createdAt,
    updatedAt,
    ...(startedAt ? { startedAt } : {}),
    ...(completedAt ? { completedAt } : {}),
  };
}

function normalizeRecipeGenerationJobKind(value: unknown): RecipeGenerationJob['kind'] | null {
  return value === 'recipe_input' || value === 'recipe_image' || value === 'recipe_hero_image'
    ? value
    : null;
}

function normalizeRecipeGenerationJobStatus(value: unknown): RecipeGenerationJob['status'] | null {
  return value === 'pending' || value === 'running' || value === 'completed' || value === 'failed'
    ? value
    : null;
}

function isRenderableImageUri(value: string) {
  return /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(value);
}

function normalizeInventoryScanItem(item: Partial<InventoryScanItem>): InventoryScanItem | null {
  const name = typeof item.name === 'string' ? item.name.trim() : '';

  if (!name) {
    return null;
  }

  const quantity =
    typeof item.quantity === 'string' && item.quantity.trim() ? item.quantity.trim() : null;
  const storage = typeof item.storage === 'string' && item.storage.trim() ? item.storage.trim() : null;
  const text =
    typeof item.text === 'string' && item.text.trim()
      ? item.text.trim()
      : [quantity, name].filter(Boolean).join(' ');

  return {
    name,
    quantity,
    storage,
    text,
  };
}
