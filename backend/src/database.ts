import postgres from "postgres";

type SqlClient = ReturnType<typeof postgres>;

export type RecipeIngredient = {
  name: string;
  amount: string;
};

export type RecipeImageStatus = "pending" | "ready" | "failed";

export type Recipe = {
  id: string;
  title: string;
  description: string;
  notes?: string;
  instructions: string;
  ingredients: RecipeIngredient[];
  source?: string;
  imageUri?: string;
  imageStatus?: RecipeImageStatus;
  imageError?: string;
  createdAt: string;
  updatedAt: string;
};

export type RecipeInput = {
  title: string;
  description: string;
  notes?: string;
  instructions: string;
  ingredients: RecipeIngredient[];
  source?: string | null;
};

export type ShoppingListItem = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InventoryItem = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type MealSlot = "breakfast" | "lunch" | "dinner";

export type MealPlanEntry = {
  id: string;
  date: string; // local date key "YYYY-MM-DD"
  slot: MealSlot;
  recipeId: string;
  recipeTitle: string;
  createdAt: string;
};

export type RecipeGenerationJobKind = "recipe_input" | "recipe_image" | "recipe_hero_image";
export type RecipeGenerationJobStatus = "pending" | "running" | "completed" | "failed";

export type RecipeGenerationJob = {
  id: string;
  ownerId: string;
  recipeId?: string;
  kind: RecipeGenerationJobKind;
  status: RecipeGenerationJobStatus;
  input: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
};

type RecipeRow = {
  id: string;
  title: string;
  description: string;
  notes: string | null;
  instructions: string;
  source: string | null;
  image_uri: string | null;
  image_status: string | null;
  image_error: string | null;
  created_at: unknown;
  updated_at: unknown;
};

type RecipeIngredientRow = {
  recipe_id: string;
  name: string;
  amount: string;
};

type ShoppingListItemRow = {
  id: string;
  text: string;
  completed: boolean;
  created_at: unknown;
  updated_at: unknown;
};

type InventoryItemRow = {
  id: string;
  text: string;
  created_at: unknown;
  updated_at: unknown;
};

type MealPlanEntryRow = {
  id: string;
  date: string;
  slot: string;
  recipe_id: string;
  recipe_title: string;
  created_at: unknown;
};

type RecipeGenerationJobRow = {
  id: string;
  owner_id: string;
  recipe_id: string | null;
  kind: string;
  status: string;
  input_json: unknown;
  error: string | null;
  created_at: unknown;
  updated_at: unknown;
  started_at: unknown;
  completed_at: unknown;
  previous_status?: string;
  previous_started_at?: unknown;
};

const legacyRecipeDescription = "A saved recipe from your library.";
const defaultRecipeGenerationJobLeaseMs = 15 * 60 * 1000;

let sqlClient: SqlClient | null = null;
let schemaReady: Promise<void> | null = null;

