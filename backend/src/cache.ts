import { createHash } from "node:crypto";

import { createClient, type RedisClientType } from "redis";

type CacheStatus = "HIT" | "MISS" | "BYPASS";

type CacheResult<T> = {
  value: T;
  status: CacheStatus;
};

type CacheContext = {
  route: string;
  operation: string;
};

const redisUrl = process.env.REDIS_URL?.trim();
const inFlightLoads = new Map<string, Promise<unknown>>();

let redisClient: RedisClientType | null = null;
let redisConnection: Promise<RedisClientType | null> | null = null;
let loggedMissingRedisUrl = false;

export const cacheKeys = {
  recipesList: "recipes:list:v1",
  shoppingList: "shopping-list:list:v1",
  inventory: "inventory:list:v1",
  mealPlan: "meal-plan:list:v1",
};

export const cacheTtlSeconds = {
  lists: 60,
  recipePrompt: 60 * 60,
  recipeImport: 24 * 60 * 60,
};

export function hashedCacheKey(prefix: string, value: string) {
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 32);
  return `${prefix}:${hash}`;
}

export async function readThroughJsonCache<T>({
  key,
  ttlSeconds,
  context,
  load,
}: {
  key: string;
  ttlSeconds: number;
  context: CacheContext;
  load: () => Promise<T>;
}): Promise<CacheResult<T>> {
  const cached = await getCachedJson<T>(key, context);

  if (cached.hit) {
    return { value: cached.value, status: "HIT" };
  }

  const existingLoad = inFlightLoads.get(key) as Promise<T> | undefined;

  if (existingLoad) {
    return { value: await existingLoad, status: cached.enabled ? "MISS" : "BYPASS" };
  }

  const loadPromise = load().finally(() => {
    inFlightLoads.delete(key);
  });

  inFlightLoads.set(key, loadPromise);

  const value = await loadPromise;

  if (cached.enabled) {
    await setCachedJson(key, value, ttlSeconds, context);
  }

  return { value, status: cached.enabled ? "MISS" : "BYPASS" };
}

export async function invalidateCacheKeys(keys: string[], context: CacheContext) {
  if (keys.length === 0) {
    return;
  }

  const client = await getRedisClient(context);

  if (!client) {
    return;
  }

  try {
    await client.del(keys);
  } catch (error) {
    logCacheError("delete", context, error);
  }
}

async function getCachedJson<T>(key: string, context: CacheContext) {
  const client = await getRedisClient(context);

  if (!client) {
    return { hit: false as const, enabled: false as const };
  }

  try {
    const raw = await client.get(key);

    if (!raw) {
      return { hit: false as const, enabled: true as const };
    }

    return { hit: true as const, enabled: true as const, value: JSON.parse(raw) as T };
  } catch (error) {
    logCacheError("read", context, error);
    return { hit: false as const, enabled: false as const };
  }
}

async function setCachedJson<T>(key: string, value: T, ttlSeconds: number, context: CacheContext) {
  const client = await getRedisClient(context);

  if (!client) {
    return;
  }

  try {
    await client.setEx(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    logCacheError("write", context, error);
  }
}

async function getRedisClient(context: CacheContext) {
  if (!redisUrl) {
    if (!loggedMissingRedisUrl) {
      loggedMissingRedisUrl = true;
      console.warn("Redis cache disabled because REDIS_URL is not configured.", context);
    }

    return null;
  }

  if (redisClient?.isReady) {
    return redisClient;
  }

  if (redisConnection) {
    return redisConnection;
  }

  redisConnection = connectRedis(context).finally(() => {
    redisConnection = null;
  });

  return redisConnection;
}

async function connectRedis(context: CacheContext) {
  const client = createClient({ url: redisUrl });

  client.on("error", (error) => {
    logCacheError("client_error", context, error);
  });

  try {
    await client.connect();
    redisClient = client;
    console.log("Redis cache connected.", { provider: "railway-redis" });
    return client;
  } catch (error) {
    logCacheError("connect", context, error);
    return null;
  }
}

function logCacheError(operation: string, context: CacheContext, error: unknown) {
  console.error("Redis cache operation failed.", {
    provider: "railway-redis",
    route: context.route,
    operation,
    cacheOperation: context.operation,
    error: sanitizeCacheError(error),
  });
}

function sanitizeCacheError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return message
    .replace(/redis:\/\/[^@\s]+@/gi, "redis://[redacted]@")
    .replace(/rediss:\/\/[^@\s]+@/gi, "rediss://[redacted]@");
}
