export interface SharedPlacement {
  cropId: string;
  position: [number, number];
}

export interface SharedLayout {
  name?: string;
  inputs: SharedPlacement[];
  targets: SharedPlacement[];
}

export interface GreenhouseDefinition {
  name: string;
  size: number;
  ground: string;
  requirements?: Array<{ crop: string; count: number }>;
}

export interface GreenhouseDataset {
  crops: Record<string, GreenhouseDefinition>;
  mutations: Record<string, GreenhouseDefinition>;
}

export function layoutShareRoute(pathname: string): {
  code: string;
  oembed?: boolean;
  preview: boolean;
} | null;

export function decodeSharedLayout(code: string): Promise<SharedLayout>;
export function buildLayoutShareDocument(
  code: string,
  origin: string,
  dataset?: GreenhouseDataset,
  requestedName?: string,
): Promise<string>;
export function buildLayoutPreviewDocument(
  code: string,
  origin: string,
  dataset?: GreenhouseDataset,
  requestedName?: string,
): Promise<string>;
export function buildLayoutOembed(
  code: string,
  origin: string,
  dataset?: GreenhouseDataset,
  requestedName?: string,
): Promise<{
  version: "1.0";
  type: "photo";
  title: string;
  provider_name: "Skydex";
  provider_url: string;
  url: string;
  width: 1200;
  height: 630;
}>;
export function handleLayoutEmbedRequest(
  request: Request,
  env: unknown,
  context?: { waitUntil(promise: Promise<unknown>): void },
): Promise<Response>;

declare const worker: { fetch: typeof handleLayoutEmbedRequest };
export default worker;
