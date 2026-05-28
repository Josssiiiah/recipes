/** Longest / most specific unit phrases first so replacements do not overlap. */
const AMOUNT_UNIT_REPLACEMENTS: ReadonlyArray<[pattern: RegExp, replacement: string]> = [
  [/\bfluid\s+ounces\b/gi, 'fl oz'],
  [/\bfluid\s+ounce\b/gi, 'fl oz'],
  [/\btablespoons\b/gi, 'tbsp'],
  [/\btablespoon\b/gi, 'tbsp'],
  [/\bteaspoons\b/gi, 'tsp'],
  [/\bteaspoon\b/gi, 'tsp'],
  [/\bmilligrams\b/gi, 'mg'],
  [/\bmilligram\b/gi, 'mg'],
  [/\bkilograms\b/gi, 'kg'],
  [/\bkilogram\b/gi, 'kg'],
  [/\bgrams\b/gi, 'g'],
  [/\bgram\b/gi, 'g'],
  [/\bmilliliters\b/gi, 'ml'],
  [/\bmilliliter\b/gi, 'ml'],
  [/\bcentiliters\b/gi, 'cl'],
  [/\bcentiliter\b/gi, 'cl'],
  [/\blitres\b/gi, 'L'],
  [/\blitre\b/gi, 'L'],
  [/\bliters\b/gi, 'L'],
  [/\bliter\b/gi, 'L'],
  [/\bounces\b/gi, 'oz'],
  [/\bounce\b/gi, 'oz'],
  [/\bpounds\b/gi, 'lb'],
  [/\bpound\b/gi, 'lb'],
  [/\blbs\.?\b/gi, 'lb'],
  [/\bquarts\b/gi, 'qt'],
  [/\bquart\b/gi, 'qt'],
  [/\bpints\b/gi, 'pt'],
  [/\bpint\b/gi, 'pt'],
  [/\bgallons\b/gi, 'gal'],
  [/\bgallon\b/gi, 'gal'],
];

export function abbreviateAmount(amount: string): string {
  let result = amount.trim();
  if (!result) {
    return result;
  }

  for (const [pattern, replacement] of AMOUNT_UNIT_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  return result.replace(/\s{2,}/g, ' ').trim();
}