export function createDatabaseSchemaSql() {
  return `
CREATE TABLE IF NOT EXISTS recipes_v1 (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL DEFAULT 'legacy-local',
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  notes TEXT,
  instructions TEXT NOT NULL,
  source TEXT,
  image_uri TEXT,
  image_status TEXT,
  image_error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS recipe_ingredients_v1 (
  recipe_id TEXT NOT NULL REFERENCES recipes_v1(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL DEFAULT 'legacy-local',
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  amount TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (recipe_id, position)
);

ALTER TABLE recipes_v1
  ADD COLUMN IF NOT EXISTS owner_id TEXT NOT NULL DEFAULT 'legacy-local';
ALTER TABLE recipe_ingredients_v1
  ADD COLUMN IF NOT EXISTS owner_id TEXT NOT NULL DEFAULT 'legacy-local';
CREATE INDEX IF NOT EXISTS recipes_owner_created_at_idx
  ON recipes_v1 (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recipe_ingredients_recipe_id_idx
  ON recipe_ingredients_v1 (owner_id, recipe_id, position);

CREATE TABLE IF NOT EXISTS shopping_list_items_v1 (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL DEFAULT 'legacy-local',
  text TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE shopping_list_items_v1
  ADD COLUMN IF NOT EXISTS owner_id TEXT NOT NULL DEFAULT 'legacy-local';
CREATE INDEX IF NOT EXISTS shopping_list_items_owner_created_at_idx
  ON shopping_list_items_v1 (owner_id, created_at ASC);

CREATE TABLE IF NOT EXISTS inventory_items_v1 (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL DEFAULT 'legacy-local',
  text TEXT NOT NULL,
  created_at DATE NOT NULL,
  updated_at DATE NOT NULL
);

ALTER TABLE inventory_items_v1
  ADD COLUMN IF NOT EXISTS owner_id TEXT NOT NULL DEFAULT 'legacy-local';
CREATE INDEX IF NOT EXISTS inventory_items_owner_text_idx
  ON inventory_items_v1 (owner_id, LOWER(text), created_at ASC);

CREATE TABLE IF NOT EXISTS meal_plan_entries_v1 (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL DEFAULT 'legacy-local',
  date TEXT NOT NULL,
  slot TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  recipe_title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS meal_plan_entries_owner_date_idx
  ON meal_plan_entries_v1 (owner_id, date ASC, slot ASC, created_at ASC);

CREATE TABLE IF NOT EXISTS recipe_generation_jobs_v1 (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  recipe_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS recipe_generation_jobs_status_created_at_idx
  ON recipe_generation_jobs_v1 (status, created_at ASC);
CREATE INDEX IF NOT EXISTS recipe_generation_jobs_owner_updated_at_idx
  ON recipe_generation_jobs_v1 (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS recipe_generation_jobs_owner_recipe_idx
  ON recipe_generation_jobs_v1 (owner_id, recipe_id, kind);
`;
}

export async function ensureDatabaseSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      console.info("Ensuring Postgres database schema.", { provider: "neon" });
      await getSql().unsafe(createDatabaseSchemaSql());
      console.info("Postgres database schema is ready.", { provider: "neon" });
    })().catch((error) => {
      schemaReady = null;
      console.error("Failed to ensure Postgres database schema.", {
        provider: "neon",
        error: getErrorMessage(error),
      });
      throw error;
    });
  }

  await schemaReady;
}

export async function closeDatabase() {
  const client = sqlClient;

  if (!client) {
    return;
  }

  sqlClient = null;
  schemaReady = null;
  await client.end({ timeout: 5 });
}

export async function listRecipes(ownerId: string) {
  await ensureDatabaseSchema();

  const rows = await queryRows<RecipeRow>(getSql()`
    SELECT
      id,
      title,
      description,
      notes,
      instructions,
      source,
      image_uri,
      image_status,
      image_error,
      created_at,
      updated_at
    FROM recipes_v1
    WHERE owner_id = ${ownerId}
    ORDER BY created_at DESC
  `);
  const ingredientRows = await queryRows<RecipeIngredientRow>(getSql()`
    SELECT recipe_id, name, amount
    FROM recipe_ingredients_v1
    WHERE owner_id = ${ownerId}
    ORDER BY recipe_id ASC, position ASC
  `);
  const ingredientsByRecipeId = new Map<string, RecipeIngredient[]>();

  for (const row of ingredientRows) {
    const ingredients = ingredientsByRecipeId.get(row.recipe_id) ?? [];
    ingredients.push({ name: row.name, amount: row.amount });
    ingredientsByRecipeId.set(row.recipe_id, ingredients);
  }

  return rows.map((row) => rowToRecipe(row, ingredientsByRecipeId.get(row.id) ?? []));
}

