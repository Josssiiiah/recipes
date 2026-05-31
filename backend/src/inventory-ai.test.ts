import { describe, expect, test } from "bun:test";

import { generateInventoryFromImage } from "./inventory-ai";
import { app } from "./index";

describe("inventory scanner route", () => {
  test("rejects blank images with 400", async () => {
    const response = await app.handle(
      new Request("http://localhost/api/inventory/scan-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: "   ", mimeType: "image/jpeg" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Take an inventory photo before scanning it.",
    });
  });
});

describe("OpenAI inventory scanning", () => {
  test("sends image input with a strict structured output schema", async () => {
    let requestedUrl = "";
    let body: unknown;
    const imageBase64 = Buffer.from("image").toString("base64");
    const fetcher = async (url: string, init: RequestInit) => {
      requestedUrl = url;
      body = JSON.parse(String(init.body));

      return jsonResponse({
        output_text: JSON.stringify({
          items: [
            { name: "milk", quantity: "1 carton", storage: "fridge" },
            { name: "spinach", quantity: "1 bag", storage: "fridge" },
          ],
        }),
      });
    };

    const inventory = await generateInventoryFromImage(
      {
        imageBase64,
        mimeType: "image/png",
      },
      {
        env: { OPENAI_API_KEY: "openai-key" },
        fetcher,
      },
    );

    expect(requestedUrl).toBe("https://api.openai.com/v1/responses");
    expect(body).toMatchObject({
      model: "gpt-4.1-mini",
      max_output_tokens: 1200,
      input: [
        expect.objectContaining({ role: "system" }),
        {
          role: "user",
          content: [
            { type: "input_text", text: expect.any(String) },
            {
              type: "input_image",
              image_url: `data:image/png;base64,${imageBase64}`,
              detail: "low",
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "inventory_scan",
          strict: true,
          schema: {
            required: ["items"],
            additionalProperties: false,
            properties: {
              items: {
                items: {
                  required: ["name", "quantity", "storage"],
                  additionalProperties: false,
                },
              },
            },
          },
        },
      },
    });
    expect(inventory.items).toEqual([
      { name: "milk", quantity: "1 carton", storage: "fridge", text: "1 carton milk" },
      { name: "spinach", quantity: "1 bag", storage: "fridge", text: "1 bag spinach" },
    ]);
  });

  test("parses message output content when output_text is absent", async () => {
    const inventory = await generateInventoryFromImage(
      {
        imageBase64: Buffer.from("image").toString("base64"),
        mimeType: "image/jpeg",
      },
      {
        env: { OPENAI_API_KEY: "openai-key" },
        fetcher: async () =>
          jsonResponse({
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      items: [{ name: "black beans", quantity: null, storage: "pantry" }],
                    }),
                  },
                ],
              },
            ],
          }),
      },
    );

    expect(inventory.items).toEqual([
      { name: "black beans", quantity: null, storage: "pantry", text: "black beans" },
    ]);
  });

  test("rejects unsupported image types", async () => {
    await expect(
      generateInventoryFromImage(
        {
          imageBase64: Buffer.from("image").toString("base64"),
          mimeType: "image/heic",
        },
        {
          env: { OPENAI_API_KEY: "openai-key" },
        },
      ),
    ).rejects.toThrow("Inventory image must be a JPEG, PNG, or WebP file.");
  });

  test("maps OpenAI inventory timeouts to actionable errors", async () => {
    await expect(
      generateInventoryFromImage(
        {
          imageBase64: Buffer.from("image").toString("base64"),
          mimeType: "image/png",
        },
        {
          env: {
            OPENAI_API_KEY: "openai-key",
            AI_TIMEOUT_MS: "5",
          },
          fetcher: async () => new Promise<Response>(() => {}),
        },
      ),
    ).rejects.toThrow("OpenAI request timed out after 5 ms.");
  });
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
