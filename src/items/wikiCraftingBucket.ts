import type { ParsedRecipe } from "./wikiCrafting";
import { VANILLA_CRAFTING_NAMES } from "./vanillaCraftingNames";

const API = "https://hypixelskyblock.minecraft.wiki/api.php";
const ROW_LIMIT = 5000;
const SLOTS = ["A1", "B1", "C1", "A2", "B2", "C2", "A3", "B3", "C3"];

/** A repeated final number is the wiki's stack-size annotation, not an item name. */
const itemQuantity = (value: string): { name: string; qty: number } | null => {
  const match = value.trim().match(/^(.*?)(?:,\s*(\d+(?:,\d{3})*)(?:,\s*\d+)*)?$/);
  if (!match) return null;
  const rawName = match[1].replace(/^\*/, "").replace(/,+$/, "").trim();
  // Match the established item/resource name for the wiki's fragment upgrades.
  const name = /\s*\(fragged\)$/i.test(rawName)
    ? ` ${rawName.replace(/\s*\(fragged\)$/i, "")}`
    : rawName;
  const qty = match[2] ? Number(match[2].replace(/,/g, "")) : 1;
  if (!name || /[[\]{}<>]/.test(name) || !Number.isSafeInteger(qty) || qty < 1) return null;
  return { name, qty };
};

/** Read only grid slots and outputs, never rendered infobox material totals. */
export const parseCraftingBucket = (rows: unknown[]): Map<string, ParsedRecipe> => {
  const recipes = new Map<string, ParsedRecipe>();
  for (const row of rows) {
    if (!row || typeof row !== "object" || !("json" in row) || typeof row.json !== "string") continue;
    let fields: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(row.json);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      fields = parsed as Record<string, unknown>;
    } catch { continue; }
    if (/^(yes|true|1)$/i.test(String(fields.legacy ?? ""))) continue;
    const rawOutput = fields.Output ?? fields.output;
    if (typeof rawOutput !== "string") continue;
    const outputs = rawOutput.split(";");
    for (const [variant, value] of outputs.entries()) {
      const output = itemQuantity(value);
      if (!output || recipes.has(output.name) || /test item/i.test(output.name)) continue;
      const merged = new Map<string, ParsedRecipe["ingredients"][number]>();
      let valid = true;
      for (const slot of SLOTS) {
        const raw = fields[slot];
        if (raw === undefined || raw === "") continue;
        if (typeof raw !== "string") { valid = false; break; }
        // Animated outputs and slots are parallel lists. A single slot repeats;
        // an empty animated cell stays empty rather than shifting later variants.
        const choices = raw.split(";");
        if (choices.length > 1 && variant >= choices.length) { valid = false; break; }
        const cell = choices.length === 1 ? choices[0] : choices[variant];
        if (!cell.trim()) continue;
        const ingredient = itemQuantity(cell);
        if (!ingredient) { valid = false; break; }
        const existing = merged.get(ingredient.name);
        if (existing) existing.qty += ingredient.qty;
        else merged.set(ingredient.name, { ...ingredient, alternatives: [] });
      }
      if (valid && merged.size) recipes.set(output.name, {
        yields: output.qty,
        ingredients: [...merged.values()],
        ...(VANILLA_CRAFTING_NAMES.has(output.name) ? { vanilla: true } : {}),
      });
    }
  }
  return recipes;
};

export const fetchCraftingBucket = async (signal?: AbortSignal): Promise<Map<string, ParsedRecipe>> => {
  const query = new URLSearchParams({
    action: "bucket",
    query: `bucket('crafting_recipes').select('page_name', 'json').limit(${ROW_LIMIT}).run()`,
    format: "json", formatversion: "2", origin: "*",
  });
  const response = await fetch(`${API}?${query}`, { signal });
  if (!response.ok) throw new Error(`Crafting recipes responded ${response.status}`);
  const body: unknown = await response.json();
  const rows = body && typeof body === "object" && "bucket" in body ? body.bucket : null;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length >= ROW_LIMIT) {
    throw new Error("The wiki did not return a complete crafting catalogue.");
  }
  const recipes = parseCraftingBucket(rows);
  if (!recipes.size) throw new Error("The wiki returned no readable crafting recipes.");
  return recipes;
};
