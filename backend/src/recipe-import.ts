import { LogLevel, scrapeRecipe, type RecipeObject, type SafeParseResult } from "recipe-scrapers";
import { fetchTranscript } from "youtube-transcript";

import { fetchWithAiTimeout } from "./ai-endpoint-guards";
import {
  generateRecipeFromSourceText,
  sanitizeErrorMessage,
  type StructuredRecipe,
} from "./recipe-ai";
import { normalizeRecipeSource } from "./recipe-source";

type Env = Record<string, string | undefined>;
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type TranscriptItem = {
  text?: string;
};
type TranscriptFetcher = (videoIdOrUrl: string) => Promise<TranscriptItem[]>;
type RecipeScraper = (
  html: string,
  url: string,
  options: {
    safeParse: true;
    logLevel: LogLevel;
  },
) => Promise<SafeParseResult<RecipeObject>>;
type AudioStream = AsyncIterable<Uint8Array | Buffer | string> | ReadableStream<Uint8Array>;
type AudioStreamFactory = (url: string) => AudioStream | Promise<AudioStream>;
type RecipeGenerator = (
  sourceText: string,
  sourceLabel: string,
  options?: {
    env?: Env;
    fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  },
) => Promise<StructuredRecipe>;
type AudioTranscriber = (
  audio: Uint8Array,
  fileName: string,
  options: {
    env?: Env;
    fetcher?: Fetcher;
  },
) => Promise<string>;

export class RecipeImportInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecipeImportInputError";
  }
}

export type RecipeImportOptions = {
  env?: Env;
  fetcher?: Fetcher;
  transcriptFetcher?: TranscriptFetcher;
  recipeScraper?: RecipeScraper;
  audioStreamFactory?: AudioStreamFactory;
  recipeGenerator?: RecipeGenerator;
  audioTranscriber?: AudioTranscriber;
  maxAudioBytes?: number;
};

const firstHttpUrlPattern = /https?:\/\/[^\s<>"']+/i;
const anySchemeUrlPattern = /^[a-z][a-z\d+.-]*:\/\//i;
const maxAudioBytes = 25 * 1024 * 1024;
const openAiTranscriptionUrl = "https://api.openai.com/v1/audio/transcriptions";
const defaultTranscriptionModel = "gpt-4o-mini-transcribe";

export async function importRecipeFromInput(
  input: string,
  options: RecipeImportOptions = {},
): Promise<StructuredRecipe> {
  const normalizedInput = input.trim();

  if (!normalizedInput) {
    throw new RecipeImportInputError("Paste a recipe, recipe link, or YouTube link before importing.");
  }

  const urlMatch = normalizedInput.match(firstHttpUrlPattern);

  if (!urlMatch) {
    if (anySchemeUrlPattern.test(normalizedInput)) {
      throw new RecipeImportInputError("Recipe links must start with http:// or https://.");
    }

    return generateFromSource(normalizedInput, "pasted recipe text", options);
  }

  const url = normalizeMatchedUrl(urlMatch[0]);
  const userNotes = [
    normalizedInput.slice(0, urlMatch.index).trim(),
    normalizedInput.slice((urlMatch.index ?? 0) + urlMatch[0].length).trim(),
  ]
    .filter(Boolean)
    .join("\n");

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new RecipeImportInputError("Paste a valid recipe or YouTube URL.");
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new RecipeImportInputError("Recipe links must start with http:// or https://.");
  }

  if (isYouTubeUrl(parsedUrl)) {
    return importRecipeFromYouTube(url, userNotes, options);
  }

  return importRecipeFromUrl(url, userNotes, options);
}

