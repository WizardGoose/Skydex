/**
 * Feed the failure surface a small safe model, never an Error object. Route
 * errors can contain a Response, request body, or server payload.
 */

export type FailureSource = "route" | "component";
export type FailurePhase = "render" | "data";
export type FailureKind = "render" | "data" | "not-found";
export type FailureReason = "unexpected-render" | "network" | "credentials" | "service" | "not-found" | "data";
export type RetryMode = "reset" | "revalidate" | "remount" | "reload" | "none";

export interface SafeFailureDetails {
  route: string;
  errorType: string;
  message: string;
  timestamp: string;
}

export interface FailureModel {
  kind: FailureKind;
  reason: FailureReason;
  source: FailureSource;
  title: string;
  description: string;
  details: SafeFailureDetails;
  credentialsLikely: boolean;
  retryMode: RetryMode;
}

export interface CreateFailureModelOptions {
  error: unknown;
  route?: string;
  source: FailureSource;
  phase?: FailurePhase;
  now?: Date;
}

interface RouteResponseLike {
  status: number;
  statusText?: unknown;
}

const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const SAFE_ERROR_TYPES = new Set([
  "AbortError",
  "ChunkLoadError",
  "DOMException",
  "Error",
  "EvalError",
  "NetworkError",
  "RangeError",
  "ReferenceError",
  "ResponseError",
  "RouteResponse",
  "SyntaxError",
  "TimeoutError",
  "TypeError",
  "URIError",
]);
const SECRET_FIELD_PATTERN =
  /\b(?:authorization|proxy-authorization|x-api-key|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|id[-_ ]?token|cookie|set-cookie|password|secret)\s*[:=]\s*(?:bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const QUERY_SECRET_PATTERN = /([?&](?:api[-_ ]?key|key|token|access[-_ ]?token|authorization)=)[^&#\s)]+/gi;
const DATA_FIELD_PATTERN = /\b(?:request\s+)?(?:body|payload|profile|inventory|items|members|chest|storage|headers?)\s*[:=]/i;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const safeStatus = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;

export const isRouteResponseLike = (error: unknown): error is RouteResponseLike => isRecord(error) && safeStatus(error.status) !== null;
const statusOf = (error: unknown): number | null => (isRouteResponseLike(error) ? safeStatus(error.status) : null);

const rawMessageOf = (error: unknown): string => {
  if (isRouteResponseLike(error)) return typeof error.statusText === "string" ? error.statusText : "";
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return "";
};

const nameOf = (error: unknown): string => (isRecord(error) && typeof error.name === "string" ? error.name : "UnknownError");

/** Scrub one short message line before it reaches display, copy, or console. */
export const sanitizeMessageText = (message: string): string => {
  let value = message.split(/\r?\n/, 1)[0].trim();
  const dataField = DATA_FIELD_PATTERN.exec(value);
  if (dataField) value = `${value.slice(0, dataField.index)}${dataField[0]} [redacted data]`;

  // Objects/arrays are payloads until proven otherwise.
  value = value.replace(/\{[^{}]*\}/g, "[redacted data]");
  value = value.replace(/\[[^\r\n]*\]/g, "[redacted data]");
  value = value.replace(SECRET_FIELD_PATTERN, "[redacted]");
  value = value.replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]");
  value = value.replace(QUERY_SECRET_PATTERN, "$1[redacted]");
  value = value.replace(UUID_PATTERN, "[redacted id]");
  value = value.replace(/\bhttps?:\/\/[^\s)]+/gi, (candidate) => {
    try {
      const url = new URL(candidate);
      return `${url.origin}${url.pathname}`.replace(UUID_PATTERN, "[redacted id]");
    } catch {
      return "[redacted url]";
    }
  });
  value = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("").replace(/\s+/g, " ").trim();
  return value.slice(0, 180);
};

export const sanitizeErrorMessage = (error: unknown): string => {
  const safe = sanitizeMessageText(rawMessageOf(error));
  return safe || "The route reported an unexpected failure.";
};

