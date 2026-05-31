import { describe, expect, test } from 'bun:test';

import {
  formatNumberedInstructions,
  hasUnusableInstructionStep,
} from '@/utils/format-numbered-instructions';

describe('formatNumberedInstructions', () => {
  test('drops numeric-only instruction artifacts', () => {
    const instructions = [
      '9. Cook the rigatoni in salted water until al dente.',
      '10. 1',
      '11. 1',
      '12. 1',
      '13. Toss the pasta with the sauce.',
      '14. 1',
    ].join('\n');

    expect(
      formatNumberedInstructions(instructions),
    ).toBe(
      [
        '1. Cook the rigatoni in salted water until al dente.',
        '2. Toss the pasta with the sauce.',
      ].join('\n'),
    );
    expect(hasUnusableInstructionStep(instructions)).toBe(true);
  });
});
