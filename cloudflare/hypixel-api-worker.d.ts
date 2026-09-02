export interface HypixelApiRoute {
  endpoint: "profiles" | "garden" | "museum";
  id: string;
  upstreamUrl: string;
}

export interface HypixelSnapshotRoute {
  endpoint: "snapshot";
  uuid: string;
  profileId?: string;
}

export interface HypixelApiRouteError {
  error: "notFound" | "query";
}

export const HYPIXEL_METRIC_FIELDS: readonly string[];

export function hypixelApiRoute(
  input: string | URL,
): HypixelApiRoute | HypixelSnapshotRoute | HypixelApiRouteError | null;

export function handleHypixelApiRequest(
  request: Request,
  env: unknown,
  context?: { waitUntil(promise: Promise<unknown>): void },
  runtime?: {
    fetch?: typeof fetch;
    cache?: {
      match(request: Request): Promise<Response | undefined>;
      put(request: Request, response: Response): Promise<void>;
    };
  },
): Promise<Response | null>;