export async function createRecipe(ownerId: string, recipe: Recipe) {
  await ensureDatabaseSchema();

  await getSql().begin(async (sql) => {
    await sql`
      INSERT INTO recipes_v1 (
        id,
        owner_id,
        title,
        description,
        notes,
        instructions,
        source,
        image_uri,
        image_status,
        image_error,
        created_at,
        updated_at
      ) VALUES (
        ${recipe.id},
        ${ownerId},
        ${recipe.title},
        ${recipe.description},
        ${recipe.notes ?? null},
        ${recipe.instructions},
        ${recipe.source ?? null},
        ${recipe.imageUri ?? null},
        ${recipe.imageStatus ?? null},
        ${recipe.imageError ?? null},
        ${recipe.createdAt},
        ${recipe.updatedAt}
      )
    `;

    for (const [position, ingredient] of recipe.ingredients.entries()) {
      await sql`
        INSERT INTO recipe_ingredients_v1 (
          recipe_id,
          owner_id,
          position,
          name,
          amount
        ) VALUES (
          ${recipe.id},
          ${ownerId},
          ${position},
          ${ingredient.name},
          ${ingredient.amount}
        )
      `;
    }
  });

  return recipe;
}

export async function updateRecipe(ownerId: string, id: string, input: RecipeInput) {
  await ensureDatabaseSchema();

  const now = new Date().toISOString();
  const existing = await findRecipe(ownerId, id);

  if (!existing) {
    return null;
  }

  const { source, ...restInput } = input;
  const updated: Recipe = {
    ...existing,
    ...restInput,
    ...(Object.prototype.hasOwnProperty.call(input, "source")
      ? { source: source || undefined }
      : {}),
    updatedAt: now,
  };

  await getSql().begin(async (sql) => {
    await sql`
      UPDATE recipes_v1
      SET
        title = ${updated.title},
        description = ${updated.description},
        notes = ${updated.notes ?? null},
        instructions = ${updated.instructions},
        source = ${updated.source ?? null},
        updated_at = ${updated.updatedAt}
      WHERE id = ${id}
        AND owner_id = ${ownerId}
    `;

    await sql`
      DELETE FROM recipe_ingredients_v1
      WHERE recipe_id = ${id}
        AND owner_id = ${ownerId}
    `;

    for (const [position, ingredient] of updated.ingredients.entries()) {
      await sql`
        INSERT INTO recipe_ingredients_v1 (
          recipe_id,
          owner_id,
          position,
          name,
          amount
        ) VALUES (
          ${id},
          ${ownerId},
          ${position},
          ${ingredient.name},
          ${ingredient.amount}
        )
      `;
    }
  });

  return updated;
}

export async function updateRecipeImageState(
  ownerId: string,
  id: string,
  input: {
    imageStatus: Recipe["imageStatus"];
    imageUri?: string | null;
    imageError?: string | null;
  },
) {
  await ensureDatabaseSchema();

  const existing = await findRecipe(ownerId, id);

  if (!existing) {
    return null;
  }

  await getSql()`
    UPDATE recipes_v1
    SET
      image_uri = ${input.imageUri ?? null},
      image_status = ${input.imageStatus ?? null},
      image_error = ${input.imageError ?? null}
    WHERE id = ${id}
      AND owner_id = ${ownerId}
  `;

  const updated: Recipe = {
    ...existing,
  };

  if (input.imageUri) {
    updated.imageUri = input.imageUri;
  } else {
    delete updated.imageUri;
  }

  if (input.imageStatus) {
    updated.imageStatus = input.imageStatus;
  } else {
    delete updated.imageStatus;
  }

  if (input.imageError && input.imageStatus === "failed") {
    updated.imageError = input.imageError;
  } else {
    delete updated.imageError;
  }

  return updated;
}

