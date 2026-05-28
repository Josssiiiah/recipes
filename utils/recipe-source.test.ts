import { describe, expect, test } from 'bun:test';

import { formatRecipeSourceLabel, normalizeRecipeSource } from './recipe-source';

describe('recipe source helpers', () => {
  test('normalizes http and https URLs', () => {
    expect(normalizeRecipeSource(' https://example.com/recipe ')).toBe('https://example.com/recipe');
    expect(normalizeRecipeSource('ftp://example.com/recipe')).toBeUndefined();
    expect(normalizeRecipeSource('')).toBeUndefined();
  });

  test('formats readable source labels', () => {
    expect(formatRecipeSourceLabel('https://www.seriouseats.com/recipes/hot-sauce')).toBe(
      'seriouseats.com',
    );
    expect(formatRecipeSourceLabel('https://www.youtube.com/watch?v=abc123')).toBe('YouTube');
    expect(formatRecipeSourceLabel('https://youtu.be/abc123')).toBe('YouTube');
  });
});
