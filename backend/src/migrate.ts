import { closeDatabase, createDatabaseSchemaSql, ensureDatabaseSchema } from "./database";

if (process.argv.includes("--dry-run")) {
  console.info("Postgres schema is defined in raw SQL; no generated client is required.");
  console.info(createDatabaseSchemaSql().trim());
  process.exit(0);
}

try {
  await ensureDatabaseSchema();
  console.info("Postgres migration completed.");
} catch (error) {
  console.error("Postgres migration failed.", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
} finally {
  await closeDatabase();
}
