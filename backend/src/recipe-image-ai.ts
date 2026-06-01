import { enforceTextMaxChars, fetchWithAiTimeout } from "./ai-endpoint-guards";
import { sanitizeErrorMessage } from "./recipe-ai";

export type RecipeImageIngredient = {
  name: string;
  amount: string;
};

export type GeneratedRecipeImage = {
  imageUri: string;
};

type Env = Record<string, string | undefined>;
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type OpenAIImageResponse = {
  data?: Array<{
    b64_json?: unknown;
  }>;
};

const openAIImagesUrl = "https://api.openai.com/v1/images/generations";
const defaultRecipeImageModel = "gpt-image-2";
const defaultRecipeImageSize = "1536x1152";
const defaultRecipeImageQuality = "medium";
const defaultRecipeImageOutputFormat = "jpeg";
const defaultRecipeImageTimeoutMs = "120000";
const allowedImageSizes = new Set(["1024x1024", "1024x1536", "1536x1024", "1536x1152"]);
const allowedImageQualities = new Set(["low", "medium", "high"]);
const allowedImageOutputFormats = new Set(["png", "webp", "jpeg"]);

export async function generateRecipeHeroImage(
  input: {
    title: string;
    description: string;
    ingredients: RecipeImageIngredient[];
  },
  options: {
    env?: Env;
    fetcher?: Fetcher;
  } = {},
): Promise<GeneratedRecipeImage> {
  const title = normalizeRequiredString(input.title, "Recipe title");
  const description = normalizeRequiredString(input.description, "Recipe description");
  const ingredients = input.ingredients
    .map((ingredient) => ({
      name: ingredient.name.trim(),
      amount: ingredient.amount.trim(),
    }))
    .filter((ingredient) => ingredient.name.length > 0);
  const promptSource = [
    `Title: ${title}`,
    `Description: ${description}`,
    ingredients.length > 0
      ? `Ingredients: ${ingredients.map(formatIngredientForPrompt).join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  enforceTextMaxChars(promptSource, "Recipe image prompt", options.env);

  return requestRecipeImage(buildRecipeImagePrompt(promptSource), options);
}

async function requestRecipeImage(
  prompt: string,
  options: {
    env?: Env;
    fetcher?: Fetcher;
  },
) {
  const env = options.env ?? process.env;
  const apiKey = env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const outputFormat = readAllowedValue(
    env.OPENAI_RECIPE_IMAGE_OUTPUT_FORMAT,
    allowedImageOutputFormats,
    defaultRecipeImageOutputFormat,
  );
  const fetcher = options.fetcher ?? fetch;
  const response = await fetchWithAiTimeout(
    "OpenAI image generation",
    fetcher,
    openAIImagesUrl,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_RECIPE_IMAGE_MODEL?.trim() || defaultRecipeImageModel,
        prompt,
        n: 1,
        size: readAllowedValue(
          env.OPENAI_RECIPE_IMAGE_SIZE,
          allowedImageSizes,
          defaultRecipeImageSize,
        ),
        quality: readAllowedValue(
          env.OPENAI_RECIPE_IMAGE_QUALITY,
          allowedImageQualities,
          defaultRecipeImageQuality,
        ),
        output_format: outputFormat,
      }),
    },
    getRecipeImageTimeoutEnv(env),
  );

  if (!response.ok) {
    throw new Error(
      `OpenAI image generation failed with status ${response.status}: ${sanitizeErrorMessage(
        await response.text(),
      )}`,
    );
  }

  const payload = (await response.json()) as OpenAIImageResponse;
  const imageBase64 = payload.data?.[0]?.b64_json;

  if (typeof imageBase64 !== "string" || imageBase64.trim().length === 0) {
    throw new Error("OpenAI image generation response did not include image data.");
  }

  return {
    imageUri: `data:${getMimeType(outputFormat)};base64,${imageBase64.trim()}`,
  };
}

function buildRecipeImagePrompt(source: string) {
  return [
    "Create a realistic, appetizing finished-dish food photograph for a recipe app hero image.",
    "Use natural window light, a clean tabletop, and a three-quarter overhead composition.",
    "Show the prepared dish clearly as the main subject with simple, relevant garnish or sides.",
    "Do not include text, labels, packaging, brand marks, hands, people, utensils covering the food, or collage layouts.",
    "Recipe details:",
    source,
  ].join("\n");
}

function formatIngredientForPrompt(ingredient: RecipeImageIngredient) {
  return ingredient.amount ? `${ingredient.amount} ${ingredient.name}` : ingredient.name;
}

function normalizeRequiredString(value: string, label: string) {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${label} is required to generate an image.`);
  }

  return normalized;
}

function readAllowedValue(value: string | undefined, allowed: Set<string>, fallback: string) {
  const normalized = value?.trim().toLowerCase();

  return normalized && allowed.has(normalized) ? normalized : fallback;
}

function getMimeType(outputFormat: string) {
  return outputFormat === "jpeg" ? "image/jpeg" : `image/${outputFormat}`;
}

function getRecipeImageTimeoutEnv(env: Env) {
  return {
    ...env,
    AI_TIMEOUT_MS:
      env.AI_RECIPE_IMAGE_TIMEOUT_MS?.trim() ||
      env.AI_IMAGE_GENERATION_TIMEOUT_MS?.trim() ||
      env.AI_TIMEOUT_MS?.trim() ||
      defaultRecipeImageTimeoutMs,
  };
}