export async function updateRecipeNotes(ownerId: string, id: string, notes: string | null) {
  await ensureDatabaseSchema();

  const updatedAt = new Date().toISOString();
  const rows = await queryRows<RecipeRow>(getSql()`
    UPDATE recipes_v1
    SET notes = ${notes}, updated_at = ${updatedAt}
    WHERE id = ${id}
      AND owner_id = ${ownerId}
    RETURNING
      id,
      title,
      description,
      notes,
      instructions,
      source,
      image_uri,
      image_status,
      image_error,
      created_at,
      updated_at
  `);

  if (!rows[0]) {
    return null;
  }

  const ingredientRows = await queryRows<RecipeIngredientRow>(getSql()`
    SELECT recipe_id, name, amount
    FROM recipe_ingredients_v1
    WHERE recipe_id = ${id}
      AND owner_id = ${ownerId}
    ORDER BY position ASC
  `);

  return rowToRecipe(rows[0], ingredientRows);
}

export async function deleteRecipe(ownerId: string, id: string) {
  await ensureDatabaseSchema();
  await getSql()`
    DELETE FROM recipes_v1
    WHERE id = ${id}
      AND owner_id = ${ownerId}
  `;
}

export async function getRecipe(ownerId: string, id: string) {
  await ensureDatabaseSchema();
  return findRecipe(ownerId, id);
}

export async function createRecipeGenerationJob(
  ownerId: string,
  job: {
    id: string;
    recipeId?: string;
    kind: RecipeGenerationJobKind;
    input: Record<string, unknown>;
    createdAt: string;
  },
) {
  await ensureDatabaseSchema();

  const rows = await queryRows<RecipeGenerationJobRow>(getSql()`
    INSERT INTO recipe_generation_jobs_v1 (
      id,
      owner_id,
      recipe_id,
      kind,
      status,
      input_json,
      created_at,
      updated_at
    ) VALUES (
      ${job.id},
      ${ownerId},
      ${job.recipeId ?? null},
      ${job.kind},
      'pending',
      ${JSON.stringify(job.input)}::jsonb,
      ${job.createdAt},
      ${job.createdAt}
    )
    RETURNING
      id,
      owner_id,
      recipe_id,
      kind,
      status,
      input_json,
      error,
      created_at,
      updated_at,
      started_at,
      completed_at
  `);

  return rowToRecipeGenerationJob(rows[0]);
}

export async function findActiveRecipeGenerationJob(
  ownerId: string,
  kind: RecipeGenerationJobKind,
  recipeId: string,
) {
  await ensureDatabaseSchema();

  const rows = await queryRows<RecipeGenerationJobRow>(getSql()`
    SELECT
      id,
      owner_id,
      recipe_id,
      kind,
      status,
      input_json,
      error,
      created_at,
      updated_at,
      started_at,
      completed_at
    FROM recipe_generation_jobs_v1
    WHERE owner_id = ${ownerId}
      AND recipe_id = ${recipeId}
      AND kind = ${kind}
      AND status IN ('pending', 'running')
    ORDER BY created_at ASC
    LIMIT 1
  `);

  return rows[0] ? rowToRecipeGenerationJob(rows[0]) : null;
}

export async function listRecipeGenerationJobs(ownerId: string) {
  await ensureDatabaseSchema();

  const rows = await queryRows<RecipeGenerationJobRow>(getSql()`
    SELECT
      id,
      owner_id,
      recipe_id,
      kind,
      status,
      input_json,
      error,
      created_at,
      updated_at,
      started_at,
      completed_at
    FROM recipe_generation_jobs_v1
    WHERE owner_id = ${ownerId}
      AND (
        status IN ('pending', 'running')
        OR updated_at > NOW() - INTERVAL '1 day'
      )
    ORDER BY updated_at DESC
    LIMIT 50
  `);

  return rows.map(rowToRecipeGenerationJob);
}

