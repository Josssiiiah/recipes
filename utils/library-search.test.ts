import { describe, expect, test } from 'bun:test';

import type { Recipe } from '@/types/recipe';
import { createLibrarySearchIndex } from './library-search';

const recipes: Recipe[] = [
  makeRecipe({
    id: 'lemon-pasta',
    title: 'Lemon Pasta',
    description: 'A bright weeknight pasta with herbs.',
    ingredients: [
      { amount: '8 ounces', name: 'spaghetti' },
      { amount: '1', name: 'lemon' },
      { amount: '1/2 cup', name: 'parmesan' },
    ],
    createdAt: '2026-03-01T00:00:00.000Z',
  }),
  makeRecipe({
    id: 'chicken-rice',
    title: 'Chicken and Rice',
    description: 'A skillet dinner with tender chicken.',
    ingredients: [
      { amount: '1 pound', name: 'chicken thighs' },
      { amount: '1 cup', name: 'rice' },
    ],
    createdAt: '2026-04-01T00:00:00.000Z',
  }),
  makeRecipe({
    id: 'chickpea-salad',
    title: 'Herby Chickpea Salad',
    description: 'A crisp make-ahead lunch.',
    notes: 'Great with pita.',
    ingredients: [
      { amount: '2 cans', name: 'chickpeas' },
      { amount: '1 bunch', name: 'parsley' },
    ],
    createdAt: '2026-05-01T00:00:00.000Z',
  }),
];

describe('library search', () => {
  test('returns recipes unchanged for blank queries', () => {
    expect(createLibrarySearchIndex(recipes).search('').map((recipe) => recipe.id)).toEqual([
      'lemon-pasta',
      'chicken-rice',
      'chickpea-salad',
    ]);
  });

  test('matches ingredients as the user types', () => {
    expect(createLibrarySearchIndex(recipes).search('parm').map((recipe) => recipe.id)).toEqual([
      'lemon-pasta',
    ]);
  });

  test('matches exact title tokens before fuzzy recovery', () => {
    expect(createLibrarySearchIndex(recipes).search('chicken').map((recipe) => recipe.id)).toEqual([
      'chicken-rice',
    ]);
  });

  test('recovers close typos when there are no exact token matches', () => {
    expect(createLibrarySearchIndex(recipes).search('chiken').map((recipe) => recipe.id)).toContain(
      'chicken-rice',
    );
  });

  test('matches multiple tokens across fields', () => {
    expect(createLibrarySearchIndex(recipes).search('pita chick').map((recipe) => recipe.id)).toEqual([
      'chickpea-salad',
    ]);
  });
});

function makeRecipe(input: Partial<Recipe> & Pick<Recipe, 'id' | 'title' | 'description' | 'ingredients' | 'createdAt'>): Recipe {
  return {
    instructions: '1. Prep ingredients.\n2. Cook until done.',
    updatedAt: input.createdAt,
    ...input,
  };
}
