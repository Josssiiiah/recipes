export type RecipeIngredient = {
  name: string;
  amount: string;
};

export type RecipeImageStatus = 'pending' | 'ready' | 'failed';
export type RecipeGenerationJobKind = 'recipe_input' | 'recipe_image' | 'recipe_hero_image';
export type RecipeGenerationJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type RecipeGenerationJob = {
  id: string;
  recipeId?: string;
  kind: RecipeGenerationJobKind;
  status: RecipeGenerationJobStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
};

export type Recipe = {
  id: string;
  title: string;
  description: string;
  notes?: string;
  instructions: string;
  ingredients: RecipeIngredient[];
  source?: string;
  imageUri?: string;
  imageStatus?: RecipeImageStatus;
  imageError?: string;
  createdAt: string;
  updatedAt: string;
};

export type RecipeInput = {
  title: string;
  description: string;
  notes?: string;
  instructions: string;
  ingredients: RecipeIngredient[];
  source?: string | null;
};
