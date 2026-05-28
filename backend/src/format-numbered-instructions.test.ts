import { describe, expect, test } from 'bun:test';

import {
  formatNumberedInstructions,
  instructionsAreNumbered,
} from '../../utils/format-numbered-instructions';

describe('formatNumberedInstructions', () => {
  test('numbers plain sentences', () => {
    expect(formatNumberedInstructions('Boil pasta. Toss with lemon.')).toBe(
      '1. Boil pasta.\n2. Toss with lemon.',
    );
  });

  test('renumbers existing steps', () => {
    expect(formatNumberedInstructions('2. Add pasta\n4. Serve')).toBe('1. Add pasta\n2. Serve');
  });

  test('numbers newline-separated steps', () => {
    expect(formatNumberedInstructions('Boil water\nDrain pasta')).toBe(
      '1. Boil water\n2. Drain pasta',
    );
  });

  test('detects numbered instructions', () => {
    expect(instructionsAreNumbered('1. Boil water\n2. Drain pasta')).toBe(true);
    expect(instructionsAreNumbered('Boil water')).toBe(false);
  });

  test('puts inline numbered steps on separate lines', () => {
    expect(formatNumberedInstructions('1. Boil water. 2. Drain pasta.')).toBe(
      '1. Boil water.\n2. Drain pasta.',
    );
  });
});
