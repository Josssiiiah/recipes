import { describe, expect, test } from "bun:test";
import type { RecipeObject, SafeParseResult } from "recipe-scrapers";

import {
  importRecipeFromInput,
  RecipeImportInputError,
  transcribeAudioWithOpenAi,
} from "./recipe-import";
import type { StructuredRecipe } from "./recipe-ai";

const generatedRecipe: StructuredRecipe = {
  title: "Imported Recipe",
  description: "A concise imported recipe description.",
  instructions: "1. Cook it.",
  ingredients: [{ name: "ingredient", amount: "1 cup" }],
};

describe("multi-source recipe import", () => {
  test("plain text input still generates a recipe", async () => {
    const calls: Array<{ sourceText: string; sourceLabel: string }> = [];
    const recipe = await importRecipeFromInput("tomato soup with basil", {
      recipeGenerator: async (sourceText, sourceLabel) => {
        calls.push({ sourceText, sourceLabel });
        return generatedRecipe;
      },
    });

    expect(recipe).toBe(generatedRecipe);
    expect(calls).toEqual([
      {
        sourceText: "tomato soup with basil",
        sourceLabel: "pasted recipe text",
      },
    ]);
  });

  test("YouTube URLs use captions before audio transcription", async () => {
    let audioCalled = false;
    let generatedSource = "";

    await importRecipeFromInput("make this vegetarian https://youtu.be/abc123", {
      transcriptFetcher: async () => [{ text: "First chop onions." }, { text: "Then simmer." }],
      audioTranscriber: async () => {
        audioCalled = true;
        return "audio transcript";
      },
      recipeGenerator: async (sourceText) => {
        generatedSource = sourceText;
        return generatedRecipe;
      },
    });

    expect(audioCalled).toBe(false);
    expect(generatedSource).toContain("User notes:\nmake this vegetarian");
    expect(generatedSource).toContain("Transcript source: captions");
    expect(generatedSource).toContain("First chop onions. Then simmer.");
  });

  test("YouTube URLs fall back to audio transcription when captions are unavailable", async () => {
    let transcribedBytes = 0;
    let generatedSource = "";

    await importRecipeFromInput("https://www.youtube.com/watch?v=abc123", {
      transcriptFetcher: async () => {
        throw new Error("No transcript");
      },
      audioStreamFactory: async function* () {
        yield Buffer.from("audio bytes");
      },
      audioTranscriber: async (audio) => {
        transcribedBytes = audio.byteLength;
        return "Audio says to season the chicken.";
      },
      recipeGenerator: async (sourceText) => {
        generatedSource = sourceText;
        return generatedRecipe;
      },
    });

    expect(transcribedBytes).toBe(Buffer.byteLength("audio bytes"));
    expect(generatedSource).toContain("Transcript source: audio transcription");
    expect(generatedSource).toContain("Audio says to season the chicken.");
  });

  test("YouTube audio over the configured size limit fails clearly", async () => {
    await expect(
      importRecipeFromInput("https://youtu.be/abc123", {
        transcriptFetcher: async () => [],
        audioStreamFactory: async function* () {
          yield Buffer.from("too large");
        },
        maxAudioBytes: 3,
        recipeGenerator: async () => generatedRecipe,
      }),
    ).rejects.toThrow("YouTube audio is too large to transcribe");
  });

  test("recipe URLs import mocked scraper output", async () => {
    let generatedSource = "";

    const recipe = await importRecipeFromInput("Try this https://example.com/recipe tonight", {
      fetcher: async () => new Response("<html></html>", { status: 200 }),
      recipeScraper: async () =>
        ({
          success: true,
          data: recipeObject,
        }) satisfies SafeParseResult<RecipeObject>,
      recipeGenerator: async (sourceText, sourceLabel) => {
        generatedSource = `${sourceLabel}\n${sourceText}`;
        return generatedRecipe;
      },
    });

    expect(generatedSource).toContain("recipe page data");
    expect(generatedSource).toContain("User notes:\nTry this\ntonight");
    expect(generatedSource).toContain("Title: Lemon Pasta");
    expect(generatedSource).toContain("8 oz pasta");
    expect(generatedSource).toContain("Boil pasta.");
    expect(recipe.source).toBe("https://example.com/recipe");
  });

  test("unsupported URL schemes fail clearly", async () => {
    await expect(importRecipeFromInput("ftp://example.com/recipe")).rejects.toThrow(
      RecipeImportInputError,
    );
  });

  test("maps OpenAI transcription timeouts to actionable errors", async () => {
    await expect(
      transcribeAudioWithOpenAi(Buffer.from("audio"), "video.mp4", {
        env: {
          OPENAI_API_KEY: "openai-key",
          AI_TIMEOUT_MS: "5",
        },
        fetcher: async () => new Promise<Response>(() => {}),
      }),
    ).rejects.toThrow("OpenAI transcription request timed out after 5 ms.");
  });
});

const recipeObject = {
  schemaVersion: "1.0.0",
  host: "example.com",
  siteName: "Example",
  author: "Cook",
  title: "Lemon Pasta",
  image: "https://example.com/image.jpg",
  canonicalUrl: "https://example.com/recipe",
  language: "en",
  description: "A bright pasta.",
  ingredients: [
    {
      name: null,
      items: [{ value: "8 oz pasta" }, { value: "2 tbsp olive oil" }],
    },
  ],
  instructions: [
    {
      name: null,
      items: [{ value: "Boil pasta." }, { value: "Toss with oil." }],
    },
  ],
  category: [],
  yields: "2 servings",
  totalTime: 20,
  cookTime: 10,
  prepTime: 10,
  ratings: 0,
  ratingsCount: 0,
  cuisine: [],
  keywords: [],
  dietaryRestrictions: [],
  equipment: [],
  nutrients: {},
  reviews: {},
  cookingMethod: null,
} as RecipeObject;