export const sanitizeRoute = (route: string | undefined): string => {
  const source = typeof route === "string" && route.trim() ? route : "/";
  let pathname = source;
  try {
    pathname = new URL(source, "https://skydex.invalid").pathname;
  } catch {
    pathname = source.split(/[?#]/, 1)[0] || "/";
  }
  pathname = pathname.replace(UUID_PATTERN, ":id").replace(/\/{2,}/g, "/");
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  return pathname.slice(0, 120);
};

export const isLikelyNetworkError = (error: unknown): boolean => {
  const text = `${nameOf(error)} ${rawMessageOf(error)}`.toLowerCase();
  return /failed to fetch|networkerror|network error|load failed|connection|offline|timed out|timeout|cors/.test(text);
};

const isModuleLoadError = (error: unknown): boolean =>
  nameOf(error) === "ChunkLoadError" ||
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(rawMessageOf(error));

const isLikelyCredentialsError = (error: unknown, status: number | null): boolean => {
  if (status === 401 || status === 403) return true;
  return /\b(?:unauthori[sz]ed|forbidden|credentials?|api[-_ ]?key|access[-_ ]?token|authentication)\b/i.test(rawMessageOf(error));
};

const safeErrorType = (error: unknown): string => {
  if (isRouteResponseLike(error)) return "RouteResponse";
  const name = nameOf(error);
  return SAFE_ERROR_TYPES.has(name) ? name : "UnknownError";
};

const timestampOf = (now: Date | undefined): string => (now instanceof Date && !Number.isNaN(now.getTime()) ? now.toISOString() : new Date().toISOString());

export const createFailureModel = ({ error, route, source, phase, now }: CreateFailureModelOptions): FailureModel => {
  const status = statusOf(error);
  const network = isLikelyNetworkError(error);
  const credentials = isLikelyCredentialsError(error, status);
  // React.lazy retains rejected imports; resetting the boundary cannot retry them.
  const reloadRequired = isModuleLoadError(error);
  const dataRetryMode: RetryMode = reloadRequired ? "reload" : "revalidate";
  const resolvedPhase = phase ?? (source === "component" ? "render" : status !== null || network || credentials ? "data" : "render");
  const reason: FailureReason =
    resolvedPhase === "render"
      ? "unexpected-render"
      : credentials
        ? "credentials"
        : network
          ? "network"
          : status === 404
            ? "not-found"
            : status !== null && status >= 500
              ? "service"
              : "data";
  const details: SafeFailureDetails = {
    route: sanitizeRoute(route),
    errorType: safeErrorType(error),
    message: status !== null ? `The route request returned HTTP ${status}.` : sanitizeErrorMessage(error),
    timestamp: timestampOf(now),
  };

  if (resolvedPhase === "render") {
    return {
      kind: "render",
      reason: "unexpected-render",
      source,
      title: "Skydex hit an unexpected rendering problem.",
      description: "This part of Skydex could not draw safely. Try remounting it, or use a safe page to keep going.",
      details,
      credentialsLikely: credentials,
      retryMode: reloadRequired ? "reload" : "remount",
    };
  }
  if (reason === "credentials") {
    return {
      kind: "data",
      reason,
      source,
      title: "Skydex could not load this route with the current credentials.",
      description: "The service rejected the request. Check the saved profile connection in Settings, then try again.",
      details,
      credentialsLikely: true,
      retryMode: dataRetryMode,
    };
  }
  if (reason === "network") {
    return {
      kind: "data",
      reason,
      source,
      title: "Skydex could not reach the route data.",
      description: "The connection or service did not answer. Check your connection and try again.",
      details,
      credentialsLikely: false,
      retryMode: dataRetryMode,
    };
  }
  return {
    kind: "data",
    reason,
    source,
    title: reason === "not-found" ? "That route data was not found." : "Skydex could not load this route.",
    description: reason === "not-found" ? "The page exists, but the data it requested was not available." : "The route returned a data error. Try again, or use a safe page.",
    details,
    credentialsLikely: false,
    retryMode: dataRetryMode,
  };
};

export const createNotFoundModel = (route: string | undefined, now?: Date): FailureModel => ({
  kind: "not-found",
  reason: "not-found",
  source: "route",
  title: "That page is not in the Skydex map.",
  description: "The link may be old or mistyped. Head back to the dashboard or open your Profile.",
  details: {
    route: sanitizeRoute(route),
    errorType: "NotFound",
    message: "No Skydex route matches this path.",
    timestamp: timestampOf(now),
  },
  credentialsLikely: false,
  retryMode: "none",
});

export const formatFailureDetails = (failure: FailureModel): string =>
  [
    "Skydex failure details",
    `Failure: ${failure.kind}`,
    `Reason: ${failure.reason}`,
    `Route: ${failure.details.route}`,
    `Type: ${failure.details.errorType}`,
    `Message: ${failure.details.message}`,
    `Time: ${failure.details.timestamp}`,
  ].join("\n");

export const formatDiagnosticRecord = (failure: FailureModel): Record<string, string> => ({
  route: failure.details.route,
  kind: failure.kind,
  reason: failure.reason,
  type: failure.details.errorType,
  message: failure.details.message,
  timestamp: failure.details.timestamp,
});

/** Local-only diagnostics. Raw errors, stacks, requests, and responses stay out. */
export const logUnexpectedFailure = (failure: FailureModel): void => {
  if (failure.kind === "not-found" || typeof console === "undefined" || typeof console.error !== "function") return;
  console.error("[Skydex] Unexpected failure", formatDiagnosticRecord(failure));
};

export const copyFailureDetails = async (failure: FailureModel): Promise<boolean> => {
  const text = formatFailureDetails(failure);
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    if (typeof document === "undefined" || !document.body) return false;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
};
