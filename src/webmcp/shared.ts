export type JsonObject = Record<string, unknown>;

export interface WebMcpToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: JsonObject;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute(input: unknown): unknown | Promise<unknown>;
}

export class WebMcpToolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WebMcpToolError";
    this.code = code;
  }
}

export const inputObject = (input: unknown): Record<string, unknown> => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new WebMcpToolError("invalid_input", "Tool input must be an object.");
  }
  return input as Record<string, unknown>;
};

export const requiredString = (
  input: Record<string, unknown>,
  key: string,
  maxLength = 128,
): string => {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new WebMcpToolError("invalid_input", `${key} must be a non-empty string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new WebMcpToolError("invalid_input", `${key} is too long.`);
  }
  return trimmed;
};

export const optionalString = (
  input: Record<string, unknown>,
  key: string,
  maxLength = 128,
): string | null => {
  const value = input[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new WebMcpToolError("invalid_input", `${key} must be a string when provided.`);
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new WebMcpToolError("invalid_input", `${key} must be a short, non-empty string.`);
  }
  return trimmed;
};

export const optionalBoolean = (
  input: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean => {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new WebMcpToolError("invalid_input", `${key} must be true or false.`);
  }
  return value;
};

export const optionalInteger = (
  input: Record<string, unknown>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number => {
  const value = input[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new WebMcpToolError("invalid_input", `${key} must be an integer from ${min} to ${max}.`);
  }
  return value;
};

export const stringArray = (
  input: Record<string, unknown>,
  key: string,
  maxItems: number,
  maxLength = 128,
): string[] => {
  const value = input[key];
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems) {
    throw new WebMcpToolError("invalid_input", `${key} must contain 1 to ${maxItems} names.`);
  }
  const clean = value.map((entry) => {
    if (typeof entry !== "string" || !entry.trim() || entry.trim().length > maxLength) {
      throw new WebMcpToolError("invalid_input", `${key} contains an invalid name.`);
    }
    return entry.trim();
  });
  if (new Set(clean.map((entry) => normalizeLookup(entry))).size !== clean.length) {
    throw new WebMcpToolError("invalid_input", `${key} must not contain duplicate names.`);
  }
  return clean;
};

export const enumValue = <T extends string>(
  input: Record<string, unknown>,
  key: string,
  values: readonly T[],
  fallback?: T,
): T => {
  const value = input[key];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    throw new WebMcpToolError("invalid_input", `${key} must be one of: ${values.join(", ")}.`);
  }
  return value as T;
};

export const normalizeLookup = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

export const humanizeId = (value: string): string => value
  .replace(/[_-]+/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase())
  .trim();

export const freshness = (fetchedAt: number | null, now = Date.now()) => ({
  fetched_at: fetchedAt === null ? null : new Date(fetchedAt).toISOString(),
  age_seconds: fetchedAt === null ? null : Math.max(0, Math.floor((now - fetchedAt) / 1000)),
});

export const limited = <T>(entries: readonly T[], limit: number) => ({
  entries: entries.slice(0, limit),
  returned: Math.min(entries.length, limit),
  total: entries.length,
  truncated: entries.length > limit,
});

export const errorResult = (error: unknown): JsonObject => {
  if (error instanceof WebMcpToolError) {
    return { ok: false, error: { code: error.code, message: error.message } };
  }
  const message = error instanceof Error && error.message.trim()
    ? error.message
    : "Skydex could not complete that read-only request.";
  return { ok: false, error: { code: "request_failed", message } };
};
