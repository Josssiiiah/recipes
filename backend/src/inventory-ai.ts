import { enforceImageMaxBytes, fetchWithAiTimeout } from "./ai-endpoint-guards";
import { sanitizeErrorMessage } from "./recipe-ai";

export type StructuredInventoryItem = {
  name: string;
  quantity: string | null;
  storage: string | null;
  text: string;
};

type Env = Record<string, string | undefined>;
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type OpenAIResponse = {
  output_text?: unknown;
  output?: Array<{
    type?: unknown;
    content?: Array<{
      type?: unknown;
      text?: unknown;
    }>;
  }>;
  status?: unknown;
};

const openAIResponsesUrl = "https://api.openai.com/v1/responses";
const defaultInventoryModel = "gpt-4.1-mini";
const allowedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export const inventoryResponseSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description:
        "Visible food, beverage, and grocery inventory items found in the image.",
      maxItems: 50,
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "Short grocery name, such as 'milk', 'spinach', 'black beans', or 'frozen peas'.",
          },
          quantity: {
            anyOf: [{ type: "string" }, { type: "null" }],
            description:
              "Visible amount or package count, such as '2', '1 bag', '12 oz', or null when unclear.",
          },
          storage: {
            anyOf: [{ type: "string" }, { type: "null" }],
            description:
              "Likely storage area visible in the photo, such as 'fridge', 'freezer', 'pantry', or null when unclear.",
          },
        },
        required: ["name", "quantity", "storage"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

export async function generateInventoryFromImage(
  input: {
    imageBase64: string;
    mimeType: string;
  },
  options: {
    env?: Env;
    fetcher?: Fetcher;
  } = {},
): Promise<{ items: StructuredInventoryItem[] }> {
  const imageBase64 = input.imageBase64.trim();
  const mimeType = input.mimeType.trim().toLowerCase();

  if (!imageBase64) {
    throw new Error("Take an inventory photo before scanning it.");
  }

  if (!allowedImageMimeTypes.has(mimeType)) {
    throw new Error("Inventory image must be a JPEG, PNG, or WebP file.");
  }

  enforceImageMaxBytes(imageBase64, "Inventory image", options.env);

  return requestStructuredInventory(imageBase64, mimeType, options);
}

async function requestStructuredInventory(
  imageBase64: string,
  mimeType: string,
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

  const model = env.OPENAI_INVENTORY_MODEL?.trim() || defaultInventoryModel;
  const fetcher = options.fetcher ?? fetch;
  const response = await fetchWithAiTimeout(
    "OpenAI",
    fetcher,
    openAIResponsesUrl,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: inventorySystemPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  "Identify every visible food, beverage, condiment, or grocery package in this kitchen inventory photo. Return only items that are visible enough to inventory.",
              },
              {
                type: "input_image",
                image_url: `data:${mimeType};base64,${imageBase64}`,
                detail: "low",
              },
            ],
          },
        ],
        max_output_tokens: 1200,
        text: {
          format: {
            type: "json_schema",
            name: "inventory_scan",
            schema: inventoryResponseSchema,
            strict: true,
          },
        },
      }),
    },
    env,
  );

  if (!response.ok) {
    throw new Error(
      `OpenAI inventory scan failed with status ${response.status}: ${sanitizeErrorMessage(
        await response.text(),
      )}`,
    );
  }

  const payload = (await response.json()) as OpenAIResponse;

  if (payload.status === "incomplete") {
    throw new Error("OpenAI inventory scan did not complete.");
  }

  const content = readOpenAIOutputText(payload);

  if (typeof content !== "string") {
    throw new Error("OpenAI response did not include structured inventory content.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("OpenAI returned invalid JSON for inventory.");
  }

  return normalizeStructuredInventory(parsed);
}

const inventorySystemPrompt = [
  "You extract household food inventory from images.",
  "Return JSON that matches the requested schema.",
  "Only include foods, beverages, condiments, and grocery packages that are visible in the image.",
  "Do not infer hidden items or add recipe suggestions.",
  "Use concise grocery names and combine obvious duplicate visible items.",
  "If quantity or storage is not visible, use null for that field.",
].join(" ");

function readOpenAIOutputText(payload: OpenAIResponse) {
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  for (const output of payload.output ?? []) {
    if (output.type !== "message") {
      continue;
    }

    for (const content of output.content ?? []) {
      if (typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return null;
}

function normalizeStructuredInventory(value: unknown): { items: StructuredInventoryItem[] } {
  if (!value || typeof value !== "object") {
    throw new Error("Inventory response was not an object.");
  }

  const root = value as { items?: unknown };

  if (!Array.isArray(root.items)) {
    throw new Error("Inventory response did not include items.");
  }

  const seen = new Set<string>();
  const items = root.items
    .map(normalizeInventoryItem)
    .filter((item): item is StructuredInventoryItem => item !== null)
    .filter((item) => {
      const key = item.text.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

  return { items };
}

function normalizeInventoryItem(value: unknown): StructuredInventoryItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    name?: unknown;
    quantity?: unknown;
    storage?: unknown;
  };
  const name = normalizeString(candidate.name);

  if (!name) {
    return null;
  }

  const quantity = normalizeString(candidate.quantity);
  const storage = normalizeString(candidate.storage);
  const text = [quantity, name].filter(Boolean).join(" ");

  return {
    name,
    quantity: quantity || null,
    storage: storage || null,
    text,
  };
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}
