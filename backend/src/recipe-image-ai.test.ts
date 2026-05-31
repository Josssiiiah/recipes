import { describe, expect, test } from "bun:test";

import { app } from "./index";
import { generateRecipeHeroImage } from "./recipe-image-ai";

describe("recipe image generation route", () => {
  test("rejects blank recipe titles with 400", async () => {
    const originalError = console.error;
    console.error = () => {};

    try {
      const response = await app.handle(
        new Request("http://localhost/api/recipes/generate-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": "192.0.2.30",
          },
          body: JSON.stringify({
            title: "   ",
            description: "A bright pasta with lemon and basil.",
            ingredients: [{ name: "pasta", amount: "8 oz" }],
          }),
        }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "Recipe title is required to generate an image.",
      });
    } finally {
      console.error = originalError;
    }
  });
});

describe("OpenAI recipe image generation", () => {
  test("sends a food hero prompt to the Images API and returns a data URI", async () => {
    let requestedUrl = "";
    let body: unknown;
    const fetcher = async (url: string, init: RequestInit) => {
      requestedUrl = url;
      body = JSON.parse(String(init.body));

      return jsonResponse({
        data: [{ b64_json: Buffer.from("image").toString("base64") }],
      });
    };

    const image = await generateRecipeHeroImage(
      {
        title: "Lemon Basil Pasta",
        description: "A bright pasta tossed with lemon, basil, and parmesan.",
        ingredients: [
          { name: "pasta", amount: "8 oz" },
          { name: "lemon", amount: "1" },
        ],
      },
      {
        env: { OPENAI_API_KEY: "openai-key" },
        fetcher,
      },
    );

    expect(requestedUrl).toBe("https://api.openai.com/v1/images/generations");
    const requestBody = body as { prompt?: unknown };
    expect(typeof requestBody.prompt).toBe("string");
    const prompt = requestBody.prompt as string;

    expect(prompt).toContain("Lemon Basil Pasta");
    expect(prompt).toContain("Do not include text");
    expect(prompt).toContain("8 oz pasta");

    expect(body).toMatchObject({
      model: "gpt-image-2",
      n: 1,
      size: "1536x1152",
      quality: "low",
      output_format: "jpeg",
    });
    expect(image).toEqual({
      imageUri: `data:image/jpeg;base64,${Buffer.from("image").toString("base64")}`,
    });
  });

  test("honors configured output format and image options", async () => {
    let body: unknown;
    const image = await generateRecipeHeroImage(
      {
        title: "Green Hot Sauce",
        description: "A bright hot sauce with jalapeno and vinegar.",
        ingredients: [{ name: "jalapenos", amount: "1 lb" }],
      },
      {
        env: {
          OPENAI_API_KEY: "openai-key",
          OPENAI_RECIPE_IMAGE_MODEL: "gpt-image-1-mini",
          OPENAI_RECIPE_IMAGE_OUTPUT_FORMAT: "webp",
          OPENAI_RECIPE_IMAGE_SIZE: "1024x1024",
          OPENAI_RECIPE_IMAGE_QUALITY: "low",
        },
        fetcher: async (_url, init) => {
          body = JSON.parse(String(init.body));

          return jsonResponse({
            data: [{ b64_json: "webp-image" }],
          });
        },
      },
    );

    expect(body).toMatchObject({
      model: "gpt-image-1-mini",
      output_format: "webp",
      size: "1024x1024",
      quality: "low",
    });
    expect(image.imageUri).toBe("data:image/webp;base64,webp-image");
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
