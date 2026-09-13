import { describe, expect, it, vi } from "vitest";
import { PROFILE_TABS } from "../../profile/profileTabs";
import { createWebMcpTools, type WebMcpHandlers } from "../tools";
import { WebMcpToolError } from "../shared";

const handlers = (): WebMcpHandlers => ({
  profileOverview: vi.fn(async (input) => ({ tool: "overview", input })),
  profileSection: vi.fn(async (input) => ({ tool: "section", input })),
  recipePlan: vi.fn(async (input) => ({ tool: "recipe", input })),
  connectedHoldings: vi.fn(async (input) => ({ tool: "holdings", input })),
  greenhousePlan: vi.fn(async (input) => ({ tool: "greenhouse", input })),
  shardFusions: vi.fn(async (input) => ({ tool: "shards", input })),
});

describe("WebMCP tool contracts", () => {
  it("registers the six approved, bounded read-only tools", () => {
    const tools = createWebMcpTools(handlers());

    expect(tools.map((tool) => tool.name)).toEqual([
      "skydex_profile_overview",
      "skydex_profile_section",
      "skydex_recipe_plan",
      "skydex_connected_holdings",
      "skydex_greenhouse_plan",
      "skydex_shard_fusions",
    ]);
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(tools.every((tool) => tool.annotations?.untrustedContentHint === true)).toBe(true);
    expect(tools.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(true);
  });

  it("keeps public profile selection away from connected holdings", () => {
    const tools = createWebMcpTools(handlers());
    const overview = tools.find((tool) => tool.name === "skydex_profile_overview");
    const section = tools.find((tool) => tool.name === "skydex_profile_section");
    const holdings = tools.find((tool) => tool.name === "skydex_connected_holdings");

    expect(overview?.inputSchema).toMatchObject({
      properties: { player: { type: "string" }, profile_id: { type: "string" } },
    });
    expect(section?.inputSchema).toMatchObject({
      properties: { section: { enum: [...PROFILE_TABS] } },
      required: ["section"],
    });
    expect(holdings?.inputSchema).toMatchObject({
      properties: {
        items: { type: "array", minItems: 1, maxItems: 25 },
      },
      required: ["items"],
    });
    expect((holdings?.inputSchema.properties as Record<string, unknown>).player).toBeUndefined();
    expect(holdings?.description).toContain("identifies an omitted item, it is known with total 0");

    const recipe = tools.find((tool) => tool.name === "skydex_recipe_plan");
    expect((recipe?.inputSchema.properties as Record<string, unknown>).ironman).toBeUndefined();
    expect(recipe?.description).toContain("automatically detected or Settings-selected profile mode");
  });

  it("dispatches inputs and converts expected failures into concise results", async () => {
    const stubs = handlers();
    const tools = createWebMcpTools(stubs);
    const recipe = tools.find((tool) => tool.name === "skydex_recipe_plan");
    const input = { item: "Aspect of the End", quantity: 1 };

    await expect(recipe?.execute(input)).resolves.toEqual({ tool: "recipe", input });
    expect(stubs.recipePlan).toHaveBeenCalledWith(input);

    stubs.shardFusions = vi.fn(async () => {
      throw new WebMcpToolError("shard_not_found", "No shard matched.");
    });
    const guardedShard = createWebMcpTools(stubs)
      .find((tool) => tool.name === "skydex_shard_fusions");
    await expect(guardedShard?.execute({ shard: "missing" })).resolves.toEqual({
      ok: false,
      error: { code: "shard_not_found", message: "No shard matched." },
    });
  });
});
