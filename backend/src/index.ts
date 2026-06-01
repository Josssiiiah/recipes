import { Elysia, t } from "elysia";

import {
  enforceImageMaxBytes,
  enforceTextMaxChars,
  guardAiRequest,
  logRequest,
  prepareRequest,
  RequestTooLargeError,
} from "./ai-endpoint-guards";
import {
  cacheKeys,
  cacheTtlSeconds,
  hashedCacheKey,
  invalidateCacheKeys,
  readThroughJsonCache,
} from "./cache";
import {
  clearCompletedShoppingListItems,
  createInventoryItem,
  createMealPlanEntry,
  createRecipe,
  createRecipeGenerationJob,
  createShoppingListItem,
  deleteInventoryItem,
  deleteMealPlanEntry,
  deleteRecipe,
  deleteShoppingListItem,
  listMealPlanEntries,
  listRecipeGenerationJobs,
  listInventoryItems,
  listRecipes,
  listShoppingListItems,
  updateRecipe,
  updateRecipeImageState,
  updateRecipeNotes,
  toggleShoppingListItem,
  type InventoryItem,
  type MealPlanEntry,
  type MealSlot,
  type Recipe,
  type RecipeGenerationJob,
  type RecipeImageStatus,
  type ShoppingListItem,
} from "./database";
import { generateInventoryFromImage } from "./inventory-ai";
import {
  generateRecipeFromImage,
  generateRecipeFromPrompt,
  sanitizeErrorMessage,
} from "./recipe-ai";
import { generateRecipeHeroImage } from "./recipe-image-ai";
import {
  enqueueRecipeHeroImageJob,
  wakeRecipeGenerationQueue,
} from "./recipe-generation-queue";
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

function normalizeRecipeBodySource(source: unknown) {
  return typeof source === "string" && source.trim() ? source.trim() : null;
}

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

  set.headers["Access-Control-Allow-Headers"] = "content-type, x-recipe-client-id";
  set.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
  set.headers.Vary = "Origin";
}

