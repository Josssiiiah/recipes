import { describe, expect, test } from "bun:test";

import { generateRecipeFromImage, generateRecipeFromPrompt } from "./recipe-ai";
import { app } from "./index";

describe("recipe parser route", () => {
  test("rejects blank prompts with 400", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/recipes/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "   " }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Describe the recipe before generating it.",
    });
  });
});

describe("OpenRouter recipe generation", () => {
  test("sends strict structured output schema", async () => {
    let body: unknown;
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));

      return jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                recipe: {
                  title: "Lemon Pasta",
                  description: "A bright pasta tossed with lemon, basil, and olive oil.",
                  instructions: "1. Boil pasta.\n2. Toss with lemon, basil, and olive oil.",
                  ingredients: [
                    { name: "pasta", amount: "8 oz" },
                    { name: "lemon", amount: "2" },
                  ],
                },
              }),
            },
          },
        ],
      });
    };

    await generateRecipeFromPrompt("lemon pasta", {
      env: { OPENROUTER_API_KEY: "openrouter-key" },
      fetcher,
    });

    expect(body).toMatchObject({
      model: "openai/gpt-5.4-mini",
      response_format: {
        type: "json_schema",
        json_schema: {
          strict: true,
                  schema: {
                    required: ["recipe"],
                    additionalProperties: false,
                    properties: {
                      recipe: {
                        required: ["title", "description", "instructions", "ingredients", "source"],
                      },
                    },
                  },
                },
              },
      provider: {
        require_parameters: true,
      },
    });
    expect(body).not.toMatchObject({
      temperature: expect.any(Number),
    });

    const requestBody = body as {
      messages?: Array<{ role?: string; content?: string }>;
      response_format?: {
        json_schema?: {
          schema?: {
            properties?: {
              recipe?: {
                properties?: {
                  description?: {
                    description?: string;
                  };
                };
              };
            };
          };
        };
      };
    };
    const systemMessage = requestBody.messages?.find((message) => message.role === "system");
    const descriptionSchema =
      requestBody.response_format?.json_schema?.schema?.properties?.recipe?.properties
        ?.description?.description;
    const sourceSchema =
      requestBody.response_format?.json_schema?.schema?.properties?.recipe?.properties?.source
        ?.description;

    expect(systemMessage?.content).toContain(
      "Examples: 'A bright pasta tossed with lemon, basil, and parmesan.'",
    );
    expect(systemMessage?.content).toContain(
      "preserve that link in the optional source field.",
    );
    expect(descriptionSchema).toContain(
      "Do not include cooking steps, timing, instructions, or phrases like 'this recipe'.",
    );
    expect(sourceSchema).toContain("https://www.seriouseats.com/recipes/2024/03/hot-sauce.html");
  });

  test("parses valid OpenRouter responses", async () => {
    const recipe = await generateRecipeFromPrompt("tomato soup", {
      env: { OPENROUTER_API_KEY: "openrouter-key" },
      fetcher: async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  recipe: {
                    title: "Tomato Soup",
                    description: "A smooth tomato soup finished with simple seasoning.",
                    instructions: "1. Simmer tomatoes until soft.\n2. Blend and season.",
                    ingredients: [{ name: "tomatoes", amount: "4 cups" }],
                    source: null,
                  },
                }),
              },
            },
          ],
        }),
    });

    expect(recipe).toEqual({
      title: "Tomato Soup",
      description: "A smooth tomato soup finished with simple seasoning.",
      instructions: "1. Simmer tomatoes until soft.\n2. Blend and season.",
      ingredients: [{ name: "tomatoes", amount: "4 cups" }],
    });
  });

  test("preserves source URLs from structured output", async () => {
    const recipe = await generateRecipeFromPrompt("https://example.com/recipe", {
      env: { OPENROUTER_API_KEY: "openrouter-key" },
      fetcher: async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  recipe: {
                    title: "Hot Sauce",
                    description: "A tangy fermented hot sauce.",
                    instructions: "1. Ferment chiles.\n2. Blend.",
                    ingredients: [{ name: "chiles", amount: "1 lb" }],
                    source: "https://example.com/recipe",
                  },
                }),
              },
            },
          ],
        }),
    });

    expect(recipe.source).toBe("https://example.com/recipe");
  });

  test("rejects responses without a separate description", async () => {
    await expect(
      generateRecipeFromPrompt("tomato soup", {
        env: { OPENROUTER_API_KEY: "openrouter-key" },
        fetcher: async () =>
          jsonResponse({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    recipe: {
                      title: "Tomato Soup",
                      instructions: "1. Simmer tomatoes until soft.\n2. Blend and season.",
                      ingredients: [{ name: "tomatoes", amount: "4 cups" }],
                    },
                  }),
                },
              },
            ],
          }),
      }),
    ).rejects.toThrow("Recipe description is missing.");
  });

  test("returns a clear error for invalid JSON", async () => {
    await expect(
      generateRecipeFromPrompt("bad json", {
        env: { OPENROUTER_API_KEY: "openrouter-key" },
        fetcher: async () =>
          jsonResponse({
            choices: [{ message: { content: "not json" } }],
          }),
      }),
    ).rejects.toThrow("OpenRouter returned invalid JSON");
  });

  test("redacts API keys from OpenRouter errors", async () => {
    await expect(
      generateRecipeFromPrompt("failed request", {
        env: { OPENROUTER_API_KEY: "sk-secret-key" },
        fetcher: async () =>
          new Response("Authorization: Bearer sk-secret-key", {
            status: 401,
          }),
      }),
    ).rejects.toThrow("Bearer [redacted]");
  });

  test("sends image content to OpenRouter with the strict recipe schema", async () => {
    let body: unknown;
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));

      return jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                recipe: {
                  title: "Image Recipe",
                  description: "A clear recipe captured from an image.",
                  instructions: "1. Read the image.\n2. Cook the recipe.",
                  ingredients: [{ name: "ingredient", amount: "1 cup" }],
                },
              }),
            },
          },
        ],
      });
    };

    await generateRecipeFromImage(
      {
        imageBase64: Buffer.from("image").toString("base64"),
        mimeType: "image/png",
      },
      {
        env: { OPENROUTER_API_KEY: "openrouter-key" },
        fetcher,
      },
    );

    expect(body).toMatchObject({
      response_format: {
        type: "json_schema",
        json_schema: {
          strict: true,
        },
      },
      messages: [
        expect.any(Object),
        {
          role: "user",
          content: [
            { type: "text", text: expect.any(String) },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${Buffer.from("image").toString("base64")}`,
              },
            },
          ],
        },
      ],
    });
  });

  test("rejects unsupported image types", async () => {
    await expect(
      generateRecipeFromImage(
        {
          imageBase64: Buffer.from("image").toString("base64"),
          mimeType: "image/heic",
        },
        {
          env: { OPENROUTER_API_KEY: "openrouter-key" },
        },
      ),
    ).rejects.toThrow("Recipe image must be a JPEG, PNG, or WebP file.");
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
