import { abbreviateAmount } from "./abbreviate-units";
import { enforceImageMaxBytes, fetchWithAiTimeout } from "./ai-endpoint-guards";
import {
  formatNumberedInstructions,
  hasUnusableInstructionStep,
} from "./format-numbered-instructions";
import { normalizeRecipeSource } from "./recipe-source";

export type RecipeIngredient = {
  name: string;
  amount: string;
};

export type StructuredRecipe = {
  title: string;
  description: string;
  instructions: string;
  ingredients: RecipeIngredient[];
  source?: string;
};

type Env = Record<string, string | undefined>;
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type TextContentPart = {
  type: "text";
  text: string;
};
type ImageContentPart = {
  type: "image_url";
  image_url: {
    url: string;
  };
};
type ChatMessage = {
  role: "system" | "user";
  content: string | Array<TextContentPart | ImageContentPart>;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const defaultModel = "openai/gpt-5.4-mini";
const defaultImageModel = "openai/gpt-5.4-mini";
const allowedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const recipeDescriptionGuidance =
  "Write a short, user-facing summary of the finished dish in one concise sentence. " +
  "Describe flavor, texture, main ingredients, or serving style. Do not include cooking steps, " +
  "timing, instructions, or phrases like 'this recipe'. Examples: 'A bright pasta tossed with lemon, basil, and parmesan.' " +
  "'Crisp chicken thighs served with garlicky pan sauce and roasted potatoes.' " +
  "'A cozy tomato soup with a smooth texture and a lightly herbed finish.'";
const recipeTitleGuidance =
  "Write a short, literal recipe title based on the dish name or main ingredients. " +
  "Do not add qualitative or convenience adjectives such as 'Simple', 'Easy', 'Quick', 'Best', " +
  "'Perfect', 'Delicious', 'Tasty', 'Healthy', 'Homemade', or 'Classic' unless that exact idea is explicit in the source material.";
const recipeInstructionsGuidance =
  "Write concrete, executable cooking steps as a multiline string. Each line must start with the next step number and a period, " +
  "such as '1. Boil the pasta.' Every step must include a real cooking action and enough context to be useful. " +
  "Never output placeholders, bare numbers, duplicate numbering, bullets, headings, ingredient-only fragments, or meta text.";
const recipeSourceGuidance =
  "Optional original web page URL when the recipe came from a link. " +
  "Copy the canonical recipe URL from fields like 'URL:' or 'YouTube URL:' in the source, or from an http(s) link in pasted text. " +
  "Omit or set to null for handwritten prompts, photos, or pasted recipe text with no link. " +
  "Examples: 'https://www.seriouseats.com/recipes/2024/03/hot-sauce.html', " +
  "'https://www.youtube.com/watch?v=dQw4w9WgXcQ', null.";

export const recipeResponseSchema = {
  type: "object",
  properties: {
    recipe: {
      type: "object",
      description: "A structured recipe parsed from the user's natural language description.",
      properties: {
        title: {
          type: "string",
          description: recipeTitleGuidance,
        },
        description: {
          type: "string",
          description: recipeDescriptionGuidance,
        },
        instructions: {
          type: "string",
          description: recipeInstructionsGuidance,
        },
        ingredients: {
          type: "array",
          description: "Ingredients with human-readable amounts.",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Ingredient name without the amount.",
              },
              amount: {
                type: "string",
                description:
                  "Human-readable amount using short unit abbreviations (oz, lb, tbsp, tsp, cup, g, ml), never spelled-out units like ounces or tablespoons.",
              },
            },
            required: ["name", "amount"],
            additionalProperties: false,
          },
        },
        source: {
          anyOf: [{ type: "string" }, { type: "null" }],
          description: recipeSourceGuidance,
        },
      },
      required: ["title", "description", "instructions", "ingredients", "source"],
      additionalProperties: false,
    },
  },
  required: ["recipe"],
  additionalProperties: false,
} as const;

export async function generateRecipeFromPrompt(
  prompt: string,
  options: {
    env?: Env;
    fetcher?: Fetcher;
  } = {},
): Promise<StructuredRecipe> {
  return generateRecipeFromSourceText(prompt, "natural language prompt", options);
}

export async function generateRecipeFromSourceText(
  sourceText: string,
  sourceLabel: string,
  options: {
    env?: Env;
    fetcher?: Fetcher;
  } = {},
): Promise<StructuredRecipe> {
  const normalizedSource = sourceText.trim();

  if (!normalizedSource) {
    throw new Error("Describe the recipe before generating it.");
  }

  return requestStructuredRecipe(
    [
      {
        role: "system",
        content: recipeSystemPrompt,
      },
      {
        role: "user",
        content: [
          `Create one structured recipe from this ${sourceLabel}.`,
          "Use only recipe-relevant details from the source. If the source includes commentary, ads, or unrelated text, ignore it.",
          "If the source includes a recipe or YouTube URL, copy that exact http(s) link into the optional source field.",
          normalizedSource,
        ].join("\n\n"),
      },
    ],
    options,
  );
}

