import type { BazaarData } from "../types/hypixelApiTypes.ts";
import type { ShardWithKey, Shard } from "../types/types";
// Imported from the defining modules rather than the `../utilities` barrel.
// The barrel re-exports `isValidShardName`, which imports `../services`, which
// re-exports this file - so going through it would make the two directories
// initialise each other in a cycle.
import { sortShardsByNameWithPrefixAwareness } from "../utilities/utilityFunctions";
import {
  filterShards,
  BASIC_FILTER_CONFIG,
  NAME_ONLY_FILTER_CONFIG,
} from "../utilities/shardFilters";

export interface FusionData {
  shards: Record<string, Shard>;
  recipes: Record<string, Record<string, [string, string][]>>;
}

const PRICE_CACHE_KEY = "skydex.shard-prices.v1";
const PRICE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8_000;

export class DataService {
  private static instance: DataService;
  private shardsCache: ShardWithKey[] | null = null;
  private shardNameToKeyCache: Record<string, string> | null = null;
  private defaultRatesCache: Record<string, number> | null = null;
  private bazaarPriceCache: Record<string, Record<string, number>> | null = null;
  private bazaarPriceAt = 0;
  private pricesPending: Promise<void> | null = null;
  private priceFailure: { at: number; error: Error } | null = null;
  private fusionPending: Promise<FusionData> | null = null;
  private ratesPending: Promise<Record<string, number>> | null = null;
  private shardsPending: Promise<ShardWithKey[]> | null = null;

