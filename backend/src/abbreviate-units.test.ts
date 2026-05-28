import { describe, expect, test } from 'bun:test';

import { abbreviateAmount } from '../../utils/abbreviate-units';

describe('abbreviateAmount', () => {
  test('abbreviates mass and volume units', () => {
    expect(abbreviateAmount('8 ounces')).toBe('8 oz');
    expect(abbreviateAmount('12 oz')).toBe('12 oz');
    expect(abbreviateAmount('2 pounds')).toBe('2 lb');
    expect(abbreviateAmount('500 grams')).toBe('500 g');
    expect(abbreviateAmount('1 fluid ounce')).toBe('1 fl oz');
  });

  test('abbreviates spoon measures', () => {
    expect(abbreviateAmount('2 tablespoons')).toBe('2 tbsp');
    expect(abbreviateAmount('1 teaspoon')).toBe('1 tsp');
  });

  test('leaves count-only and special amounts unchanged', () => {
    expect(abbreviateAmount('2')).toBe('2');
    expect(abbreviateAmount('to taste')).toBe('to taste');
    expect(abbreviateAmount('4 cups')).toBe('4 cups');
  });
});
