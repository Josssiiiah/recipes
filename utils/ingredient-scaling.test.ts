import { describe, expect, test } from 'bun:test';

import { scaleIngredient, scaleIngredientAmount } from './ingredient-scaling';

describe('ingredient scaling', () => {
  test('scales leading whole numbers', () => {
    expect(scaleIngredientAmount('2 cans', 3)).toBe('6 cans');
    expect(scaleIngredientAmount('1 cup', 2)).toBe('2 cups');
  });

  test('scales common fractional amounts', () => {
    expect(scaleIngredientAmount('1/2 cup', 2)).toBe('1 cup');
    expect(scaleIngredientAmount('1 1/2 cups', 3)).toBe('4 1/2 cups');
    expect(scaleIngredientAmount('½ tsp', 3)).toBe('1 1/2 tsp');
  });

  test('scales amount ranges', () => {
    expect(scaleIngredientAmount('1-2 cups', 2)).toBe('2-4 cups');
    expect(scaleIngredientAmount('1/2 to 1 cup', 3)).toBe('1 1/2 to 3 cups');
  });

  test('leaves non-quantity amounts unchanged', () => {
    expect(scaleIngredientAmount('to taste', 2)).toBe('to taste');
    expect(scaleIngredientAmount('', 3)).toBe('');
  });

  test('pluralizes split ingredient names for unitless count amounts', () => {
    expect(scaleIngredient({ amount: '1', name: 'egg' }, 2)).toEqual({
      amount: '2',
      name: 'eggs',
    });
    expect(scaleIngredient({ amount: '1-2', name: 'berry' }, 2)).toEqual({
      amount: '2-4',
      name: 'berries',
    });
  });

  test('does not pluralize split ingredient names when the amount includes a unit', () => {
    expect(scaleIngredient({ amount: '1 cup', name: 'flour' }, 2)).toEqual({
      amount: '2 cups',
      name: 'flour',
    });
  });
});
