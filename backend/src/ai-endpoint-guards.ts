type Env = Record<string, string | undefined>;
type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
type ResponseSet = {
  headers: Record<string, string | number>;
  status?: unknown;
};

type RequestLogState = {
  startMs: number;
  requestId: string;
  route: string;
  logged: boolean;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

export type AiEndpointKind = "text" | "image";

export class RequestTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestTooLargeError";
  }
}

export class AiProviderTimeoutError extends Error {
  constructor(provider: string, timeoutMs: number) {
    super(`${provider} request timed out after ${timeoutMs} ms.`);
    this.name = "AiProviderTimeoutError";
  }
}

const requestLogState = new WeakMap<Request, RequestLogState>();
const rateLimitBuckets = new Map<string, RateLimitBucket>();
const aiRouteKinds = new Map<string, AiEndpointKind>([
  ["/api/recipes/parse", "text"],
  ["/api/recipes/import", "text"],
  ["/api/recipes/import-image", "image"],
  ["/api/recipes/generation-jobs/input", "text"],
  ["/api/recipes/generation-jobs/image", "image"],
  ["/api/recipes/generate-image", "image"],
  ["/api/inventory/scan-image", "image"],
]);

const defaultTextMaxChars = 12000;
const defaultJsonBodyMaxBytes = 16 * 1024 * 1024;
const defaultImageMaxBytes = 10 * 1024 * 1024;
const defaultAiTimeoutMs = 30000;
const defaultRateLimitWindowMs = 60000;
const defaultTextRateLimitMaxRequests = 20;
const defaultImageRateLimitMaxRequests = 10;

export function getAiEndpointConfig(env: Env = process.env) {
  return {
    textMaxChars: readPositiveInteger(env.AI_TEXT_MAX_CHARS, defaultTextMaxChars),
    jsonBodyMaxBytes: readPositiveInteger(
      env.AI_JSON_BODY_MAX_BYTES,
      defaultJsonBodyMaxBytes,
    ),
    imageMaxBytes: readPositiveInteger(env.AI_IMAGE_MAX_BYTES, defaultImageMaxBytes),
    aiTimeoutMs: readPositiveInteger(env.AI_TIMEOUT_MS, defaultAiTimeoutMs),
    rateLimitWindowMs: readPositiveInteger(
      env.AI_RATE_LIMIT_WINDOW_MS,
      defaultRateLimitWindowMs,
    ),
    textRateLimitMaxRequests: readPositiveInteger(
      env.AI_TEXT_RATE_LIMIT_MAX_REQUESTS,
      defaultTextRateLimitMaxRequests,
    ),
    imageRateLimitMaxRequests: readPositiveInteger(
      env.AI_IMAGE_RATE_LIMIT_MAX_REQUESTS,
      defaultImageRateLimitMaxRequests,
    ),
  };
}

export function prepareRequest(request: Request, set: ResponseSet) {
  const requestId = readRequestId(request.headers.get("x-request-id"));
  const route = new URL(request.url).pathname;

  set.headers["X-Request-ID"] = requestId;
  requestLogState.set(request, {
    startMs: performance.now(),
    requestId,
    route,
    logged: false,
  });
}

export function guardAiRequest(
  request: Request,
  set: ResponseSet,
  socketAddress?: string | null,
) {
  const url = new URL(request.url);
  const kind = aiRouteKinds.get(url.pathname) ?? readDynamicAiEndpointKind(url.pathname);

  if (!kind || request.method.toUpperCase() !== "POST") {
    return null;
  }

  const config = getAiEndpointConfig();
  const contentLength = readContentLength(request.headers.get("content-length"));

  if (contentLength !== null && contentLength > config.jsonBodyMaxBytes) {
    set.status = 413;
    logRequest(request, set, "rejected", {
      reason: "json_body_too_large",
      bodyBytes: contentLength,
      bodyMaxBytes: config.jsonBodyMaxBytes,
    });

    return { error: "Request body is too large." };
  }

  const rateLimit = consumeRateLimit({
    key: `${kind}:${readClientIp(request, socketAddress)}`,
    maxRequests:
      kind === "image"
        ? config.imageRateLimitMaxRequests
        : config.textRateLimitMaxRequests,
    windowMs: config.rateLimitWindowMs,
  });

  if (!rateLimit.allowed) {
    set.status = 429;
    set.headers["Retry-After"] = rateLimit.retryAfterSeconds;
    logRequest(request, set, "rejected", {
      reason: "rate_limited",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
      rateLimitKind: kind,
    });

    return { error: "Too many AI requests. Try again later." };
  }

  return null;
}