export async function claimNextRecipeGenerationJob() {
  await ensureDatabaseSchema();

  const staleStartedBefore = new Date(
    Date.now() - getRecipeGenerationJobLeaseMs(),
  ).toISOString();
  const rows = await queryRows<RecipeGenerationJobRow>(getSql()`
    WITH next_job AS (
      SELECT id, status, started_at
      FROM recipe_generation_jobs_v1
      WHERE status = 'pending'
        OR (
          status = 'running'
          AND (
            started_at IS NULL
            OR started_at < ${staleStartedBefore}
          )
        )
      ORDER BY
        CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
        created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE recipe_generation_jobs_v1
    SET
      status = 'running',
      started_at = NOW(),
      updated_at = NOW()
    FROM next_job
    WHERE recipe_generation_jobs_v1.id = next_job.id
    RETURNING
      recipe_generation_jobs_v1.id,
      recipe_generation_jobs_v1.owner_id,
      recipe_generation_jobs_v1.recipe_id,
      recipe_generation_jobs_v1.kind,
      recipe_generation_jobs_v1.status,
      recipe_generation_jobs_v1.input_json,
      recipe_generation_jobs_v1.error,
      recipe_generation_jobs_v1.created_at,
      recipe_generation_jobs_v1.updated_at,
      recipe_generation_jobs_v1.started_at,
      recipe_generation_jobs_v1.completed_at,
      next_job.status AS previous_status,
      next_job.started_at AS previous_started_at
  `);

  if (!rows[0]) {
    return null;
  }

  const job = rowToRecipeGenerationJob(rows[0]);

  if (rows[0].previous_status === "running") {
    console.warn("[recipe-generation-queue] Reclaimed stale running job.", {
      jobId: job.id,
      ownerId: job.ownerId,
      recipeId: job.recipeId,
      kind: job.kind,
      previousStartedAt: rows[0].previous_started_at
        ? toIsoString(rows[0].previous_started_at)
        : null,
      staleStartedBefore,
    });
  }

  return job;
}

export async function completeRecipeGenerationJob(
  id: string,
  input: {
    recipeId?: string;
  } = {},
) {
  await ensureDatabaseSchema();

  const rows = await queryRows<RecipeGenerationJobRow>(getSql()`
    UPDATE recipe_generation_jobs_v1
    SET
      recipe_id = COALESCE(${input.recipeId ?? null}, recipe_id),
      status = 'completed',
      error = NULL,
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING
      id,
      owner_id,
      recipe_id,
      kind,
      status,
      input_json,
      error,
      created_at,
      updated_at,
      started_at,
      completed_at
  `);

  return rows[0] ? rowToRecipeGenerationJob(rows[0]) : null;
}

export async function failRecipeGenerationJob(id: string, error: string) {
  await ensureDatabaseSchema();

  const rows = await queryRows<RecipeGenerationJobRow>(getSql()`
    UPDATE recipe_generation_jobs_v1
    SET
      status = 'failed',
      error = ${error},
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${id}
      AND status != 'completed'
    RETURNING
      id,
      owner_id,
      recipe_id,
      kind,
      status,
      input_json,
      error,
      created_at,
      updated_at,
      started_at,
      completed_at
  `);

  return rows[0] ? rowToRecipeGenerationJob(rows[0]) : null;
}

export async function listShoppingListItems(ownerId: string) {
  await ensureDatabaseSchema();

  const rows = await queryRows<ShoppingListItemRow>(getSql()`
    SELECT id, text, completed, created_at, updated_at
    FROM shopping_list_items_v1
    WHERE owner_id = ${ownerId}
    ORDER BY created_at ASC
  `);

  return rows.map(rowToShoppingListItem);
}

export async function createShoppingListItem(ownerId: string, item: ShoppingListItem) {
  await ensureDatabaseSchema();

  await getSql()`
    INSERT INTO shopping_list_items_v1 (
      id,
      owner_id,
      text,
      completed,
      created_at,
      updated_at
    ) VALUES (
      ${item.id},
      ${ownerId},
      ${item.text},
      ${item.completed},
      ${item.createdAt},
      ${item.updatedAt}
    )
  `;

  return item;
}

