import { headUrl } from "../island/heads";

/**
 * Exact pet-head textures from NotEnoughUpdates' current item records.
 *
 * Hypixel's public item resource has skull data for ordinary items and pet
 * skins, but it does not publish the base `PET_<TYPE>` records. NEU does: each
 * `<TYPE>;<rarity>.json` record contains the same signed texture property the
 * game uses. Reading that property avoids guessing a wiki filename and, more
 * importantly, avoids ever substituting one generic player head for another
 * pet's identity.
 *
 * The records are fetched at runtime and cached locally for one day. Nothing
 * from the NEU repository is bundled into Skydex; provenance is in NOTICE.md.
 */
export const NEU_PET_ITEM_BASE_URL =
  "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/items";

export const PET_TEXTURE_CACHE_KEY = "skydex.pets.neu-textures.v1";
export const PET_TEXTURE_TTL = 24 * 60 * 60 * 1000;

const MAX_CONCURRENT_FETCHES = 6;

const PET_RARITY_INDEX: Readonly<Record<string, number>> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

interface CachedPetTexture {
  fetchedAt: number;
  url: string;
  tier?: string | null;
}

export interface ResolvedNeuItemHead {
  url: string | null;
  tier: string | null;
}

interface PetTextureCache {
  entries: Record<string, CachedPetTexture>;
}

interface QueuedFetch<T> {
  run: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

let cache: PetTextureCache | null = null;
let activeFetches = 0;
const fetchQueue: QueuedFetch<unknown>[] = [];
const pending = new Map<string, Promise<string | null>>();
const pendingItems = new Map<string, Promise<ResolvedNeuItemHead>>();

const normalizePetType = (value: string): string => value
  .trim()
  .toUpperCase()
  .replace(/^PET_/, "")
  .replace(/[^A-Z0-9_]/g, "_");

const normalizeItemId = (value: string): string => value
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9_;-]/g, "_");

const cacheKey = (type: string, tier: string): string =>
  `${normalizePetType(type)};${tier.trim().toLowerCase()}`;

const ensureCache = (): PetTextureCache => {
  if (cache !== null) return cache;
  try {
    const raw = localStorage.getItem(PET_TEXTURE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof (parsed as { entries?: unknown }).entries === "object" &&
      (parsed as { entries?: unknown }).entries !== null
    ) {
      cache = parsed as PetTextureCache;
      return cache;
    }
  } catch {
    // Optional cache. A blocked or corrupt store only costs a fresh fetch.
  }
  cache = { entries: {} };
  return cache;
};

const writeCache = (): void => {
  try {
    localStorage.setItem(PET_TEXTURE_CACHE_KEY, JSON.stringify(ensureCache()));
  } catch {
    // The exact texture still renders for this visit if storage is unavailable.
  }
};

const pumpFetchQueue = (): void => {
  while (activeFetches < MAX_CONCURRENT_FETCHES && fetchQueue.length > 0) {
    const next = fetchQueue.shift();
    if (!next) return;
    activeFetches += 1;
    void next.run().then(next.resolve, next.reject).finally(() => {
      activeFetches -= 1;
      pumpFetchQueue();
    });
  }
};

const withFetchSlot = <T>(run: () => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
  fetchQueue.push({ run, resolve, reject } as QueuedFetch<unknown>);
  pumpFetchQueue();
});

/** Extract the Mojang texture hash from one NEU item JSON record. */
export const parseNeuPetTextureHash = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const nbt = (payload as { nbttag?: unknown }).nbttag;
  if (typeof nbt !== "string") return null;

  const encoded = /Value:\\?"([A-Za-z0-9+/=]+)\\?"/.exec(nbt)?.[1];
  if (!encoded) return null;

  try {
    const decoded = JSON.parse(atob(encoded)) as {
      textures?: { SKIN?: { url?: unknown } };
    };
    const textureUrl = decoded.textures?.SKIN?.url;
    if (typeof textureUrl !== "string") return null;
    return /textures\.minecraft\.net\/texture\/([0-9a-f]{32,64})/i.exec(textureUrl)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
};

/** Read the actual item rarity from NEU's formatted item lore. */
export const parseNeuItemTier = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as { lore?: unknown; displayname?: unknown };
  const source = [
    ...(Array.isArray(record.lore) ? record.lore.filter((line): line is string => typeof line === "string") : []),
    typeof record.displayname === "string" ? record.displayname : "",
  ];
  const rarityPattern = /\b(VERY SPECIAL|SPECIAL|SUPREME|DIVINE|MYTHIC|LEGENDARY|EPIC|RARE|UNCOMMON|COMMON)\b/;
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const line = source[index];
    const plain = line.replace(/§[0-9A-FK-OR]/gi, "").trim().toUpperCase();
    const rarity = rarityPattern.exec(plain)?.[1];
    if (rarity) return rarity.toLowerCase().replace(/\s+/g, "_");
  }
  return null;
};