function readDynamicAiEndpointKind(pathname: string): AiEndpointKind | undefined {
  if (/^\/api\/recipes\/[^/]+\/image\/generation-jobs$/.test(pathname)) {
    return "image";
  }

  return undefined;
}

export function enforceTextMaxChars(value: string, label: string, env: Env = process.env) {
  const { textMaxChars } = getAiEndpointConfig(env);

  if (value.length > textMaxChars) {
    throw new RequestTooLargeError(
      `${label} is too long. Keep it under ${textMaxChars} characters.`,
    );
  }
}

export function enforceImageMaxBytes(base64: string, label: string, env: Env = process.env) {
  const { imageMaxBytes } = getAiEndpointConfig(env);
  const bytes = Buffer.byteLength(base64, "base64");

  if (bytes > imageMaxBytes) {
    throw new RequestTooLargeError(
      `${label} is too large. Choose an image under ${formatByteLimit(imageMaxBytes)}.`,
    );
  }
}

export async function fetchWithAiTimeout(
  provider: string,
  fetcher: Fetcher,
  url: string,
  init: RequestInit,
  env: Env = process.env,
) {
  const { aiTimeoutMs } = getAiEndpointConfig(env);
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      fetcher(url, {
        ...init,
        signal: controller.signal,
      }),
      new Promise<Response>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new AiProviderTimeoutError(provider, aiTimeoutMs));
        }, aiTimeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof AiProviderTimeoutError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AiProviderTimeoutError(provider, aiTimeoutMs);
    }

    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export function logRequest(
  request: Request,
  set: ResponseSet,
  event: "completed" | "rejected" | "failed",
  details: Record<string, string | number | boolean | null> = {},
  responseValue?: unknown,
) {
  const state = requestLogState.get(request);

  if (!state || state.logged) {
    return;
  }

  state.logged = true;
  const status = readResponseStatus(set, responseValue);
  const durationMs = Math.round((performance.now() - state.startMs) * 100) / 100;

  console.log("backend_ai_request", {
    event,
    requestId: state.requestId,
    method: request.method,
    route: state.route,
    status,
    durationMs,
    ...details,
  });
}

function readResponseStatus(set: ResponseSet, responseValue: unknown) {
  if (typeof set.status === "number") {
    return set.status;
  }

  if (
    responseValue &&
    typeof responseValue === "object" &&
    "code" in responseValue
  ) {
    const code = (responseValue as { code?: unknown }).code;

    if (typeof code === "number") {
      return code;
    }
  }

  return 200;
}

export function resetAiEndpointRateLimitsForTests() {
  rateLimitBuckets.clear();
}

function consumeRateLimit(input: {
  key: string;
  maxRequests: number;
  windowMs: number;
}) {
  const now = Date.now();
  const existing = rateLimitBuckets.get(input.key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + input.windowMs };

  if (bucket.count >= input.maxRequests) {
    rateLimitBuckets.set(input.key, bucket);
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  rateLimitBuckets.set(input.key, bucket);
  return { allowed: true, retryAfterSeconds: 0 };
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readContentLength(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function readClientIp(request: Request, socketAddress?: string | null) {
  if (process.env.TRUST_PROXY_IP_HEADERS !== "true") {
    return socketAddress?.trim() || "unknown";
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();

  return (
    forwardedFor ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    socketAddress?.trim() ||
    "unknown"
  );
}

function readRequestId(value: string | null) {
  const normalized = value?.trim();

  if (normalized && /^[A-Za-z0-9._:-]{1,128}$/.test(normalized)) {
    return normalized;
  }

  return crypto.randomUUID();
}

function formatByteLimit(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${Math.floor(bytes / (1024 * 1024))} MB`;
  }

  return `${bytes} bytes`;
}
