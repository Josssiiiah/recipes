export type RecipeImportKind = 'image' | 'youtube' | 'url' | 'text';

const firstHttpUrlPattern = /https?:\/\/[^\s<>"']+/i;

export function detectRecipeImportKind(input: string): RecipeImportKind {
  const trimmed = input.trim();
  const match = trimmed.match(firstHttpUrlPattern);

  if (!match) {
    return 'text';
  }

  try {
    const url = new URL(match[0]);
    const hostname = url.hostname.replace(/^www\./, '');

    if (hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname === 'youtu.be') {
      return 'youtube';
    }

    return 'url';
  } catch {
    return 'text';
  }
}

export const recipeImportConfig = {
  image: {
    label: 'Recipe photo',
    icon: { ios: 'photo', android: 'photo_library', web: 'photo_library' },
    steps: ['Reading your photo', 'Extracting ingredients', 'Writing the recipe'],
  },
  youtube: {
    label: 'YouTube video',
    icon: { ios: 'play.rectangle', android: 'smart_display', web: 'smart_display' },
    steps: ['Found YouTube link', 'Reading the transcript', 'Building your recipe'],
  },
  url: {
    label: 'Recipe link',
    icon: { ios: 'link', android: 'link', web: 'link' },
    steps: ['Found recipe link', 'Reading the page', 'Building your recipe'],
  },
  text: {
    label: 'Recipe text',
    icon: { ios: 'doc.text', android: 'description', web: 'description' },
    steps: ['Reading your recipe', 'Organizing ingredients', 'Formatting steps'],
  },
} as const satisfies Record<
  RecipeImportKind,
  {
    label: string;
    icon: { ios: string; android: string; web: string };
    steps: string[];
  }
>;