export const neuPetItemUrl = (type: string, rarityIndex: number): string => {
  const id = `${normalizePetType(type)};${rarityIndex}`;
  return `${NEU_PET_ITEM_BASE_URL}/${encodeURIComponent(id)}.json`;
};

export const neuItemUrl = (itemId: string): string =>
  `${NEU_PET_ITEM_BASE_URL}/${encodeURIComponent(normalizeItemId(itemId))}.json`;

const rarityCandidates = (tier: string): number[] => {
  const exact = PET_RARITY_INDEX[tier.trim().toLowerCase()];
  return [...new Set([exact, 4, 5, 3, 2, 1, 0].filter((value): value is number => typeof value === "number"))];
};

const fetchPetTexture = async (type: string, tier: string): Promise<string | null> => {
  for (const rarityIndex of rarityCandidates(tier)) {
    const response = await withFetchSlot(() => fetch(neuPetItemUrl(type, rarityIndex)));
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(`NEU pet record responded ${response.status}`);
    const hash = parseNeuPetTextureHash(await response.json());
    if (!hash) continue;
    return headUrl(hash);
  }
  return null;
};

const fetchItemHead = async (itemId: string): Promise<ResolvedNeuItemHead> => {
  const response = await withFetchSlot(() => fetch(neuItemUrl(itemId)));
  if (!response.ok) {
    if (response.status === 404) return { url: null, tier: null };
    throw new Error(`NEU item record responded ${response.status}`);
  }
  const payload = await response.json() as unknown;
  const hash = parseNeuPetTextureHash(payload);
  return {
    url: hash ? headUrl(hash) : null,
    tier: parseNeuItemTier(payload),
  };
};

const resolveCachedTexture = (
  key: string,
  load: () => Promise<string | null>,
): Promise<string | null> => {
  const saved = ensureCache().entries[key];
  if (saved && Date.now() - saved.fetchedAt < PET_TEXTURE_TTL && headUrl(saved.url.split("/").at(-2) ?? "")) {
    return Promise.resolve(saved.url);
  }

  const existing = pending.get(key);
  if (existing) return existing;

  const request = load()
    .then((url) => {
      if (url) {
        ensureCache().entries[key] = { fetchedAt: Date.now(), url };
        writeCache();
      }
      return url;
    })
    .catch(() => null)
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
};

/** Resolve one exact base-pet head, deduped across active and stored tiles. */
export const resolvePetHeadUrl = (type: string, tier: string): Promise<string | null> => {
  const key = cacheKey(type, tier);
  return resolveCachedTexture(key, () => fetchPetTexture(type, tier));
};

/** Resolve an exact custom-head item such as `PET_SKIN_*`. */
export const resolveNeuItemHead = (itemId: string): Promise<ResolvedNeuItemHead> => {
  const normalized = normalizeItemId(itemId);
  const key = `item:${normalized}`;
  const saved = ensureCache().entries[key];
  if (
    saved &&
    saved.tier !== undefined &&
    Date.now() - saved.fetchedAt < PET_TEXTURE_TTL &&
    headUrl(saved.url.split("/").at(-2) ?? "")
  ) {
    return Promise.resolve({ url: saved.url, tier: saved.tier });
  }

  const existing = pendingItems.get(key);
  if (existing) return existing;

  const request = fetchItemHead(normalized)
    .then((result) => {
      if (result.url) {
        ensureCache().entries[key] = { fetchedAt: Date.now(), url: result.url, tier: result.tier };
        writeCache();
      }
      return result;
    })
    .catch(() => ({ url: null, tier: null }))
    .finally(() => pendingItems.delete(key));
  pendingItems.set(key, request);
  return request;
};

export const resolveNeuItemHeadUrl = (itemId: string): Promise<string | null> =>
  resolveNeuItemHead(itemId).then((result) => result.url);

/** Test seam. The browser cache remains persistent; production never clears it. */
export const __resetPetTextureCacheForTests = (): void => {
  cache = null;
  activeFetches = 0;
  fetchQueue.length = 0;
  pending.clear();
  pendingItems.clear();
};