export async function toggleShoppingListItem(ownerId: string, id: string) {
  await ensureDatabaseSchema();

  const rows = await queryRows<ShoppingListItemRow>(getSql()`
    UPDATE shopping_list_items_v1
    SET completed = NOT completed, updated_at = ${new Date().toISOString()}
    WHERE id = ${id}
      AND owner_id = ${ownerId}
    RETURNING id, text, completed, created_at, updated_at
  `);

  return rows[0] ? rowToShoppingListItem(rows[0]) : null;
}

export async function deleteShoppingListItem(ownerId: string, id: string) {
  await ensureDatabaseSchema();
  await getSql()`
    DELETE FROM shopping_list_items_v1
    WHERE id = ${id}
      AND owner_id = ${ownerId}
  `;
}

export async function clearCompletedShoppingListItems(ownerId: string) {
  await ensureDatabaseSchema();
  await getSql()`
    DELETE FROM shopping_list_items_v1
    WHERE completed = TRUE
      AND owner_id = ${ownerId}
  `;
}

export async function listInventoryItems(ownerId: string) {
  await ensureDatabaseSchema();

  const rows = await queryRows<InventoryItemRow>(getSql()`
    SELECT id, text, created_at, updated_at
    FROM inventory_items_v1
    WHERE owner_id = ${ownerId}
    ORDER BY LOWER(text) ASC, created_at ASC
  `);

  return rows.map(rowToInventoryItem);
}

export async function createInventoryItem(ownerId: string, item: InventoryItem) {
  await ensureDatabaseSchema();

  await getSql()`
    INSERT INTO inventory_items_v1 (
      id,
      owner_id,
      text,
      created_at,
      updated_at
    ) VALUES (
      ${item.id},
      ${ownerId},
      ${item.text},
      ${item.createdAt},
      ${item.updatedAt}
    )
  `;

  return item;
}

export async function deleteInventoryItem(ownerId: string, id: string) {
  await ensureDatabaseSchema();
  await getSql()`
    DELETE FROM inventory_items_v1
    WHERE id = ${id}
      AND owner_id = ${ownerId}
  `;
}

export async function listMealPlanEntries(ownerId: string) {
  await ensureDatabaseSchema();

  const rows = await queryRows<MealPlanEntryRow>(getSql()`
    SELECT id, date, slot, recipe_id, recipe_title, created_at
    FROM meal_plan_entries_v1
    WHERE owner_id = ${ownerId}
    ORDER BY date ASC, slot ASC, created_at ASC
  `);

  return rows.map(rowToMealPlanEntry);
}

export async function createMealPlanEntry(ownerId: string, entry: MealPlanEntry) {
  await ensureDatabaseSchema();

  await getSql()`
    INSERT INTO meal_plan_entries_v1 (
      id,
      owner_id,
      date,
      slot,
      recipe_id,
      recipe_title,
      created_at
    ) VALUES (
      ${entry.id},
      ${ownerId},
      ${entry.date},
      ${entry.slot},
      ${entry.recipeId},
      ${entry.recipeTitle},
      ${entry.createdAt}
    )
  `;

  return entry;
}

export async function deleteMealPlanEntry(ownerId: string, id: string) {
  await ensureDatabaseSchema();
  await getSql()`
    DELETE FROM meal_plan_entries_v1
    WHERE id = ${id}
      AND owner_id = ${ownerId}
  `;
}

async function findRecipe(ownerId: string, id: string) {
  const rows = await queryRows<RecipeRow>(getSql()`
    SELECT
      id,
      title,
      description,
      notes,
      instructions,
      source,
      image_uri,
      image_status,
      image_error,
      created_at,
      updated_at
    FROM recipes_v1
    WHERE id = ${id}
      AND owner_id = ${ownerId}
    LIMIT 1
  `);

  if (!rows[0]) {
    return null;
  }

  const ingredientRows = await queryRows<RecipeIngredientRow>(getSql()`
    SELECT recipe_id, name, amount
    FROM recipe_ingredients_v1
    WHERE recipe_id = ${id}
      AND owner_id = ${ownerId}
    ORDER BY position ASC
  `);

  return rowToRecipe(rows[0], ingredientRows);
}

