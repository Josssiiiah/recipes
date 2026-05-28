import { Elysia, t } from "elysia";

import {
  generateRecipeFromImage,
  generateRecipeFromPrompt,
  sanitizeErrorMessage,
} from "./recipe-ai";
import { importRecipeFromInput, RecipeImportInputError } from "./recipe-import";

const port = Number(process.env.PORT ?? 4874);
const hostname = process.env.HOST;
const isDevelopment = process.env.NODE_ENV !== "production";
const localDevOrigins = isDevelopment
  ? [
      "http://localhost:4875",
      "http://127.0.0.1:4875",
      "http://localhost:19006",
      "http://127.0.0.1:19006",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]
  : [];
const corsOrigins = [
  "recipelibrary://",
  ...localDevOrigins,
  process.env.MOBILE_ORIGIN,
  process.env.WEB_ORIGIN,
].filter((origin): origin is string => Boolean(origin));

type ResponseSet = {
  headers: Record<string, string | number>;
  status?: unknown;
};

function applyCorsHeaders(request: Request, set: ResponseSet) {
  const origin = request.headers.get("origin");
  const allowedOrigin = origin && corsOrigins.includes(origin) ? origin : corsOrigins[0];

  if (allowedOrigin) {
    set.headers["Access-Control-Allow-Origin"] = allowedOrigin;
  }

  set.headers["Access-Control-Allow-Headers"] = "content-type";
  set.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
  set.headers.Vary = "Origin";
}

export const app = new Elysia()
  .onRequest(({ request, set }) => {
    applyCorsHeaders(request, set);
  })
  .options("*", ({ request, set }) => {
    applyCorsHeaders(request, set);
    set.status = 204;

    return "";
  })
  .get("/", () => "Recipe Library API")
  .post(
    "/api/recipes/parse",
    async ({ body, status }) => {
      const prompt = body.prompt.trim();

      if (!prompt) {
        return status(400, { error: "Describe the recipe before generating it." });
      }

      try {
        const recipe = await generateRecipeFromPrompt(prompt);

        return { recipe };
      } catch (error) {
        return status(502, { error: sanitizeErrorMessage(getErrorMessage(error)) });
      }
    },
    {
      body: t.Object({
        prompt: t.String(),
      }),
    },
  )
  .post(
    "/api/recipes/import",
    async ({ body, status }) => {
      const input = body.input.trim();

      if (!input) {
        return status(400, {
          error: "Paste a recipe, recipe link, or YouTube link before importing.",
        });
      }

      try {
        const recipe = await importRecipeFromInput(input);

        return { recipe };
      } catch (error) {
        const message = sanitizeErrorMessage(getErrorMessage(error));

        if (error instanceof RecipeImportInputError) {
          return status(400, { error: message });
        }

        return status(502, { error: message });
      }
    },
    {
      body: t.Object({
        input: t.String(),
      }),
    },
  )
  .post(
    "/api/recipes/import-image",
    async ({ body, status }) => {
      try {
        const recipe = await generateRecipeFromImage({
          imageBase64: body.imageBase64,
          mimeType: body.mimeType,
        });

        return { recipe };
      } catch (error) {
        const message = sanitizeErrorMessage(getErrorMessage(error));
        const isInputError =
          message.startsWith("Choose a recipe image") || message.startsWith("Recipe image");

        return status(isInputError ? 400 : 502, { error: message });
      }
    },
    {
      body: t.Object({
        imageBase64: t.String(),
        mimeType: t.String(),
      }),
    },
  );

if (import.meta.main) {
  app.listen(hostname ? { port, hostname } : port);
  console.log(`Recipe Library API listening on ${hostname ?? "0.0.0.0"}:${port}`);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
