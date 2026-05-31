export function normalizeRecipeSource(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(trimmed);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export function formatRecipeSourceLabel(source: string): string {
  try {
    const url = new URL(source);
    const hostname = url.hostname.replace(/^www\./, "").toLowerCase();

    if (hostname === "youtu.be" || hostname.endsWith("youtube.com")) {
      return "YouTube";
    }

    return hostname;
  } catch {
    return source;
  }
}
