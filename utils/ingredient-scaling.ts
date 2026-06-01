import type { RecipeIngredient } from '@/types/recipe';

export type IngredientScale = 1 | 2 | 3;

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 1 / 4,
  '½': 1 / 2,
  '¾': 3 / 4,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};

const PLURAL_AMOUNT_UNITS: Record<string, string> = {
  bottle: 'bottles',
  box: 'boxes',
  bunch: 'bunches',
  can: 'cans',
  clove: 'cloves',
  cup: 'cups',
  package: 'packages',
  packet: 'packets',
  piece: 'pieces',
  pinch: 'pinches',
  slice: 'slices',
};

const IRREGULAR_INGREDIENT_NOUNS: Record<string, string> = {
  leaf: 'leaves',
  loaf: 'loaves',
};

type ParsedQuantity = {
  suffix: string;
  value: number;
};

type ParsedQuantityRange = {
  end: number;
  separator: '-' | 'to';
  start: number;
  suffix: string;
};

const QUANTITY_TOKEN_PATTERN = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|\d?\s*[¼½¾⅓⅔⅛⅜⅝⅞])`;

export function scaleIngredient(ingredient: RecipeIngredient, scale: IngredientScale): RecipeIngredient {
  if (scale === 1) {
    return ingredient;
  }

  return {
    ...ingredient,
    amount: scaleIngredientAmount(ingredient.amount, scale),
    name: scaleIngredientName(ingredient, scale),
  };
}

export function scaleIngredientAmount(amount: string, scale: IngredientScale): string {
  const trimmed = amount.trim();

  if (scale === 1 || !trimmed) {
    return amount;
  }

  const range = parseLeadingQuantityRange(trimmed);

  if (range) {
    const start = range.start * scale;
    const end = range.end * scale;
    const separator = range.separator === 'to' ? ' to ' : '-';

    return `${formatQuantity(start)}${separator}${formatQuantity(end)}${formatScaledSuffix(range.suffix, end)}`;
  }

  const parsed = parseLeadingQuantity(trimmed);

  if (!parsed) {
    return amount;
  }

  const value = parsed.value * scale;

  return `${formatQuantity(value)}${formatScaledSuffix(parsed.suffix, value)}`;
}

function parseLeadingQuantityRange(amount: string): ParsedQuantityRange | null {
  const range = amount.match(
    new RegExp(`^(${QUANTITY_TOKEN_PATTERN})\\s*(-|to)\\s*(${QUANTITY_TOKEN_PATTERN})(.*)$`, 'i'),
  );

  if (!range) {
    return null;
  }

  const start = parseQuantityText(range[1]);
  const end = parseQuantityText(range[3]);

  if (start === null || end === null) {
    return null;
  }

  return {
    end,
    separator: range[2].toLowerCase() === 'to' ? 'to' : '-',
    start,
    suffix: range[4] ?? '',
  };
}

function parseLeadingQuantity(amount: string): ParsedQuantity | null {
  const mixedNumber = amount.match(/^(\d+)\s+(\d+)\/(\d+)(.*)$/);
  if (mixedNumber) {
    const value = parseQuantityText(`${mixedNumber[1]} ${mixedNumber[2]}/${mixedNumber[3]}`);
    if (value === null) {
      return null;
    }

    return {
      value,
      suffix: mixedNumber[4] ?? '',
    };
  }

  const fraction = amount.match(/^(\d+)\/(\d+)(.*)$/);
  if (fraction) {
    const value = parseQuantityText(`${fraction[1]}/${fraction[2]}`);
    if (value === null) {
      return null;
    }

    return {
      value,
      suffix: fraction[3] ?? '',
    };
  }

  const unicodeFraction = amount.match(/^(\d+)?\s*([¼½¾⅓⅔⅛⅜⅝⅞])(.*)$/);
  if (unicodeFraction) {
    const value = parseQuantityText(`${unicodeFraction[1] ?? ''}${unicodeFraction[2]}`);
    if (value === null) {
      return null;
    }

    return {
      value,
      suffix: unicodeFraction[3] ?? '',
    };
  }

  const decimal = amount.match(/^(\d+(?:\.\d+)?)(.*)$/);
  if (decimal) {
    return {
      value: Number(decimal[1]),
      suffix: decimal[2] ?? '',
    };
  }

  return null;
}

function parseQuantityText(value: string): number | null {
  const trimmed = value.trim();
  const mixedNumber = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedNumber) {
    const denominator = Number(mixedNumber[3]);

    return denominator === 0 ? null : Number(mixedNumber[1]) + Number(mixedNumber[2]) / denominator;
  }

  const fraction = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);

    return denominator === 0 ? null : Number(fraction[1]) / denominator;
  }

  const unicodeFraction = trimmed.match(/^(\d+)?\s*([¼½¾⅓⅔⅛⅜⅝⅞])$/);
  if (unicodeFraction) {
    return Number(unicodeFraction[1] ?? 0) + UNICODE_FRACTIONS[unicodeFraction[2]];
  }

  const decimal = trimmed.match(/^\d+(?:\.\d+)?$/);
  if (decimal) {
    return Number(trimmed);
  }

  return null;
}

function formatQuantity(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  const fraction = toFraction(value);
  if (!fraction) {
    return String(Number(value.toFixed(2)));
  }

  const whole = Math.floor(fraction.numerator / fraction.denominator);
  const numerator = fraction.numerator % fraction.denominator;

  if (whole === 0) {
    return `${numerator}/${fraction.denominator}`;
  }

  if (numerator === 0) {
    return String(whole);
  }

  return `${whole} ${numerator}/${fraction.denominator}`;
}

function toFraction(value: number) {
  const maxDenominator = 16;

  for (let denominator = 2; denominator <= maxDenominator; denominator += 1) {
    const numerator = Math.round(value * denominator);
    if (Math.abs(value - numerator / denominator) < 0.0001) {
      return reduceFraction(numerator, denominator);
    }
  }

  return null;
}

function reduceFraction(numerator: number, denominator: number) {
  const divisor = greatestCommonDivisor(numerator, denominator);

  return {
    denominator: denominator / divisor,
    numerator: numerator / divisor,
  };
}

function greatestCommonDivisor(first: number, second: number): number {
  let a = Math.abs(first);
  let b = Math.abs(second);

  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }

  return a || 1;
}

function formatScaledSuffix(suffix: string, value: number) {
  if (value <= 1) {
    return suffix;
  }

  return suffix.replace(/^(\s+)([A-Za-z]+)\b/, (match, space: string, unit: string) => {
    const plural = PLURAL_AMOUNT_UNITS[unit.toLowerCase()];

    return plural ? `${space}${plural}` : match;
  });
}

function scaleIngredientName(ingredient: RecipeIngredient, scale: IngredientScale) {
  const amount = ingredient.amount.trim();
  const range = parseLeadingQuantityRange(amount);

  if (range) {
    return shouldPluralizeSplitName(range.suffix, range.end * scale)
      ? pluralizeIngredientName(ingredient.name)
      : ingredient.name;
  }

  const parsed = parseLeadingQuantity(amount);

  if (!parsed) {
    return ingredient.name;
  }

  return shouldPluralizeSplitName(parsed.suffix, parsed.value * scale)
    ? pluralizeIngredientName(ingredient.name)
    : ingredient.name;
}

function shouldPluralizeSplitName(suffix: string, value: number) {
  return value > 1 && suffix.trim().length === 0;
}

function pluralizeIngredientName(name: string) {
  return name.replace(/([A-Za-z]+)([^A-Za-z]*)$/, (match, word: string, trailing: string) => {
    const lowerWord = word.toLowerCase();
    const irregular = IRREGULAR_INGREDIENT_NOUNS[lowerWord];

    if (irregular) {
      return preserveCapitalization(word, irregular) + trailing;
    }

    if (/[sxz]$/i.test(word) || /(?:ch|sh)$/i.test(word)) {
      return `${word}es${trailing}`;
    }

    if (/[^aeiou]y$/i.test(word)) {
      return `${word.slice(0, -1)}ies${trailing}`;
    }

    if (/s$/i.test(word)) {
      return match;
    }

    return `${word}s${trailing}`;
  });
}

function preserveCapitalization(source: string, target: string) {
  return /^[A-Z]/.test(source) ? `${target.charAt(0).toUpperCase()}${target.slice(1)}` : target;
}
