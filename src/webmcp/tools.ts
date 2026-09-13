import { PROFILE_TABS } from "../profile/profileTabs";
import { errorResult, type WebMcpToolDefinition } from "./shared";

export interface WebMcpHandlers {
  profileOverview(input: unknown): Promise<unknown>;
  profileSection(input: unknown): Promise<unknown>;
  recipePlan(input: unknown): Promise<unknown>;
  connectedHoldings(input: unknown): Promise<unknown>;
  greenhousePlan(input: unknown): Promise<unknown>;
  shardFusions(input: unknown): Promise<unknown>;
}

const DEFAULT_HANDLERS: WebMcpHandlers = {
  profileOverview: (input) => import("./profile").then((module) => module.profileOverview(input)),
  profileSection: (input) => import("./profile").then((module) => module.profileSection(input)),
  recipePlan: (input) => import("./inventory").then((module) => module.recipePlan(input)),
  connectedHoldings: (input) => import("./inventory").then((module) => module.connectedHoldings(input)),
  greenhousePlan: (input) => import("./greenhouse").then((module) => module.greenhousePlan(input)),
  shardFusions: (input) => import("./shards").then((module) => module.shardFusions(input)),
};

const readOnly = {
  readOnlyHint: true,
  // Player names, profile labels, and live game data come from external sources.
  untrustedContentHint: true,
} as const;

const guarded = (handler: (input: unknown) => Promise<unknown>) => async (input: unknown) => {
  try {
    return await handler(input);
  } catch (error) {
    return errorResult(error);
  }
};

export const createWebMcpTools = (
  handlers: WebMcpHandlers = DEFAULT_HANDLERS,
): readonly WebMcpToolDefinition[] => [
  {
    name: "skydex_profile_overview",
    title: "Skydex profile overview",
    description:
      "Get a compact SkyBlock profile summary and the availability of every Skydex profile section. Omit player to use the account linked in this exact browser. Supplying player always performs an isolated public lookup and never includes browser-local mod data. profile_id is optional; Skydex otherwise chooses the selected profile.",
    inputSchema: {
      type: "object",
      properties: {
        player: { type: "string", minLength: 1, maxLength: 36, description: "Minecraft username or UUID. Omit for the linked browser account." },
        profile_id: { type: "string", minLength: 1, maxLength: 64, description: "Optional SkyBlock profile ID returned by this tool." },
      },
      additionalProperties: false,
    },
    annotations: readOnly,
    execute: guarded(handlers.profileOverview),
  },
  {
    name: "skydex_profile_section",
    title: "Inspect a Skydex profile section",
    description:
      "Inspect one bounded section of a SkyBlock profile. Use the overview first when unsure which section is available. Omit player for the account linked in this exact browser; supplying player is always a public-only lookup with no browser-local mod data.",
    inputSchema: {
      type: "object",
      properties: {
        section: {
          type: "string",
          enum: [...PROFILE_TABS],
          description: "The profile section to inspect. network is Net Worth, crimson is Crimson Isle, and coop is the Profile / Co-op page.",
        },
        player: { type: "string", minLength: 1, maxLength: 36, description: "Minecraft username or UUID. Omit for the linked browser account." },
        profile_id: { type: "string", minLength: 1, maxLength: 64, description: "Optional SkyBlock profile ID returned by the overview." },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 8, description: "Maximum rows returned for each long list." },
      },
      required: ["section"],
      additionalProperties: false,
    },
    annotations: readOnly,
    execute: guarded(handlers.profileSection),
  },
  {
    name: "skydex_recipe_plan",
    title: "Plan a SkyBlock recipe",
    description:
      "Resolve a SkyBlock item, choose routes using this browser's automatically detected or Settings-selected profile mode, expand its recipe into raw materials, and optionally subtract connected holdings. Returns bounded normalized results, never raw API or inventory payloads.",
    inputSchema: {
      type: "object",
      properties: {
        item: { type: "string", minLength: 1, maxLength: 128, description: "Exact item name, Skydex key, or Hypixel item ID." },
        quantity: { type: "integer", minimum: 1, maximum: 1000000, default: 1 },
        use_connected_holdings: { type: "boolean", default: true, description: "Subtract only holdings available in this exact browser." },
      },
      required: ["item"],
      additionalProperties: false,
    },
    annotations: readOnly,
    execute: guarded(handlers.recipePlan),
  },
  {
    name: "skydex_connected_holdings",
    title: "Check connected SkyBlock holdings",
    description:
      "Check counts and provenance for up to 25 named items in this exact browser's linked Skydex context. It cannot search another player and never returns a whole inventory, chest, backpack, or raw payload. When Hypixel shares sacks and the live membership catalogue identifies an omitted item, it is known with total 0. Unknown means no enabled source observed that item and is never silently treated as zero.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          minItems: 1,
          maxItems: 25,
          uniqueItems: true,
          items: { type: "string", minLength: 1, maxLength: 128 },
          description: "Exact item names, Skydex keys, or Hypixel item IDs to check.",
        },
        include_sources: { type: "boolean", default: true },
      },
      required: ["items"],
      additionalProperties: false,
    },
    annotations: readOnly,
    execute: guarded(handlers.connectedHoldings),
  },
  {
    name: "skydex_greenhouse_plan",
    title: "Plan a Greenhouse mutation",
    description:
      "Turn one mutation goal into a bounded, right-sized Skydex planting plan with dependency cycles, base crops, mutations to place, unresolved mechanics, and optional connected-browser holdings. Uses the same local solver and mutation dataset as the Greenhouse UI.",
    inputSchema: {
      type: "object",
      properties: {
        mutation: { type: "string", minLength: 1, maxLength: 96, description: "Mutation name or Skydex mutation ID, such as Gloomgourd, Soggybud, or Magic Jellybean. Base crops are ingredients, not mutation targets." },
        quantity: { type: "integer", minimum: 1, maximum: 100000, default: 1 },
        use_connected_holdings: { type: "boolean", default: true },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 12, description: "Maximum rows returned for each long list." },
      },
      required: ["mutation"],
      additionalProperties: false,
    },
    annotations: readOnly,
    execute: guarded(handlers.greenhousePlan),
  },
  {
    name: "skydex_shard_fusions",
    title: "Inspect SkyBlock shard fusions",
    description:
      "Resolve a shard and return bounded fusion recipes that make it, use it, or both. Results use Skydex's fusion dataset and include stable shard keys and Hypixel IDs where available.",
    inputSchema: {
      type: "object",
      properties: {
        shard: { type: "string", minLength: 1, maxLength: 96, description: "Shard name, key, or Hypixel shard ID." },
        direction: { type: "string", enum: ["both", "made_from", "used_in"], default: "both" },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 10 },
      },
      required: ["shard"],
      additionalProperties: false,
    },
    annotations: readOnly,
    execute: guarded(handlers.shardFusions),
  },
];