export const app = new Elysia()
  .onRequest(({ request, set, server }) => {
    prepareRequest(request, set);
    applyCorsHeaders(request, set);

    const guardResponse = guardAiRequest(
      request,
      set,
      server?.requestIP(request)?.address,
    );

    if (guardResponse) {
      return guardResponse;
    }
  })
  .onAfterHandle(({ request, set, responseValue }) => {
    logRequest(request, set, "completed", {}, responseValue);
  })
  .onError(({ request, set, error }) => {
    logRequest(request, set, "failed", {
      error: sanitizeErrorMessage(getErrorMessage(error)),
    });
  })
  .options("*", ({ request, set }) => {
    applyCorsHeaders(request, set);
    set.status = 204;

    return "";
  })
  .get("/", () => "Recipe Library API")
  .get("/api/recipes", async ({ request, set }) => {
    try {
      const result = await readThroughJsonCache({
        key: cacheKeys.recipesList,
        ttlSeconds: cacheTtlSeconds.lists,
        context: { route: "/api/recipes", operation: "list" },
        load: () => listRecipes(),
      });

      const includeInlineImages = new URL(request.url).searchParams.get("includeImages") === "1";

      setCacheHeaders(set, result.status);
      return {
        recipes: includeInlineImages ? result.value : result.value.map(stripInlineRecipeImage),
      };
    } catch (error) {
      return databaseErrorResponse(set, "/api/recipes", "list", error);
    }
  })
  .post(
    "/api/recipes",
    async ({ body, request, set }) => {
      const ownerId = readOwnerId(request, set);
      if (!ownerId) {
        return { error: "Recipe client ID is required." };
      }

      try {
        const source = normalizeRecipeBodySource(body.source);
        const recipe: Recipe = {
          id: body.id,
          title: body.title.trim(),
          description: body.description.trim(),
          ...(body.notes?.trim() ? { notes: body.notes.trim() } : {}),
          instructions: body.instructions.trim(),
          ingredients: normalizeIngredientBody(body.ingredients),
          ...(source ? { source } : {}),
          imageStatus: body.imageStatus,
          createdAt: body.createdAt,
          updatedAt: body.updatedAt,
        };

        const saved = await createRecipe(ownerId, recipe);
        await invalidateCacheKeys([cacheKeys.recipesList], {
          route: "/api/recipes",
          operation: "create",
        });

        return { recipe: saved };
      } catch (error) {
        return databaseErrorResponse(set, "/api/recipes", "create", error);
      }
    },
    {
      body: t.Object({
        id: t.String(),
        title: t.String(),
        description: t.String(),
        notes: t.Optional(t.String()),
        instructions: t.String(),
        ingredients: t.Array(
          t.Object({
            name: t.String(),
            amount: t.String(),
          }),
        ),
        source: t.Optional(t.Union([t.String(), t.Null()])),
        imageStatus: t.Optional(t.Union([t.Literal("pending"), t.Literal("ready"), t.Literal("failed")])),
        createdAt: t.String(),
        updatedAt: t.String(),
      }),
    },
  )
  .put(
    "/api/recipes/:id",
    async ({ params, body, request, set }) => {
      const ownerId = readOwnerId(request, set);
      if (!ownerId) {
        return { error: "Recipe client ID is required." };
      }

      try {
        const recipe = await updateRecipe(ownerId, params.id, {
          title: body.title.trim(),
          description: body.description.trim(),
          ...(body.notes?.trim() ? { notes: body.notes.trim() } : {}),
          instructions: body.instructions.trim(),
          ingredients: normalizeIngredientBody(body.ingredients),
          ...(Object.prototype.hasOwnProperty.call(body, "source")
            ? { source: normalizeRecipeBodySource(body.source) }
            : {}),
        });

        if (!recipe) {
          return errorResponse(set, 404, "Recipe not found.");
        }

        await invalidateCacheKeys([cacheKeys.recipesList], {
          route: "/api/recipes/:id",
          operation: "update",
        });

        return { recipe };
      } catch (error) {
        return databaseErrorResponse(set, "/api/recipes/:id", "update", error, {
          recipeId: params.id,
        });
      }
    },
    {
      body: t.Object({
        title: t.String(),
        description: t.String(),
        notes: t.Optional(t.String()),
        instructions: t.String(),
        ingredients: t.Array(
          t.Object({
            name: t.String(),
            amount: t.String(),
          }),
        ),
        source: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    },
  )
  .patch(
    "/api/recipes/:id/image",
    async ({ params, body, request, set }) => {
      const ownerId = readOwnerId(request, set);
      if (!ownerId) {
        return { error: "Recipe client ID is required." };
      }

      try {
        const recipe = await updateRecipeImageState(ownerId, params.id, {
          imageStatus: body.imageStatus as RecipeImageStatus,
          imageUri: body.imageUri,
          imageError: body.imageError,
        });

        if (!recipe) {
          return errorResponse(set, 404, "Recipe not found.");
        }

        await invalidateCacheKeys([cacheKeys.recipesList], {
          route: "/api/recipes/:id/image",
          operation: "update_image",
        });

        return { recipe };
      } catch (error) {
        return databaseErrorResponse(set, "/api/recipes/:id/image", "update_image", error, {
          recipeId: params.id,
        });
      }
    },
    {
      body: t.Object({
        imageStatus: t.Union([t.Literal("pending"), t.Literal("ready"), t.Literal("failed")]),
        imageUri: t.Optional(t.Union([t.String(), t.Null()])),
        imageError: t.Optional(t.Union([t.String(), t.Null()])),
      }),
    },
  )
  .post("/api/recipes/:id/image/generation-jobs", async ({ params, request, set }) => {
    const ownerId = readOwnerId(request, set);
    if (!ownerId) {
      return { error: "Recipe client ID is required." };
    }

    try {
      const result = await enqueueRecipeHeroImageJob(ownerId, params.id);

      if (!result) {
        return errorResponse(set, 404, "Recipe not found.");
      }

      set.status = 202;
      return {
        recipe: result.recipe,
        job: result.job ? publicRecipeGenerationJob(result.job) : null,
      };
    } catch (error) {
      return databaseErrorResponse(
        set,
        "/api/recipes/:id/image/generation-jobs",
        "enqueue_image_generation",
        error,
        {
          recipeId: params.id,
        },
      );
    }
  })
  .get("/api/recipes/generation-jobs", async ({ request, set }) => {
    const ownerId = readOwnerId(request, set);
    if (!ownerId) {
      return { error: "Recipe client ID is required." };
    }

    try {
      const jobs = await listRecipeGenerationJobs(ownerId);

      return { jobs: jobs.map(publicRecipeGenerationJob) };
    } catch (error) {
      return databaseErrorResponse(set, "/api/recipes/generation-jobs", "list_jobs", error);
    }
  })
  .post(
    "/api/recipes/generation-jobs/input",
    async ({ body, request, set }) => {
      const ownerId = readOwnerId(request, set);
      if (!ownerId) {
        return { error: "Recipe client ID is required." };
      }

      const input = body.input.trim();

      if (!input) {
        return errorResponse(
          set,
          400,
          "Paste a recipe, recipe link, or YouTube link before importing.",
        );
      }

      try {
        enforceTextMaxChars(input, "Recipe import input");
        const now = new Date().toISOString();
        const job = await createRecipeGenerationJob(ownerId, {
          id: createId("recipe-job"),
          recipeId: createId("recipe"),
          kind: "recipe_input",
          input: { input },
          createdAt: now,
        });

        wakeRecipeGenerationQueue();
        set.status = 202;

        return { job: publicRecipeGenerationJob(job) };
      } catch (error) {
        const message = sanitizeErrorMessage(getErrorMessage(error));

        if (error instanceof RequestTooLargeError) {
          return errorResponse(set, 413, message);
        }

        return databaseErrorResponse(
          set,
          "/api/recipes/generation-jobs/input",
          "enqueue_recipe_input",
          error,
        );
      }
    },
    {
      body: t.Object({
        input: t.String(),
      }),
    },
  )
  .post(
    "/api/recipes/generation-jobs/image",
    async ({ body, request, set }) => {
      const ownerId = readOwnerId(request, set);
      if (!ownerId) {
        return { error: "Recipe client ID is required." };
      }

      try {
        enforceImageMaxBytes(body.imageBase64, "Recipe image");
        const now = new Date().toISOString();
        const job = await createRecipeGenerationJob(ownerId, {
          id: createId("recipe-image-import-job"),
          recipeId: createId("recipe"),
          kind: "recipe_image",
          input: {
            imageBase64: body.imageBase64,
            mimeType: body.mimeType,
          },
          createdAt: now,
        });

        wakeRecipeGenerationQueue();
        set.status = 202;

        return { job: publicRecipeGenerationJob(job) };
      } catch (error) {
        const message = sanitizeErrorMessage(getErrorMessage(error));

        if (error instanceof RequestTooLargeError) {
          return errorResponse(set, 413, message);
        }

        return databaseErrorResponse(
          set,
          "/api/recipes/generation-jobs/image",
          "enqueue_recipe_image_import",
          error,
        );
      }
    },
    {
      body: t.Object({
        imageBase64: t.String(),
        mimeType: t.String(),
      }),
    },
  )
  .patch(
    "/api/recipes/:id/notes",
    async ({ params, body, request, set }) => {
      const ownerId = readOwnerId(request, set);
      if (!ownerId) {
        return { error: "Recipe client ID is required." };
      }

      try {
        const recipe = await updateRecipeNotes(ownerId, params.id, body.notes.trim() || null);

        if (!recipe) {
          return errorResponse(set, 404, "Recipe not found.");
        }

        await invalidateCacheKeys([cacheKeys.recipesList], {
          route: "/api/recipes/:id/notes",
          operation: "update_notes",
        });

        return { recipe };
      } catch (error) {
        return databaseErrorResponse(set, "/api/recipes/:id/notes", "update_notes", error, {
          recipeId: params.id,
        });
      }
    },
    {
      body: t.Object({
        notes: t.String(),
      }),
    },
  )
  .delete("/api/recipes/:id", async ({ params, request, set }) => {
    const ownerId = readOwnerId(request, set);
    if (!ownerId) {
      return { error: "Recipe client ID is required." };
    }

    try {
      await deleteRecipe(ownerId, params.id);
      await invalidateCacheKeys([cacheKeys.recipesList], {
        route: "/api/recipes/:id",
        operation: "delete",
      });
      set.status = 204;
      return "";
    } catch (error) {
      return databaseErrorResponse(set, "/api/recipes/:id", "delete", error, {
        recipeId: params.id,
      });
    }
  })
  .get("/api/shopping-list", async ({ request, set }) => {
    const ownerId = readOwnerId(request, set);
    if (!ownerId) {
      return { error: "Recipe client ID is required." };
    }

    try {
      const result = await readThroughJsonCache({
        key: ownerCacheKey(cacheKeys.shoppingList, ownerId),
        ttlSeconds: cacheTtlSeconds.lists,
        context: { route: "/api/shopping-list", operation: "list" },
        load: () => listShoppingListItems(ownerId),
      });

      setCacheHeaders(set, result.status);
      return { items: result.value };
    } catch (error) {
      return databaseErrorResponse(set, "/api/shopping-list", "list", error);
    }
  })
  .post(
    "/api/shopping-list",
    async ({ body, request, set }) => {
      const ownerId = readOwnerId(request, set);
      if (!ownerId) {
        return { error: "Recipe client ID is required." };
      }

      try {
        const item: ShoppingListItem = {
          id: body.id,
          text: body.text.trim(),
          completed: false,
          createdAt: body.createdAt,
          updatedAt: body.updatedAt,
        };

        const saved = await createShoppingListItem(ownerId, item);
        await invalidateCacheKeys([ownerCacheKey(cacheKeys.shoppingList, ownerId)], {
          route: "/api/shopping-list",
          operation: "create",
        });

        return { item: saved };
      } catch (error) {
        return databaseErrorResponse(set, "/api/shopping-list", "create", error);
      }
    },
    {
      body: t.Object({
        id: t.String(),
        text: t.String(),
        createdAt: t.String(),
        updatedAt: t.String(),
      }),
    },
  )
  .delete("/api/shopping-list/completed", async ({ request, set }) => {
    const ownerId = readOwnerId(request, set);
    if (!ownerId) {
      return { error: "Recipe client ID is required." };
    }

    try {
      await clearCompletedShoppingListItems(ownerId);
      await invalidateCacheKeys([ownerCacheKey(cacheKeys.shoppingList, ownerId)], {
        route: "/api/shopping-list/completed",
        operation: "clear_completed",
      });
      set.status = 204;
      return "";
    } catch (error) {
      return databaseErrorResponse(set, "/api/shopping-list/completed", "clear_completed", error);
    }
  })
  .patch("/api/shopping-list/:id/toggle", async ({ params, request, set }) => {
    const ownerId = readOwnerId(request, set);
    if (!ownerId) {
      return { error: "Recipe client ID is required." };
    }

    try {
      const item = await toggleShoppingListItem(ownerId, params.id);

      if (!item) {
        return errorResponse(set, 404, "Shopping-list item not found.");
      }

      await invalidateCacheKeys([ownerCacheKey(cacheKeys.shoppingList, ownerId)], {
        route: "/api/shopping-list/:id/toggle",
        operation: "toggle",
      });

      return { item };
    } catch (error) {
      return databaseErrorResponse(set, "/api/shopping-list/:id/toggle", "toggle", error, {
        itemId: params.id,
      });
    }
  })
  .delete("/api/shopping-list/:id", async ({ params, request, set }) => {
    const ownerId = readOwnerId(request, set);
    if (!ownerId) {
      return { error: "Recipe client ID is required." };
    }

    try {
      await deleteShoppingListItem(ownerId, params.id);
      await invalidateCacheKeys([ownerCacheKey(cacheKeys.shoppingList, ownerId)], {
        route: "/api/shopping-list/:id",
        operation: "delete",
      });
      set.status = 204;
      return "";
    } catch (error) {
      return databaseErrorResponse(set, "/api/shopping-list/:id", "delete", error, {
        itemId: params.id,
      });
    }
  })
  .get("/api/inventory", async ({ request, set }) => {
    const ownerId = readOwnerId(request, set);
    if (!ownerId) {
      return { error: "Recipe client ID is required." };
    }

    try {
      const result = await readThroughJsonCache({
        key: ownerCacheKey(cacheKeys.inventory, ownerId),
        ttlSeconds: cacheTtlSeconds.lists,
        context: { route: "/api/inventory", operation: "list" },
        load: () => listInventoryItems(ownerId),
      });

      setCacheHeaders(set, result.status);
      return { items: result.value };
    } catch (error) {
      return databaseErrorResponse(set, "/api/inventory", "list", error);
    }
  })
  .post(
    "/api/inventory",
    async ({ body, request, set }) => {
      const ownerId = readOwnerId(request, set);
      if (!ownerId) {
        return { error: "Recipe client ID is required." };
      }

      try {
        const item: InventoryItem = {
          id: body.id,
          text: body.text.trim(),
          createdAt: body.createdAt,
          updatedAt: body.updatedAt,
        };

        const saved = await createInventoryItem(ownerId, item);
        await invalidateCacheKeys([ownerCacheKey(cacheKeys.inventory, ownerId)], {
          route: "/api/inventory",
          operation: "create",
        });

        return { item: saved };
      } catch (error) {
        return databaseErrorResponse(set, "/api/inventory", "create", error);
      }
    },
    {
      body: t.Object({
        id: t.String(),
        text: t.String(),
        createdAt: t.String(),
        updatedAt: t.String(),
      }),
    },
  )
  .delete("/api/inventory/:id", async ({ params, request, set }) => {
    const ownerId = readOwnerId(request, set);
    if (!ownerId) {
      return { error: "Recipe client ID is required." };
    }

    try {
      await deleteInventoryItem(ownerId, params.id);
      await invalidateCacheKeys([ownerCacheKey(cacheKeys.inventory, ownerId)], {
        route: "/api/inventory/:id",
        operation: "delete",
      });
      set.status = 204;
      return "";
    } catch (error) {
      return databaseErrorResponse(set, "/api/inventory/:id", "delete", error, {
        itemId: params.id,
      });
    }
  })
  .get("/api/meal-plan", async ({ request, set }) => {
    const ownerId = readOwnerId(request, set);
    if (!ownerId) {
      return { error: "Recipe client ID is required." };
    }

    try {
      const result = await readThroughJsonCache({
        key: ownerCacheKey(cacheKeys.mealPlan, ownerId),
        ttlSeconds: cacheTtlSeconds.lists,
        context: { route: "/api/meal-plan", operation: "list" },
        load: () => listMealPlanEntries(ownerId),
      });

      setCacheHeaders(set, result.status);
      return { entries: result.value };
    } catch (error) {
      return databaseErrorResponse(set, "/api/meal-plan", "list", error);
    }
  })
  .post(
    "/api/meal-plan",
    async ({ body, request, set }) => {
      const ownerId = readOwnerId(request, set);
      if (!ownerId) {
        return { error: "Recipe client ID is required." };
      }

      const recipeTitle = body.recipeTitle.trim();
      const recipeId = body.recipeId.trim();

      if (!recipeId || !recipeTitle) {
        return errorResponse(set, 400, "A recipe is required to plan a meal.");
      }

      try {
        const entry: MealPlanEntry = {
          id: body.id,
          date: body.date,
          slot: body.slot as MealSlot,
          recipeId,
          recipeTitle,
          createdAt: body.createdAt,
        };

        const saved = await createMealPlanEntry(ownerId, entry);
        await invalidateCacheKeys([ownerCacheKey(cacheKeys.mealPlan, ownerId)], {
          route: "/api/meal-plan",
          operation: "create",
        });

        return { entry: saved };
      } catch (error) {
        return databaseErrorResponse(set, "/api/meal-plan", "create", error);
      }
    },
    {
      body: t.Object({
        id: t.String(),
        date: t.String(),
        slot: t.Union([t.Literal("breakfast"), t.Literal("lunch"), t.Literal("dinner")]),
        recipeId: t.String(),
        recipeTitle: t.String(),
        createdAt: t.String(),
      }),
    },
  )
  .delete("/api/meal-plan/:id", async ({ params, request, set }) => {
    const ownerId = readOwnerId(request, set);
    if (!ownerId) {
      return { error: "Recipe client ID is required." };
    }

    try {
      await deleteMealPlanEntry(ownerId, params.id);
      await invalidateCacheKeys([ownerCacheKey(cacheKeys.mealPlan, ownerId)], {
        route: "/api/meal-plan/:id",
        operation: "delete",
      });
      set.status = 204;
      return "";
    } catch (error) {
      return databaseErrorResponse(set, "/api/meal-plan/:id", "delete", error, {
        entryId: params.id,
      });
    }
  })
  .post(
    "/api/recipes/parse",
    async ({ body, set }) => {
      const prompt = body.prompt.trim();

      if (!prompt) {
        return errorResponse(set, 400, "Describe the recipe before generating it.");
      }

      try {
        enforceTextMaxChars(prompt, "Recipe prompt");
        const result = await readThroughJsonCache({
          key: hashedCacheKey("recipe-prompt:v1", prompt),
          ttlSeconds: cacheTtlSeconds.recipePrompt,
          context: { route: "/api/recipes/parse", operation: "parse" },
          load: () => generateRecipeFromPrompt(prompt),
        });

        setCacheHeaders(set, result.status);
        return { recipe: result.value };
      } catch (error) {
        if (error instanceof RequestTooLargeError) {
          return errorResponse(set, 413, error.message);
        }

        return errorResponse(set, 502, sanitizeErrorMessage(getErrorMessage(error)));
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
    async ({ body, set }) => {
      const input = body.input.trim();

      if (!input) {
        return errorResponse(
          set,
          400,
          "Paste a recipe, recipe link, or YouTube link before importing.",
        );
      }

      try {
        enforceTextMaxChars(input, "Recipe import input");
        const result = await readThroughJsonCache({
          key: hashedCacheKey("recipe-import:v1", input),
          ttlSeconds: cacheTtlSeconds.recipeImport,
          context: { route: "/api/recipes/import", operation: "import" },
          load: () => importRecipeFromInput(input),
        });

        setCacheHeaders(set, result.status);
        return { recipe: result.value };
      } catch (error) {
        const message = sanitizeErrorMessage(getErrorMessage(error));

        if (error instanceof RequestTooLargeError) {
          return errorResponse(set, 413, message);
        }

        if (error instanceof RecipeImportInputError) {
          return errorResponse(set, 400, message);
        }

        return errorResponse(set, 502, message);
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
    async ({ body, set }) => {
      try {
        enforceImageMaxBytes(body.imageBase64, "Recipe image");
        const recipe = await generateRecipeFromImage({
          imageBase64: body.imageBase64,
          mimeType: body.mimeType,
        });

        return { recipe };
      } catch (error) {
        const message = sanitizeErrorMessage(getErrorMessage(error));
        const isInputError =
          message.startsWith("Choose a recipe image") || message.startsWith("Recipe image");

        if (error instanceof RequestTooLargeError) {
          return errorResponse(set, 413, message);
        }

        return errorResponse(set, isInputError ? 400 : 502, message);
      }
    },
    {
      body: t.Object({
        imageBase64: t.String(),
        mimeType: t.String(),
      }),
    },
  )
  .post(
    "/api/recipes/generate-image",
    async ({ body, set }) => {
      try {
        const image = await generateRecipeHeroImage({
          title: body.title,
          description: body.description,
          ingredients: body.ingredients,
        });

        return image;
      } catch (error) {
        const message = sanitizeErrorMessage(getErrorMessage(error));
        const responseStatus =
          error instanceof RequestTooLargeError
            ? 413
            : message.startsWith("Recipe title") ||
                message.startsWith("Recipe description")
              ? 400
              : 502;

        console.error("Recipe image generation failed.", {
          route: "/api/recipes/generate-image",
          status: responseStatus,
          error: message,
        });

        return errorResponse(set, responseStatus, message);
      }
    },
    {
      body: t.Object({
        title: t.String(),
        description: t.String(),
        ingredients: t.Array(
          t.Object({
            name: t.String(),
            amount: t.String(),
          }),
        ),
      }),
    },
  )
  .post(
    "/api/inventory/scan-image",
    async ({ body, set }) => {
      try {
        enforceImageMaxBytes(body.imageBase64, "Inventory image");
        const inventory = await generateInventoryFromImage({
          imageBase64: body.imageBase64,
          mimeType: body.mimeType,
        });

        return inventory;
      } catch (error) {
        const message = sanitizeErrorMessage(getErrorMessage(error));
        const isInputError =
          message.startsWith("Take an inventory photo") ||
          message.startsWith("Inventory image");
        const responseStatus =
          error instanceof RequestTooLargeError ? 413 : isInputError ? 400 : 502;

        console.error("Inventory image scan failed.", {
          route: "/api/inventory/scan-image",
          status: responseStatus,
          error: message,
        });

        return errorResponse(set, responseStatus, message);
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
  wakeRecipeGenerationQueue();
  console.log(`Recipe Library API listening on ${hostname ?? "0.0.0.0"}:${port}`);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function errorResponse(set: ResponseSet, status: number, error: string) {
  set.status = status;
  return { error };
}

function setCacheHeaders(set: ResponseSet, status: "HIT" | "MISS" | "BYPASS") {
  set.headers["X-Recipe-Cache"] = status;
  set.headers["Cache-Control"] = "no-store";
}

function readOwnerId(request: Request, set: ResponseSet) {
  const ownerId = request.headers.get("x-recipe-client-id")?.trim();

  if (ownerId && /^[A-Za-z0-9._:-]{8,128}$/.test(ownerId)) {
    return ownerId;
  }

  set.status = 400;
  return null;
}

function ownerCacheKey(key: string, ownerId: string) {
  return `${key}:owner:${ownerId}`;
}

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function publicRecipeGenerationJob(job: RecipeGenerationJob) {
  return {
    id: job.id,
    recipeId: job.recipeId,
    kind: job.kind,
    status: job.status,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}

function stripInlineRecipeImage(recipe: Recipe): Recipe {
  if (!recipe.imageUri?.startsWith("data:image/")) {
    return recipe;
  }

  const { imageUri: _imageUri, ...recipeWithoutInlineImage } = recipe;
  return recipeWithoutInlineImage;
}

function databaseErrorResponse(
  set: ResponseSet,
  route: string,
  operation: string,
  error: unknown,
  details: Record<string, string> = {},
) {
  const message = sanitizeErrorMessage(getErrorMessage(error));

  console.error("Database operation failed.", {
    provider: "neon",
    route,
    operation,
    ...details,
    error: message,
  });

  return errorResponse(set, 500, "The recipe database is unavailable. Try again in a moment.");
}

function normalizeIngredientBody(
  ingredients: Array<{
    name: string;
    amount: string;
  }>,
) {
  return ingredients
    .map((ingredient) => ({
      name: ingredient.name.trim(),
      amount: ingredient.amount.trim(),
    }))
    .filter((ingredient) => ingredient.name.length > 0);
}
