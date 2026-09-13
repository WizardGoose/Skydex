import { resourceIdFor } from "./itemResource";

/** Base game lore from NEU's public item records. Captured stack lore wins in the UI. */
export const ITEM_LORE_CACHE_KEY = "skydex.items.neu-lore.v1";
const ITEM_BASE_URL = "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items";
const TTL = 24 * 60 * 60 * 1000;
const RETRY_DELAY = 60 * 1000;
const MAX_ENTRIES = 400;
const PET_RARITY: Record<string, number> = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4, MYTHIC: 5 };
let petNumbers: Promise<unknown> | undefined;

export interface GameItemLore {
  id: string;
  name: string;
  lore: string[];
}
interface SavedLore { key?: string; fetchedAt: number; item: GameItemLore; }
let cache: Map<string, SavedLore> | undefined;
const pending = new Map<string, Promise<GameItemLore | null>>();
const failures = new Map<string, number>();

const validId = (id: string) => /^[A-Z0-9_]+(?:[;:][A-Z0-9_]+)*$/.test(id);
const stripColour = (name: string) => name.replace(/§[0-9a-fk-or]/gi, "");
const requestKey = (id: string, tier?: string | null) => tier ? `${id}|${tier.toUpperCase()}` : id;
const petId = (id: string, tier?: string | null) => tier && PET_RARITY[tier.toUpperCase()] !== undefined
  ? `${id.replace(/^PET_/, "")};${PET_RARITY[tier.toUpperCase()]}` : null;

/** Catalogue pets are newly created at level one, not the player's equipped pet. */
export function levelOnePetLore(payload: unknown, numbers: unknown, id: string, tier: string): unknown {
  if (!payload || typeof payload !== "object" || !numbers || typeof numbers !== "object") return null;
  const row = payload as Record<string, unknown>;
  if (typeof row.displayname !== "string" || !row.displayname.includes("[Lvl {LVL}]") || !Array.isArray(row.lore)) return null;
  const type = id.replace(/;\d+$/, "");
  const pet = (numbers as Record<string, Record<string, Record<string, unknown>>>)[type];
  const level = pet?.[tier.toUpperCase()]?.["1"] as { otherNums?: unknown; statNums?: unknown } | undefined;
  if (!level || !Array.isArray(level.otherNums) || !level.statNums || typeof level.statNums !== "object") return null;
  const values: Record<string, unknown> = { ...(level.statNums as Record<string, unknown>), LVL: 1 };
  level.otherNums.forEach((value, index) => { values[index] = value; });
  let complete = true;
  const substitute = (line: string) => line.replace(/\{([^}]+)\}/g, (placeholder, key: string) => {
    const value = values[key];
    if (typeof value !== "number" || !Number.isFinite(value)) { complete = false; return placeholder; }
    return String(value);
  });
  const displayname = substitute(row.displayname);
  const lore = row.lore.map(line => typeof line === "string" ? substitute(line) : line);
  return complete ? { ...row, displayname, lore } : null;
}

async function fetchLoreRecord(id: string, tier: string | null | undefined, signal: AbortSignal): Promise<GameItemLore | null> {
  let actualId = id;
  let response = await fetch(`${ITEM_BASE_URL}/${encodeURIComponent(id)}.json`, { signal });
  if (!response.ok) {
    const pet = petId(id, tier);
    if (response.status !== 404 || !pet) return null;
    actualId = pet;
    response = await fetch(`${ITEM_BASE_URL}/${encodeURIComponent(pet)}.json`, { signal });
  }
  if (!response.ok) return null;
  const payload: unknown = await response.json();
  const parsed = parseGameItemLore(payload, actualId);
  if (!parsed || !parsed.name.includes("[Lvl {LVL}]")) return parsed;
  const petTier = tier ?? Object.keys(PET_RARITY).find(key => actualId.endsWith(`;${PET_RARITY[key]}`));
  if (!petTier) return null;
  petNumbers ??= fetch("https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/petnums.json", { signal })
    .then(async result => { if (!result.ok) throw new Error("Pet numbers unavailable"); return result.json() as Promise<unknown>; })
    .catch(error => { petNumbers = undefined; throw error; });
  return parseGameItemLore(levelOnePetLore(payload, await petNumbers, actualId, petTier), actualId);
}

export function itemLoreId(id: string, name: string): string | null {
  const known = resourceIdFor(id) ?? resourceIdFor(name);
  if (known) return known;
  const candidate = id.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return validId(candidate) ? candidate : null;
}

/** Never display a different record or arbitrary HTML as the requested item's lore. */
export function parseGameItemLore(payload: unknown, id: string): GameItemLore | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  if (row.internalname !== id || typeof row.displayname !== "string" || !row.displayname.trim()) return null;
  if (!Array.isArray(row.lore) || !row.lore.length || row.lore.length > 160 || !row.lore.every(line => typeof line === "string" && line.length < 2048)) return null;
  return { id, name: stripColour(row.displayname), lore: [...row.lore] as string[] };
}

function entries(): Map<string, SavedLore> {
  if (cache) return cache;
  cache = new Map();
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(ITEM_LORE_CACHE_KEY) ?? "[]");
    if (Array.isArray(saved)) for (const row of saved.slice(-MAX_ENTRIES)) {
      if (!row || typeof row !== "object" || typeof row.fetchedAt !== "number" || row.fetchedAt > Date.now()) continue;
      const item = row.item;
      if (!item || typeof item.id !== "string" || !validId(item.id) || typeof item.name !== "string") continue;
      const valid = parseGameItemLore({ internalname: item.id, displayname: item.name, lore: item.lore }, item.id);
      const key = typeof row.key === "string" ? row.key : item.id;
      const [requested, tier] = key.split("|");
      const matches = validId(requested) && (item.id === requested || item.id === petId(requested, tier));
      if (valid && matches && Date.now() - row.fetchedAt < TTL) cache.set(key, { key, fetchedAt: row.fetchedAt, item: valid });
    }
  } catch { /* Storage is optional; the record can still be fetched. */ }
  return cache;
}

export function cachedItemLore(id: string, tier?: string | null): GameItemLore | null {
  const saved = entries().get(requestKey(id, tier)) ?? entries().get(id);
  return saved && Date.now() - saved.fetchedAt < TTL ? saved.item : null;
}

export function loadItemLore(id: string, tier?: string | null): Promise<GameItemLore | null> {
  if (!validId(id)) return Promise.resolve(null);
  const key = requestKey(id, tier);
  const saved = cachedItemLore(id, tier);
  if (saved) return Promise.resolve(saved);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  if (Date.now() - (failures.get(key) ?? -Infinity) < RETRY_DELAY) return Promise.resolve(null);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const request = fetchLoreRecord(id, tier, controller.signal)
    .then(item => {
      if (!item) throw new Error("Item lore identity unavailable");
      const saved = entries();
      saved.delete(key);
      saved.set(key, { key, fetchedAt: Date.now(), item });
      while (saved.size > MAX_ENTRIES) saved.delete(saved.keys().next().value!);
      try { localStorage.setItem(ITEM_LORE_CACHE_KEY, JSON.stringify([...saved.values()])); } catch { /* Memory cache still works. */ }
      failures.delete(key);
      return item;
    })
    .catch(() => { failures.set(key, Date.now()); return null; })
    .finally(() => { clearTimeout(timeout); pending.delete(key); });
  pending.set(key, request);
  return request;
}
