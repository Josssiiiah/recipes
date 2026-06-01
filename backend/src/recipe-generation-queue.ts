import { cacheKeys, invalidateCacheKeys } from "./cache";
import {
  claimNextRecipeGenerationJob,
  completeRecipeGenerationJob,
  createRecipe,
  createRecipeGenerationJob,
  failRecipeGenerationJob,
  findActiveRecipeGenerationJob,
  getRecipe,
  updateRecipeImageState,
  type Recipe,
  type RecipeGenerationJob,
} from "./database";
import { generateRecipeFromImage, sanitizeErrorMessage, type StructuredRecipe } from "./recipe-ai";
import { generateRecipeHeroImage } from "./recipe-image-ai";
import { importRecipeFromInput } from "./recipe-import";

let drainPromise: Promise<void> | null = null;

export function wakeRecipeGenerationQueue() {
  if (drainPromise) {
    return;
  }

  drainPromise = drainRecipeGenerationQueue()
    .catch((error) => {
      console.error("[recipe-generation-queue] Queue drain failed.", {
        error: sanitizeErrorMessage(getErrorMessage(error)),
      });
    })
    .finally(() => {
      drainPromise = null;
    });
}

export async function enqueueRecipeHeroImageJob(ownerId: string, recipeId: string) {
  const existingJob = await findActiveRecipeGenerationJob(ownerId, "recipe_hero_image", recipeId);
  const existingRecipe = await getRecipe(ownerId, recipeId);

  if (!existingRecipe) {
    return null;
  }

  if (existingRecipe.imageUri && existingRecipe.imageStatus === "ready") {
    return { recipe: existingRecipe, job: existingJob };
  }

  const recipe =
    existingRecipe.imageStatus === "pending"
      ? existingRecipe
      : await updateRecipeImageState(ownerId, recipeId, {
          imageStatus: "pending",
          imageUri: null,
          imageError: null,
        });

  if (!recipe) {
    return null;
  }

  const job =
    existingJob ??
    (await createRecipeGenerationJob(ownerId, {
      id: createId("recipe-image-job"),
      recipeId,
      kind: "recipe_hero_image",
      input: {},
      createdAt: new Date().toISOString(),
    }));

  await invalidateRecipeList(ownerId, {
    route: "recipe-generation-queue",
    operation: "enqueue_recipe_image",
  });
  wakeRecipeGenerationQueue();

  return { recipe, job };
}

async function drainRecipeGenerationQueue() {
  while (true) {
    const job = await claimNextRecipeGenerationJob();

    if (!job) {
      return;
    }

    await processRecipeGenerationJob(job);
  }
}

async function processRecipeGenerationJob(job: RecipeGenerationJob) {
  console.info("[recipe-generation-queue] Processing recipe generation job.", {
    jobId: job.id,
    ownerId: job.ownerId,
    recipeId: job.recipeId,
    kind: job.kind,
  });

  try {
    if (job.kind === "recipe_input") {
      await processRecipeInputJob(job);
    } else if (job.kind === "recipe_image") {
      await processRecipeImageImportJob(job);
    } else {
      await processRecipeHeroImageJob(job);
    }

    console.info("[recipe-generation-queue] Recipe generation job completed.", {
      jobId: job.id,
      ownerId: job.ownerId,
      recipeId: job.recipeId,
      kind: job.kind,
    });
  } catch (error) {
    const message = sanitizeErrorMessage(getErrorMessage(error));

    console.error("[recipe-generation-queue] Recipe generation job failed.", {
      jobId: job.id,
      ownerId: job.ownerId,
      recipeId: job.recipeId,
      kind: job.kind,
      error: message,
    });

    if (job.kind === "recipe_hero_image" && job.recipeId) {
      await updateRecipeImageState(job.ownerId, job.recipeId, {
        imageStatus: "failed",
        imageUri: null,
        imageError: message,
      });
      await invalidateRecipeList(job.ownerId, {
        route: "recipe-generation-queue",
        operation: "fail_recipe_image",
      });
    }

    await failRecipeGenerationJob(job.id, message);
  }
}

async function processRecipeInputJob(job: RecipeGenerationJob) {
  const input = readRequiredString(job.input.input, "Recipe generation input");
  const recipe = await importRecipeFromInput(input);

  await saveGeneratedRecipe(job, recipe);
}

async function processRecipeImageImportJob(job: RecipeGenerationJob) {
  const imageBase64 = readRequiredString(job.input.imageBase64, "Recipe image data");
  const mimeType = readRequiredString(job.input.mimeType, "Recipe image MIME type");
  const recipe = await generateRecipeFromImage({ imageBase64, mimeType });

  await saveGeneratedRecipe(job, recipe);
}

async function saveGeneratedRecipe(job: RecipeGenerationJob, input: StructuredRecipe) {
  const recipeId = getGeneratedRecipeId(job);
  const now = new Date().toISOString();
  const recipe: Recipe = {
    id: recipeId,
    title: input.title,
    description: input.description,
    instructions: input.instructions,
    ingredients: input.ingredients,
    ...(input.source ? { source: input.source } : {}),
    createdAt: job.createdAt,
    updatedAt: now,
  };

  const existingRecipe = await getRecipe(job.ownerId, recipeId);

  if (!existingRecipe) {
    try {
      await createRecipe(job.ownerId, recipe);
    } catch (error) {
      const recipeCreatedByConcurrentWorker = await getRecipe(job.ownerId, recipeId);

      if (!recipeCreatedByConcurrentWorker) {
        throw error;
      }
    }
  }

  await completeGeneratedRecipeJob(job, recipeId);
}

async function completeGeneratedRecipeJob(job: RecipeGenerationJob, recipeId: string) {
  await completeRecipeGenerationJob(job.id, { recipeId });
  await invalidateRecipeList(job.ownerId, {
    route: "recipe-generation-queue",
    operation: "complete_recipe_generation",
  });
  await enqueueRecipeHeroImageJob(job.ownerId, recipeId);
}

function getGeneratedRecipeId(job: RecipeGenerationJob) {
  return job.recipeId ?? `recipe-${job.id}`;
}

async function processRecipeHeroImageJob(job: RecipeGenerationJob) {
  if (!job.recipeId) {
    throw new Error("Recipe image generation job is missing a recipe ID.");
  }

  const recipe = await getRecipe(job.ownerId, job.recipeId);

  if (!recipe) {
    throw new Error("Recipe image generation job could not find its recipe.");
  }

  if (recipe.imageUri && recipe.imageStatus === "ready") {
    await completeRecipeGenerationJob(job.id, { recipeId: recipe.id });
    return;
  }

  const image = await generateRecipeHeroImage({
    title: recipe.title,
    description: recipe.description,
    ingredients: recipe.ingredients,
  });

  await updateRecipeImageState(job.ownerId, recipe.id, {
    imageStatus: "ready",
    imageUri: image.imageUri,
    imageError: null,
  });
  await completeRecipeGenerationJob(job.id, { recipeId: recipe.id });
  await invalidateRecipeList(job.ownerId, {
    route: "recipe-generation-queue",
    operation: "complete_recipe_image",
  });
}

function readRequiredString(value: unknown, label: string) {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    throw new Error(`${label} is missing.`);
  }

  return normalized;
}

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function invalidateRecipeList(ownerId: string, context: { route: string; operation: string }) {
  return invalidateCacheKeys([`${cacheKeys.recipesList}:owner:${ownerId}`], context);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
