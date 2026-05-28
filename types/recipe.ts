export type RecipeIngredient = {
  name: string;
  amount: string;
};

export type Recipe = {
  id: string;
  title: string;
  description: string;
  instructions: string;
  ingredients: RecipeIngredient[];
  source?: string;
  createdAt: string;
  updatedAt: string;
};

export type RecipeInput = {
  title: string;
  description: string;
  instructions: string;
  ingredients: RecipeIngredient[];
  source?: string;
};
