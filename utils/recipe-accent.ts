const CARD_ACCENTS = [
  { light: '#e6f0ea', dark: '#1c2a24', icon: '#3d7a62' },
  { light: '#efe8df', dark: '#2a2620', icon: '#9a7348' },
  { light: '#e8edf2', dark: '#1f252c', icon: '#4a6f8f' },
  { light: '#f0e8ec', dark: '#2a2226', icon: '#8f5a6f' },
] as const;

function hashRecipeId(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash + id.charCodeAt(index) * (index + 1)) % CARD_ACCENTS.length;
  }
  return hash;
}

export function getRecipeAccent(id: string, colorScheme: 'light' | 'dark') {
  const palette = CARD_ACCENTS[hashRecipeId(id)] ?? CARD_ACCENTS[0];
  return {
    background: colorScheme === 'dark' ? palette.dark : palette.light,
    icon: palette.icon,
  };
}
