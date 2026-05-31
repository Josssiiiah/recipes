import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

process.env.EXPO_PUBLIC_RECIPE_API_URL = 'http://recipes.test';

const { RecipeApiError, generateRecipeImage, importRecipeFromInput, scanInventoryFromImage } =
  await import('./recipe-api');

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;

beforeEach(() => {
  console.warn = () => {};
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
});

describe('recipe API client errors', () => {
  test('maps rate-limit responses to actionable errors with request IDs', async () => {
    mockFetch(
      new Response(JSON.stringify({ error: 'Too many AI requests. Try again later.' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': 'rate-limit-request',
        },
      }),
    );

    try {
      await importRecipeFromInput('https://example.com/recipe');
      throw new Error('Expected importRecipeFromInput to reject.');
    } catch (error) {
      expect(error).toBeInstanceOf(RecipeApiError);
      expect(error).toMatchObject({
        code: 'RATE_LIMITED',
        status: 429,
        requestId: 'rate-limit-request',
        operation: 'recipeInputImport',
        message: 'The service is handling too many requests. Wait a minute and try again.',
      });
    }
  });

  test('maps malformed successful recipe responses to malformed-response errors', async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          recipe: {
            title: 'Lemon Pasta',
            instructions: '1. Boil pasta.',
            ingredients: [{ name: 'pasta', amount: '8 ounces' }],
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': 'malformed-request',
          },
        },
      ),
    );

    try {
      await importRecipeFromInput('lemon pasta');
      throw new Error('Expected importRecipeFromInput to reject.');
    } catch (error) {
      expect(error).toBeInstanceOf(RecipeApiError);
      expect(error).toMatchObject({
        code: 'MALFORMED_RESPONSE',
        status: 200,
        requestId: 'malformed-request',
        operation: 'recipeInputImport',
        message: 'The service returned an incomplete recipe. Try again.',
      });
    }
  });

  test('rejects import responses with only numeric instruction artifacts', async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          recipe: {
            title: 'Broken Pasta',
            description: 'A pasta recipe with malformed instructions.',
            instructions: '1. 1\n2. 1',
            ingredients: [{ name: 'pasta', amount: '8 ounces' }],
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': 'numeric-instructions-request',
          },
        },
      ),
    );

    try {
      await importRecipeFromInput('https://youtu.be/abc123');
      throw new Error('Expected importRecipeFromInput to reject.');
    } catch (error) {
      expect(error).toBeInstanceOf(RecipeApiError);
      expect(error).toMatchObject({
        code: 'MALFORMED_RESPONSE',
        status: 200,
        requestId: 'numeric-instructions-request',
        operation: 'recipeInputImport',
        message: 'The service returned an incomplete recipe. Try again.',
      });
    }
  });

  test('rejects import responses with mixed valid and placeholder instruction steps', async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          recipe: {
            title: 'Broken Pasta',
            description: 'A pasta recipe with malformed instructions.',
            instructions: '1. Boil pasta.\n2. 1\n3. Serve hot.',
            ingredients: [{ name: 'pasta', amount: '8 ounces' }],
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': 'mixed-instructions-request',
          },
        },
      ),
    );

    try {
      await importRecipeFromInput('https://youtu.be/abc123');
      throw new Error('Expected importRecipeFromInput to reject.');
    } catch (error) {
      expect(error).toBeInstanceOf(RecipeApiError);
      expect(error).toMatchObject({
        code: 'MALFORMED_RESPONSE',
        status: 200,
        requestId: 'mixed-instructions-request',
        operation: 'recipeInputImport',
        message: 'The service returned an incomplete recipe. Try again.',
      });
    }
  });

  test('maps fetch failures to network-unavailable errors', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;

    try {
      await scanInventoryFromImage({
        imageBase64: Buffer.from('image').toString('base64'),
        mimeType: 'image/jpeg',
      });
      throw new Error('Expected scanInventoryFromImage to reject.');
    } catch (error) {
      expect(error).toBeInstanceOf(RecipeApiError);
      expect(error).toMatchObject({
        code: 'NETWORK_UNAVAILABLE',
        operation: 'inventoryImageScan',
        message: 'No network connection. Check your internet and try again.',
      });
    }
  });
});

describe('inventory scan response normalization', () => {
  test('filters blank scan items and builds display text from quantity plus name', async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          items: [
            { name: ' milk ', quantity: ' 1 carton ', storage: ' fridge ' },
            { name: '   ', quantity: '1 bag', storage: 'pantry' },
            { name: 'eggs', quantity: null, storage: '' },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    await expect(
      scanInventoryFromImage({
        imageBase64: Buffer.from('image').toString('base64'),
        mimeType: 'image/jpeg',
      }),
    ).resolves.toEqual({
      items: [
        { name: 'milk', quantity: '1 carton', storage: 'fridge', text: '1 carton milk' },
        { name: 'eggs', quantity: null, storage: null, text: 'eggs' },
      ],
    });
  });
});

describe('recipe image response normalization', () => {
  test('reads generated data URI images', async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          imageUri: `data:image/jpeg;base64,${Buffer.from('image').toString('base64')}`,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    await expect(
      generateRecipeImage({
        title: 'Lemon Pasta',
        description: 'A bright pasta with lemon and basil.',
        instructions: '1. Boil pasta.',
        ingredients: [{ name: 'pasta', amount: '8 oz' }],
      }),
    ).resolves.toEqual({
      imageUri: `data:image/jpeg;base64,${Buffer.from('image').toString('base64')}`,
    });
  });

  test('maps malformed image responses to malformed-response errors', async () => {
    mockFetch(
      new Response(JSON.stringify({ imageUri: 'https://example.com/not-returned-here.jpg' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': 'bad-image-request',
        },
      }),
    );

    try {
      await generateRecipeImage({
        title: 'Soup',
        description: 'A simple soup.',
        instructions: '1. Simmer.',
        ingredients: [{ name: 'tomatoes', amount: '4 cups' }],
      });
      throw new Error('Expected generateRecipeImage to reject.');
    } catch (error) {
      expect(error).toBeInstanceOf(RecipeApiError);
      expect(error).toMatchObject({
        code: 'MALFORMED_RESPONSE',
        status: 200,
        requestId: 'bad-image-request',
        operation: 'recipeImageGenerate',
        message: 'The service returned an image the app could not read. Try again.',
      });
    }
  });
});

function mockFetch(response: Response) {
  globalThis.fetch = (async () => response) as typeof fetch;
}
