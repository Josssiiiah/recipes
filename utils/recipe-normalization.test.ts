import { describe, expect, test } from 'bun:test';

import { normalizeRecipeInput } from './recipe-normalization';

const baseRecipeInput = {
  title: 'Lemon Pasta',
  description: 'A bright lemon pasta.',
  instructions: 'Boil pasta.',
  ingredients: [{ name: 'pasta', amount: '8 ounces' }],
};

describe('recipe input normalization', () => {
  test('preserves explicit source clears as null', () => {
    expect(normalizeRecipeInput({ ...baseRecipeInput, source: null })).toMatchObject({
      source: null,
    });
  });

  test('omits source when callers do not send source intent', () => {
    expect(normalizeRecipeInput(baseRecipeInput)).not.toHaveProperty('source');
  });
});