export async function importRecipeFromUrl(
  url: string,
  userNotes = "",
  options: RecipeImportOptions = {},
) {
  console.log("[recipe-import] Fetching recipe URL", { url });
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "RecipeLibraryBot/1.0 (+https://recipelibrary.local)",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Recipe page fetch failed with status ${response.status}.`);
  }

  const html = await response.text();
  const scraper = options.recipeScraper ?? scrapeRecipe;
  const result = await scraper(html, url, {
    safeParse: true,
    logLevel: LogLevel.ERROR,
  });

  if (!result.success) {
    console.error("[recipe-import] Recipe scraper failed", {
      url,
      code: result.error.code,
      issues: result.error.issues.map((issue) => issue.message),
    });
    throw new Error("Could not find structured recipe data at that URL.");
  }

  return generateFromSource(
    buildScrapedRecipeSource(result.data, url, userNotes),
    "recipe page data",
    options,
  ).then((recipe) => attachImportSource(recipe, url));
}

export async function importRecipeFromYouTube(
  url: string,
  userNotes = "",
  options: RecipeImportOptions = {},
) {
  const videoId = extractYouTubeVideoId(url);

  if (!videoId) {
    throw new RecipeImportInputError("Paste a valid YouTube recipe URL.");
  }

  console.log("[recipe-import] Importing YouTube recipe", { videoId });

  try {
    const transcriptFetcher = options.transcriptFetcher ?? fetchTranscript;
    const transcriptItems = await transcriptFetcher(videoId);
    const transcript = transcriptItems
      .map((item) => item.text?.trim())
      .filter((text): text is string => Boolean(text))
      .join(" ");

    if (transcript.trim()) {
      return generateFromSource(
        buildYouTubeSource(url, userNotes, transcript, "captions"),
        "YouTube captions",
        options,
      ).then((recipe) => attachImportSource(recipe, url));
    }

    console.warn("[recipe-import] YouTube captions were empty; falling back to audio transcription", {
      videoId,
    });
  } catch (error) {
    console.warn("[recipe-import] YouTube captions unavailable; falling back to audio transcription", {
      videoId,
      error: getSafeErrorMessage(error),
    });
  }

  const audioStreamFactory = options.audioStreamFactory ?? createYouTubeAudioStream;
  const audioStream = await audioStreamFactory(url);
  const audio = await readAudioStream(audioStream, options.maxAudioBytes ?? maxAudioBytes);
  const transcriber = options.audioTranscriber ?? transcribeAudioWithOpenAi;
  const transcript = await transcriber(audio, `youtube-${videoId}.mp4`, {
    env: options.env,
    fetcher: options.fetcher,
  });

  if (!transcript.trim()) {
    throw new Error("YouTube audio transcription returned an empty transcript.");
  }

  return generateFromSource(
    buildYouTubeSource(url, userNotes, transcript, "audio transcription"),
    "YouTube transcript",
    options,
  ).then((recipe) => attachImportSource(recipe, url));
}

export async function transcribeAudioWithOpenAi(
  audio: Uint8Array,
  fileName: string,
  options: {
    env?: Env;
    fetcher?: Fetcher;
  } = {},
) {
  const env = options.env ?? process.env;
  const apiKey = env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured for YouTube audio transcription.");
  }

  const formData = new FormData();
  const audioBuffer = Buffer.from(audio);
  const audioArrayBuffer = audioBuffer.buffer.slice(
    audioBuffer.byteOffset,
    audioBuffer.byteOffset + audioBuffer.byteLength,
  ) as ArrayBuffer;

  formData.set("model", env.OPENAI_TRANSCRIPTION_MODEL?.trim() || defaultTranscriptionModel);
  formData.set(
    "file",
    new File([audioArrayBuffer], fileName, {
      type: "audio/mp4",
    }),
  );

  const fetcher = (options.fetcher ?? fetch) as (
    url: string,
    init: RequestInit,
  ) => Promise<Response>;
  const response = await fetchWithAiTimeout(
    "OpenAI transcription",
    fetcher,
    openAiTranscriptionUrl,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    },
    env,
  );

  if (!response.ok) {
    throw new Error(
      `OpenAI transcription failed with status ${response.status}: ${sanitizeErrorMessage(
        await response.text(),
      )}`,
    );
  }

  const payload = (await response.json()) as { text?: unknown };
  const text = typeof payload.text === "string" ? payload.text.trim() : "";

  if (!text) {
    throw new Error("OpenAI transcription response did not include transcript text.");
  }

  return text;
}

function generateFromSource(
  sourceText: string,
  sourceLabel: string,
  options: RecipeImportOptions,
) {
  const generator = options.recipeGenerator ?? generateRecipeFromSourceText;

  return generator(sourceText, sourceLabel, {
    env: options.env,
    fetcher: options.fetcher as ((url: string, init: RequestInit) => Promise<Response>) | undefined,
  });
}

function attachImportSource(recipe: StructuredRecipe, url: string): StructuredRecipe {
  const source = normalizeRecipeSource(url);

  if (!source) {
    return recipe;
  }

  return {
    ...recipe,
    source,
  };
}

async function createYouTubeAudioStream(url: string) {
  const videoId = extractYouTubeVideoId(url);

  if (!videoId) {
    throw new RecipeImportInputError("Paste a valid YouTube recipe URL.");
  }

  const { Innertube } = await import("youtubei.js");
  const youtube = await Innertube.create();

  return youtube.download(videoId, {
    type: "audio",
    quality: "best",
    format: "mp4",
  });
}

async function readAudioStream(
  stream: AudioStream,
  byteLimit: number,
) {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of readStreamChunks(stream)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > byteLimit) {
      throw new Error("YouTube audio is too large to transcribe. Try a shorter video.");
    }

    chunks.push(buffer);
  }

  if (totalBytes === 0) {
    throw new Error("Could not read audio from that YouTube video.");
  }

  return Buffer.concat(chunks);
}

async function* readStreamChunks(stream: AudioStream) {
  if ("getReader" in stream) {
    const reader = stream.getReader();

    try {
      while (true) {
        const result = await reader.read();

        if (result.done) {
          return;
        }

        yield result.value;
      }
    } finally {
      reader.releaseLock();
    }

    return;
  }

  yield* stream;
}

function buildScrapedRecipeSource(recipe: RecipeObject, url: string, userNotes: string) {
  return [
    `URL: ${url}`,
    userNotes ? `User notes:\n${userNotes}` : "",
    `Title: ${recipe.title}`,
    recipe.description ? `Description: ${recipe.description}` : "",
    recipe.yields ? `Yield: ${recipe.yields}` : "",
    recipe.totalTime ? `Total time: ${recipe.totalTime} minutes` : "",
    "Ingredients:",
    ...flattenGroups(recipe.ingredients),
    "Instructions:",
    ...flattenGroups(recipe.instructions),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildYouTubeSource(
  url: string,
  userNotes: string,
  transcript: string,
  transcriptSource: string,
) {
  return [
    `YouTube URL: ${url}`,
    `Transcript source: ${transcriptSource}`,
    userNotes ? `User notes:\n${userNotes}` : "",
    "Transcript:",
    transcript,
  ]
    .filter(Boolean)
    .join("\n");
}

function flattenGroups(groups: Array<{ name: string | null; items: Array<{ value: string }> }>) {
  return groups.flatMap((group) =>
    group.items.map((item) => (group.name ? `${group.name}: ${item.value}` : item.value)),
  );
}

function normalizeMatchedUrl(url: string) {
  return url.replace(/[),.;!?]+$/g, "");
}

function isYouTubeUrl(url: URL) {
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();

  return hostname === "youtube.com" || hostname === "m.youtube.com" || hostname === "youtu.be";
}

function extractYouTubeVideoId(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();

    if (hostname === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] ?? "";
    }

    if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v") ?? "";
      }

      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") {
        return parts[1] ?? "";
      }
    }
  } catch {
    return "";
  }

  return "";
}

function getSafeErrorMessage(error: unknown) {
  return sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
}
