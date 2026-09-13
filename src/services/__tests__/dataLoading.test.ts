import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fusion = { shards: { C1: { name: "Grove", internal_id: "SHARD_GROVE" }, C2: { name: "Mist", internal_id: "SHARD_MIST" } }, recipes: {} };
const bazaar = { success: true, products: { SHARD_GROVE: { buy_summary: [{ pricePerUnit: 12 }], sell_summary: [{ pricePerUnit: 9 }] } } };
const storage = new Map<string, string>();

beforeEach(() => {
  vi.resetModules();
  storage.clear();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const fixtureFetch = () => vi.fn(async (url: string) => Response.json(
  url.includes("bazaar") ? bazaar : url.includes("fusion-data") ? fusion : { C1: 2 },
));

describe("shared Shards data loading", () => {
  it("allows fusion targets only when they have an output recipe, regardless of catch rate", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.includes("fusion-data") ? {
      shards: { ...fusion.shards, C3: { name: "Empty recipe" } },
      recipes: { C1: { 2: [["C2", "C3"]] }, C3: { 2: [] } },
    } : { C1: 10, C2: 20, C3: 30 })));
    const { DataService } = await import("../dataService");
    const shards = await DataService.getInstance().loadShards();
    expect(shards.map(({ key, canFuse }) => ({ key, canFuse }))).toEqual([
      { key: "C1", canFuse: true },
      { key: "C2", canFuse: false },
      { key: "C3", canFuse: false },
    ]);
    expect(shards).toHaveLength(3); // Catch-only shards remain in the full catalogue.
  });

  it("downloads each static dataset once across simultaneous readers", async () => {
    const fetcher = fixtureFetch();
    vi.stubGlobal("fetch", fetcher);
    const { DataService } = await import("../dataService");
    const service = DataService.getInstance();
    await Promise.all([service.loadShards(), service.loadShards(), service.loadFusionData(), service.loadDefaultRates()]);
    expect(fetcher.mock.calls.filter(([url]) => url.includes("fusion-data"))).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => url.includes("rates.json"))).toHaveLength(1);
  });

  it("gets both price modes from one request without inventing missing prices", async () => {
    const fetcher = fixtureFetch();
    vi.stubGlobal("fetch", fetcher);
    const { DataService } = await import("../dataService");
    const service = DataService.getInstance();
    const [instant, offer] = await Promise.all([service.loadShardCosts(true), service.loadShardCosts(false)]);
    expect(instant).toEqual({ C1: 12 });
    expect(offer).toEqual({ C1: 9 });
    expect(fetcher.mock.calls.filter(([url]) => url.includes("bazaar"))).toHaveLength(1);
  });

  it("uses a recent saved exact-order price on reload, but refreshes expired prices", async () => {
    vi.useFakeTimers();
    const fetcher = fixtureFetch();
    vi.stubGlobal("fetch", fetcher);
    let module = await import("../dataService");
    await module.DataService.getInstance().loadShardCosts(true);
    vi.resetModules();
    module = await import("../dataService");
    expect(await module.DataService.getInstance().loadShardCosts(false)).toEqual({ C1: 9 });
    expect(fetcher.mock.calls.filter(([url]) => url.includes("bazaar"))).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await module.DataService.getInstance().loadShardCosts(false);
    expect(fetcher.mock.calls.filter(([url]) => url.includes("bazaar"))).toHaveLength(2);
  });

  it("ends a stalled request at eight seconds and shares the failure briefly", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      if (!url.includes("bazaar")) return Promise.resolve(Response.json(url.includes("fusion-data") ? fusion : {}));
      return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
    });
    vi.stubGlobal("fetch", fetcher);
    const { DataService } = await import("../dataService");
    const service = DataService.getInstance();
    const pending = expect(service.loadShardCosts(true)).rejects.toThrow("did not respond");
    await vi.advanceTimersByTimeAsync(8_000);
    await pending;
    await expect(service.loadShardCosts(false)).rejects.toThrow("did not respond");
    expect(fetcher.mock.calls.filter(([url]) => url.includes("bazaar"))).toHaveLength(1);
  });

  it("does not turn malformed or expired saved prices into a successful calculation", async () => {
    storage.set("skydex.shard-prices.v1", JSON.stringify({ at: Date.now() - 600_000, prices: { instant_buy: { C1: 12 }, buy_offer: { C1: 9 } } }));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("bazaar")) throw new Error("offline");
      return Response.json(url.includes("fusion-data") ? fusion : {});
    }));
    const { DataService } = await import("../dataService");
    await expect(DataService.getInstance().loadShardCosts(true)).rejects.toThrow("offline");
  });
});