export async function generateRecipeFromImage(
  input: {
    imageBase64: string;
    mimeType: string;
  },
  options: {
    env?: Env;
    fetcher?: Fetcher;
  } = {},
): Promise<StructuredRecipe> {
  const imageBase64 = input.imageBase64.trim();
  const mimeType = input.mimeType.trim().toLowerCase();

  if (!imageBase64) {
    throw new Error("Choose a recipe image before importing it.");
  }

  if (!allowedImageMimeTypes.has(mimeType)) {
    throw new Error("Recipe image must be a JPEG, PNG, or WebP file.");
  }

  enforceImageMaxBytes(imageBase64, "Recipe image", options.env);

  return requestStructuredRecipe(
    [
      {
        role: "system",
        content: recipeSystemPrompt,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Read this recipe image and return one structured recipe. Ignore unrelated page chrome, ads, comments, and decorative text.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
    options,
    "image",
  );
}

async function requestStructuredRecipe(
  messages: ChatMessage[],
  options: {
    env?: Env;
    fetcher?: Fetcher;
  },
  mode: "text" | "image" = "text",
) {
  const env = options.env ?? process.env;
  const apiKey = env.OPENROUTER_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const model =
    mode === "image"
      ? env.OPENROUTER_IMAGE_MODEL?.trim() || env.OPENROUTER_MODEL?.trim() || defaultImageModel
      : env.OPENROUTER_MODEL?.trim() || defaultModel;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  const referer = env.OPENROUTER_HTTP_REFERER?.trim();
  const title = env.OPENROUTER_APP_TITLE?.trim();

  if (referer) {
    headers["HTTP-Referer"] = referer;
  }

  if (title) {
    headers["X-OpenRouter-Title"] = title;
  }

  const fetcher = options.fetcher ?? fetch;
  const response = await fetchWithAiTimeout(
    "OpenRouter",
    fetcher,
    openRouterUrl,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1000,
        provider: {
          require_parameters: true,
        },
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "recipe_generation",
            strict: true,
            schema: recipeResponseSchema,
          },
        },
      }),
    },
    env,
  );

  if (!response.ok) {
    throw new Error(
      `OpenRouter request failed with status ${response.status}: ${sanitizeErrorMessage(await response.text())}`,
    );
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new Error("OpenRouter response did not include structured recipe content.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenRouter returned invalid JSON for the recipe.");
  }

  return normalizeStructuredRecipe(parsed);
}

const recipeSystemPrompt = [
  "You convert recipe source material into structured recipes.",
  "Return only the requested structured recipe.",
  "Use concise titles, a short one-sentence description of the finished dish, and numbered cooking instructions.",
  `For title, follow this guidance: ${recipeTitleGuidance}`,
  `For description, follow this guidance: ${recipeDescriptionGuidance}`,
  `For instructions, follow this guidance: ${recipeInstructionsGuidance}`,
  "Ingredients must be individual pantry/cooking ingredients, not preparation steps.",
  "If the amount is approximate or implied, write a useful human-readable amount.",
  "Always use short unit abbreviations in amounts (oz, lb, tbsp, tsp, cup, g, ml).",
  "When the source includes a recipe page or YouTube URL, preserve that link in the optional source field.",
].join(" ");

export function normalizeStructuredRecipe(value: unknown): StructuredRecipe {
  if (!value || typeof value !== "object") {
    throw new Error("Recipe response was not an object.");
  }

  const root = value as { recipe?: unknown };
  const recipe = root.recipe;

  if (!recipe || typeof recipe !== "object") {
    throw new Error("Recipe response did not include a recipe.");
  }

  const candidate = recipe as Partial<StructuredRecipe>;
  const title = normalizeRequiredString(candidate.title, "Recipe title");
  const description = normalizeRequiredString(candidate.description, "Recipe description");
  const instructions = normalizeRequiredString(candidate.instructions, "Recipe instructions");
  const ingredients = Array.isArray(candidate.ingredients)
    ? candidate.ingredients.map(normalizeIngredient).filter((ingredient) => ingredient.name.length > 0)
    : [];

  if (ingredients.length === 0) {
    throw new Error("Recipe response did not include ingredients.");
  }

  const source = normalizeRecipeSource(candidate.source);
  const formattedInstructions = formatNumberedInstructions(instructions);

  if (!formattedInstructions || hasUnusableInstructionStep(instructions)) {
    throw new Error("Recipe instructions did not include usable cooking steps.");
  }

  return {
    title,
    description,
    instructions: formattedInstructions,
    ingredients,
    ...(source ? { source } : {}),
  };
}

export function sanitizeErrorMessage(message: string) {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9._-]+/gi, "[redacted-api-key]")
    .replace(/OPENROUTER_API_KEY=[^\s]+/gi, "OPENROUTER_API_KEY=[redacted]")
    .replace(/OPENAI_API_KEY=[^\s]+/gi, "OPENAI_API_KEY=[redacted]");
}

function normalizeIngredient(value: unknown): RecipeIngredient {
  if (!value || typeof value !== "object") {
    return { name: "", amount: "" };
  }

  const ingredient = value as Partial<RecipeIngredient>;

  return {
    name: typeof ingredient.name === "string" ? ingredient.name.trim() : "",
    amount:
      typeof ingredient.amount === "string" ? abbreviateAmount(ingredient.amount) : "",
  };
}

function normalizeRequiredString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is missing.`);
  }

  return value.trim();
}
