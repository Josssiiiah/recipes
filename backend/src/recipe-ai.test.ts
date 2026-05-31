import { describe, expect, test } from "bun:test";

import { generateRecipeFromImage, generateRecipeFromPrompt } from "./recipe-ai";
import { app } from "./index";
import { resetAiEndpointRateLimitsForTests } from "./ai-endpoint-guards";

describe("recipe parser route", () => {
  test("sets the request ID response header", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/recipes/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": "test-request-123",
          "X-Forwarded-For": "192.0.2.10",
        },
        body: JSON.stringify({ prompt: "   " }),
      }),
    );

    expect(response.headers.get("X-Request-ID")).toBe("test-request-123");
  });

  test("rejects blank prompts with 400", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/recipes/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "192.0.2.11",
        },
        body: JSON.stringify({ prompt: "   " }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Describe the recipe before generating it.",
    });
  });

  test("rejects oversized JSON bodies before parsing", async () => {
    resetAiEndpointRateLimitsForTests();
    const previousMaxBytes = process.env.AI_JSON_BODY_MAX_BYTES;
    process.env.AI_JSON_BODY_MAX_BYTES = "64";

    try {
      const body = JSON.stringify({ prompt: "x".repeat(128) });
      const response = await app.handle(
        new Request("http://localhost/api/recipes/parse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(Buffer.byteLength(body)),
            "X-Forwarded-For": "192.0.2.12",
          },
          body,
        }),
      );

      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ error: "Request body is too large." });
    } finally {
      if (previousMaxBytes === undefined) {
        delete process.env.AI_JSON_BODY_MAX_BYTES;
      } else {
        process.env.AI_JSON_BODY_MAX_BYTES = previousMaxBytes;
      }
    }
  });

  test("rejects parsed prompts over the text length cap", async () => {
    resetAiEndpointRateLimitsForTests();
    const response = await app.handle(
      new Request("http://localhost/api/recipes/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "192.0.2.13",
        },
        body: JSON.stringify({ prompt: "x".repeat(12001) }),
      }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "Recipe prompt is too long. Keep it under 12000 characters.",
    });
  });

  test("does not reject image bodies under the image cap with the generic JSON body cap", async () => {
    resetAiEndpointRateLimitsForTests();
    const previousApiKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "";

    try {
      const imageBase64 = Buffer.alloc(1024 * 1024).toString("base64");
      const body = JSON.stringify({ imageBase64, mimeType: "image/jpeg" });
      const response = await app.handle(
        new Request("http://localhost/api/recipes/import-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": String(Buffer.byteLength(body)),
            "X-Forwarded-For": "192.0.2.16",
          },
          body,
        }),
      );

      expect(Buffer.byteLength(body)).toBeGreaterThan(1024 * 1024);
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({
        error: "OPENROUTER_API_KEY is not configured.",
      });
    } finally {
      if (previousApiKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = previousApiKey;
      }
    }
  });

  test("rate limits repeated AI requests by client IP", async () => {
    resetAiEndpointRateLimitsForTests();
    const originalLog = console.log;
    console.log = () => {};
    const makeRequest = () =>
      app.handle(
        new Request("http://localhost/api/recipes/parse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": "192.0.2.14",
          },
          body: JSON.stringify({ prompt: "   " }),
        }),
      );

    try {
      for (let index = 0; index < 20; index += 1) {
        const response = await makeRequest();
        expect(response.status).toBe(400);
      }

      const response = await makeRequest();

      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("60");
      expect(await response.json()).toEqual({ error: "Too many AI requests. Try again later." });
    } finally {
      console.log = originalLog;
    }
  });

  test("writes structured request logs without request body contents", async () => {
    resetAiEndpointRateLimitsForTests();
    const originalLog = console.log;
    const logs: unknown[][] = [];
    console.log = (...args: unknown[]) => {
      logs.push(args);
    };

    try {
      const response = await app.handle(
        new Request("http://localhost/api/recipes/parse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Request-ID": "log-test-request",
            "X-Forwarded-For": "192.0.2.15",
          },
          body: JSON.stringify({ prompt: `${"x".repeat(12000)} sk-secret-key` }),
        }),
      );

      expect(response.status).toBe(413);
    } finally {
      console.log = originalLog;
    }

    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).toContain("backend_ai_request");
    expect(serializedLogs).toContain("log-test-request");
    expect(serializedLogs).toContain("/api/recipes/parse");
    expect(serializedLogs).not.toContain("sk-secret-key");
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
                  instructions?: {
                    description?: string;
                  };
                  source?: {
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
    const instructionsSchema =
      requestBody.response_format?.json_schema?.schema?.properties?.recipe?.properties
        ?.instructions?.description;
    const sourceSchema =
      requestBody.response_format?.json_schema?.schema?.properties?.recipe?.properties?.source
        ?.description;

    expect(systemMessage?.content).toContain(
      "Examples: 'A bright pasta tossed with lemon, basil, and parmesan.'",
    );
    expect(systemMessage?.content).toContain(
      "preserve that link in the optional source field.",
    );
    expect(systemMessage?.content).toContain("Never output placeholders, bare numbers");
    expect(descriptionSchema).toContain(
      "Do not include cooking steps, timing, instructions, or phrases like 'this recipe'.",
    );
    expect(instructionsSchema).toContain("Every step must include a real cooking action");
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

  test("maps OpenRouter timeouts to actionable errors", async () => {
    await expect(
      generateRecipeFromPrompt("slow request", {
        env: {
          OPENROUTER_API_KEY: "openrouter-key",
          AI_TIMEOUT_MS: "5",
        },
        fetcher: async () => new Promise<Response>(() => {}),
      }),
    ).rejects.toThrow("OpenRouter request timed out after 5 ms.");
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

  test("rejects images over the configured parsed byte cap", async () => {
    await expect(
      generateRecipeFromImage(
        {
          imageBase64: Buffer.from("image").toString("base64"),
          mimeType: "image/png",
        },
        {
          env: {
            OPENROUTER_API_KEY: "openrouter-key",
            AI_IMAGE_MAX_BYTES: "3",
          },
        },
      ),
    ).rejects.toThrow("Recipe image is too large. Choose an image under 3 bytes.");
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
