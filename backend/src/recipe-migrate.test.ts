import { describe, expect, test } from 'bun:test';

import { normalizeStructuredRecipe } from './recipe-ai';

describe('recipe field migration', () => {
  test('rejects legacy AI output without separate instructions', () => {
    expect(() =>
      normalizeStructuredRecipe({
        recipe: {
          title: 'Tomato Soup',
          description: 'Simmer tomatoes until soft. Blend and season.',
          ingredients: [{ name: 'tomatoes', amount: '4 cups' }],
        },
      }),
    ).toThrow('Recipe instructions is missing.');
  });
});