  public static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  private async fetchJson<T>(filename: string): Promise<T> {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${filename}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      throw new Error(`Failed to load ${filename}: ${error}`);
    }
  }

  private async fetchApi<T>(endpoint: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://api.hypixel.net/v2/skyblock${endpoint}`, { signal: controller.signal },
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      throw new Error(controller.signal.aborted
        ? "Hypixel Bazaar did not respond. Prices are unavailable; try again shortly."
        : `Could not load Hypixel Bazaar prices: ${error instanceof Error ? error.message : "connection failed"}`);
    } finally {
      clearTimeout(timer);
    }
  }

  loadFusionData(): Promise<FusionData> {
    return this.fusionPending ??= this.fetchJson<FusionData>("fusion-data.json").catch((error: unknown) => {
      this.fusionPending = null;
      throw error;
    });
  }

  async loadShards(): Promise<ShardWithKey[]> {
    if (this.shardsCache) {
      return this.shardsCache;
    }

    if (this.shardsPending) return this.shardsPending;
    this.shardsPending = this.buildShards();
    try { return await this.shardsPending; }
    finally { this.shardsPending = null; }
  }

  private async buildShards(): Promise<ShardWithKey[]> {
    const [fusionData, defaultRates] = await Promise.all([this.loadFusionData(), this.loadDefaultRates()]);

    this.shardsCache = Object.entries(fusionData.shards).map(([key, shard]: [string, Shard]) => ({
        key,
        ...shard,
        id: key,
        rate: defaultRates[key] || 0,
        canFuse: Object.values(fusionData.recipes[key] ?? {}).some((pairs) => Array.isArray(pairs) && pairs.length > 0),
    }));

    return this.shardsCache;
  }

  async getShardNameToKeyMap(): Promise<Record<string, string>> {
    if (this.shardNameToKeyCache) {
      return this.shardNameToKeyCache;
    }

    const shards = await this.loadShards();
    this.shardNameToKeyCache = shards.reduce((acc, shard) => {
      acc[shard.name.toLowerCase()] = shard.key;
      return acc;
    }, {} as Record<string, string>);

    return this.shardNameToKeyCache;
  }

  async loadDefaultRates(): Promise<Record<string, number>> {
    if (this.defaultRatesCache) {
      return this.defaultRatesCache;
    }

    this.ratesPending ??= this.fetchJson<Record<string, number>>("rates.json").catch((error: unknown) => {
      this.ratesPending = null;
      throw error;
    });
    this.defaultRatesCache = await this.ratesPending;
    return this.defaultRatesCache;
  }

  async loadShardCosts(useInstantBuyPrices: boolean): Promise<Record<string, number>> {
    const cacheKey = useInstantBuyPrices ? "instant_buy" : "buy_offer";
    if (!this.bazaarPriceCache) {
      try {
        const cached = JSON.parse(localStorage.getItem(PRICE_CACHE_KEY) ?? "null");
        if (cached && Number.isFinite(cached.at) && cached.at <= Date.now() && Date.now() - cached.at < PRICE_TTL_MS
          && cached.prices?.instant_buy && cached.prices?.buy_offer
          && Object.values(cached.prices).every((prices) => prices && typeof prices === "object"
            && Object.values(prices).every((price) => typeof price === "number" && Number.isFinite(price) && price > 0))) {
          this.bazaarPriceCache = cached.prices;
          this.bazaarPriceAt = cached.at;
        }
      } catch { /* A missing or invalid cache is not a price. */ }
    }
    if (this.bazaarPriceCache?.[cacheKey] && Date.now() - this.bazaarPriceAt < PRICE_TTL_MS) {
      return this.bazaarPriceCache[cacheKey];
    }
    if (this.priceFailure && Date.now() - this.priceFailure.at < 30_000) throw this.priceFailure.error;
    this.pricesPending ??= this.refreshPrices().catch((error: Error) => {
      this.priceFailure = { at: Date.now(), error };
      throw error;
    }).finally(() => { this.pricesPending = null; });
    await this.pricesPending;
    return this.bazaarPriceCache![cacheKey];
  }

  private async refreshPrices(): Promise<void> {
    const [bazaarData, shards] = await Promise.all([this.fetchApi<BazaarData>("/bazaar"), this.loadShards()]);
    if (!bazaarData.success || !bazaarData.products) throw new Error("Hypixel Bazaar returned no prices.");
    const prices: Record<string, Record<string, number>> = { instant_buy: {}, buy_offer: {} };
    for (const shard of shards) {
      const product = bazaarData.products[shard.internal_id];
      const buy = product?.buy_summary?.[0]?.pricePerUnit;
      const offer = product?.sell_summary?.[0]?.pricePerUnit;
      if (Number.isFinite(buy) && buy > 0) prices.instant_buy[shard.id] = buy;
      if (Number.isFinite(offer) && offer > 0) prices.buy_offer[shard.id] = offer;
    }
    this.bazaarPriceCache = prices;
    this.bazaarPriceAt = Date.now();
    this.priceFailure = null;
    try { localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({ at: this.bazaarPriceAt, prices })); }
    catch { /* Storage is optional. */ }
  }

  private sortShardsByQuery(shards: ShardWithKey[], query: string): ShardWithKey[] {
    const lowerQuery = query.toLowerCase();
    return shards.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aKey = a.key.toLowerCase();
      const bKey = b.key.toLowerCase();
      const aStarts = aName.startsWith(lowerQuery) || aKey.startsWith(lowerQuery);
      const bStarts = bName.startsWith(lowerQuery) || bKey.startsWith(lowerQuery);
      
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return sortShardsByNameWithPrefixAwareness(a, b);
    });
  }

  async searchShards(query: string): Promise<ShardWithKey[]> {
    const shards = await this.loadShards();
    const filtered = filterShards(shards, {
      query,
      searchConfig: BASIC_FILTER_CONFIG,
    });

    return this.sortShardsByQuery(filtered, query);
  }

  async searchShardsByNameOnly(query: string): Promise<ShardWithKey[]> {
    const shards = await this.loadShards();
    const filtered = filterShards(shards, {
      query,
      searchConfig: NAME_ONLY_FILTER_CONFIG,
    });

    // If no results found searching by name only, try searching title and description
    if (filtered.length === 0) {
      const fallbackConfig = {
        name: false,
        key: false,
        family: false,
        type: false,
        title: true,
        description: true,
      };

      const fallbackFiltered = filterShards(shards, {
        query,
        searchConfig: fallbackConfig,
      });

      return this.sortShardsByQuery(fallbackFiltered, query);
    }

    return this.sortShardsByQuery(filtered, query);
  }
}
