import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCraftingBucket, parseCraftingBucket } from "../wikiCraftingBucket";

const row = (fields: Record<string, unknown>) => ({ json: JSON.stringify(fields) });
afterEach(() => vi.unstubAllGlobals());

describe("current wiki crafting table", () => {
  it("combines repeated slots and preserves the output quantity", () => {
    const recipe = parseCraftingBucket([row({ Output: "Haste Block, 8", A1: "Enchanted End Stone", B1: "Enchanted End Stone", B2: "Enchanted Feather" })]).get("Haste Block");
    expect(recipe).toMatchObject({ yields: 8, ingredients: [
      { name: "Enchanted End Stone", qty: 2 }, { name: "Enchanted Feather", qty: 1 },
    ] });
  });

  it("keeps animated output variants paired with their own ingredients", () => {
    const recipes = parseCraftingBucket([row({
      Output: "Perfect Helmet - Tier II;Perfect Boots - Tier II",
      A1: "Enchanted Diamond Block;Enchanted Diamond Block",
      B2: "Perfect Helmet - Tier I;Perfect Boots - Tier I",
      C3: ";Enchanted Diamond Block",
    })]);
    expect(recipes.get("Perfect Helmet - Tier II")?.ingredients).toEqual([
      { name: "Enchanted Diamond Block", qty: 1, alternatives: [] },
      { name: "Perfect Helmet - Tier I", qty: 1, alternatives: [] },
    ]);
    expect(recipes.get("Perfect Boots - Tier II")?.ingredients).toEqual([
      { name: "Enchanted Diamond Block", qty: 2, alternatives: [] },
      { name: "Perfect Boots - Tier I", qty: 1, alternatives: [] },
    ]);
  });

  it("does not combine alternate crafts or read a stack annotation into the item name", () => {
    const fields = { Output: "Enchanted Cobblestone;Enchanted Cobblestone", A1: "Cobblestone, 32,32;", B1: "Cobblestone, 32,32;Cobblestone, 32,32" };
    const recipes = parseCraftingBucket([row(fields), row({ Output: "Enchanted Cobblestone, 9", A1: "Another Material, 160" })]);
    expect(recipes.get("Enchanted Cobblestone")).toEqual({ yields: 1, ingredients: [{ name: "Cobblestone", qty: 64, alternatives: [] }] });
  });

  it("handles lowercase outputs, thousands, generic ingredients and vanilla classification", () => {
    const recipes = parseCraftingBucket([
      row({ output: "Spirit Mask (fragged)", B2: "Spirit Mask", A1: "Thorn Fragment, 1,024" }),
      row({ Output: "Crafting Table", A1: "*Planks", B1: "*Planks" }),
    ]);
    expect(recipes.get(" Spirit Mask")?.ingredients[0]).toMatchObject({ name: "Thorn Fragment", qty: 1024 });
    expect(recipes.get("Crafting Table")).toMatchObject({ vanilla: true, ingredients: [{ name: "Planks", qty: 2 }] });
  });

  it("rejects legacy and malformed records without inventing an incomplete recipe", () => {
    const recipes = parseCraftingBucket([
      row({ Output: "Old Item", legacy: "yes", A1: "Wheat" }),
      row({ Output: "Invalid Item", A1: "Wheat", B1: { name: "Missing input" } }),
      row({ Output: "Markup Item", A1: "{{Unknown}}" }),
      { json: "not json" }, null,
    ]);
    expect(recipes.size).toBe(0);
  });

  it("fetches the current public table with cancellation and CORS enabled", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ bucket: [row({ Output: "Test Blade", A1: "Iron Ingot, 2" })] })));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    expect((await fetchCraftingBucket(controller.signal)).get("Test Blade")?.ingredients[0].qty).toBe(2);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get("action")).toBe("bucket");
    expect(new URL(url).searchParams.get("origin")).toBe("*");
    expect(options.signal).toBe(controller.signal);
  });

  it("refuses empty, malformed and capped catalogues so partial results cannot become a fresh cache", async () => {
    for (const body of [{ bucket: [] }, { error: {} }, { bucket: Array(5000).fill(row({ Output: "Test Blade", A1: "Iron Ingot" })) }]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body))));
      await expect(fetchCraftingBucket()).rejects.toThrow("complete crafting catalogue");
    }
  });
});
