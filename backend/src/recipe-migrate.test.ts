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

  test('rejects AI output with only numeric instruction artifacts', () => {
    expect(() =>
      normalizeStructuredRecipe({
        recipe: {
          title: 'Tomato Soup',
          description: 'A smooth tomato soup.',
          instructions: '1. 1\n2. 1',
          ingredients: [{ name: 'tomatoes', amount: '4 cups' }],
        },
      }),
    ).toThrow('Recipe instructions did not include usable cooking steps.');
  });

  test('rejects AI output with mixed valid and placeholder instruction steps', () => {
    expect(() =>
      normalizeStructuredRecipe({
        recipe: {
          title: 'Tomato Soup',
          description: 'A smooth tomato soup.',
          instructions: '1. Simmer tomatoes until soft.\n2. 1\n3. Blend and season.',
          ingredients: [{ name: 'tomatoes', amount: '4 cups' }],
        },
      }),
    ).toThrow('Recipe instructions did not include usable cooking steps.');
  });
});