function getSql() {
  if (sqlClient) {
    return sqlClient;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to use Neon Postgres persistence.");
  }

  sqlClient = postgres(connectionString, {
    max: 10,
    ssl: "require",
  });
  return sqlClient;
}

async function queryRows<T>(query: Promise<unknown>) {
  return (await query) as T[];
}

function rowToRecipe(row: RecipeRow, ingredients: RecipeIngredient[]): Recipe {
  const imageStatus = normalizeRecipeImageStatus(row.image_status);
  const imageError = normalizeNullableText(row.image_error);

  return {
    id: row.id,
    title: row.title,
    description: row.description || legacyRecipeDescription,
    ...(row.notes ? { notes: row.notes } : {}),
    instructions: row.instructions,
    ingredients,
    ...(row.source ? { source: row.source } : {}),
    ...(row.image_uri ? { imageUri: row.image_uri } : {}),
    ...(imageStatus ? { imageStatus } : {}),
    ...(imageError && imageStatus === "failed" ? { imageError } : {}),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function rowToShoppingListItem(row: ShoppingListItemRow): ShoppingListItem {
  return {
    id: row.id,
    text: row.text,
    completed: row.completed === true,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function rowToInventoryItem(row: InventoryItemRow): InventoryItem {
  return {
    id: row.id,
    text: row.text,
    createdAt: toDateOnly(row.created_at),
    updatedAt: toDateOnly(row.updated_at),
  };
}

function rowToMealPlanEntry(row: MealPlanEntryRow): MealPlanEntry {
  return {
    id: row.id,
    date: row.date,
    slot: normalizeMealSlot(row.slot),
    recipeId: row.recipe_id,
    recipeTitle: row.recipe_title,
    createdAt: toIsoString(row.created_at),
  };
}

function normalizeMealSlot(value: string): MealSlot {
  return value === "breakfast" || value === "lunch" || value === "dinner" ? value : "dinner";
}

function rowToRecipeGenerationJob(row: RecipeGenerationJobRow): RecipeGenerationJob {
  return {
    id: row.id,
    ownerId: row.owner_id,
    ...(row.recipe_id ? { recipeId: row.recipe_id } : {}),
    kind: normalizeRecipeGenerationJobKind(row.kind),
    status: normalizeRecipeGenerationJobStatus(row.status),
    input: normalizeRecipeGenerationJobInput(row.input_json),
    ...(row.error ? { error: row.error } : {}),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    ...(row.started_at ? { startedAt: toIsoString(row.started_at) } : {}),
    ...(row.completed_at ? { completedAt: toIsoString(row.completed_at) } : {}),
  };
}

function normalizeRecipeImageStatus(value: string | null): Recipe["imageStatus"] | undefined {
  return value === "pending" || value === "ready" || value === "failed" ? value : undefined;
}

function normalizeRecipeGenerationJobKind(value: string): RecipeGenerationJobKind {
  if (value === "recipe_image" || value === "recipe_hero_image") {
    return value;
  }

  return "recipe_input";
}

function normalizeRecipeGenerationJobStatus(value: string): RecipeGenerationJobStatus {
  if (value === "running" || value === "completed" || value === "failed") {
    return value;
  }

  return "pending";
}

function normalizeRecipeGenerationJobInput(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;

      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  return {};
}

function getRecipeGenerationJobLeaseMs() {
  const raw = process.env.RECIPE_GENERATION_JOB_LEASE_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;

  if (Number.isFinite(parsed) && parsed >= 60_000) {
    return parsed;
  }

  return defaultRecipeGenerationJobLeaseMs;
}

function normalizeNullableText(value: string | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toIsoString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    return new Date(value).toISOString();
  }

  return new Date().toISOString();
}

function toDateOnly(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
