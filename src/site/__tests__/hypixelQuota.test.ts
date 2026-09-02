import { describe, expect, it } from "vitest";
import { HypixelQuota, hypixelQuotaPolicy } from "../../../cloudflare/hypixel-quota.js";

const memoryContext = () => {
  const values = new Map<string, unknown>();
  return {
    values,
    context: {
      storage: {
        transaction: async <T>(callback: (transaction: {
          get(key: string): Promise<unknown>;
          put(key: string, value: unknown): Promise<void>;
        }) => Promise<T>): Promise<T> => callback({
          get: async (key) => values.get(key),
          put: async (key, value) => { values.set(key, value); },
        }),
      },
    },
  };
};

const call = async (
  quota: HypixelQuota,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const response = await quota.fetch(new Request("https://quota.skydex.internal/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return response.json() as Promise<Record<string, unknown>>;
};

describe("Hypixel quota coordinator", () => {
  it("keeps a twenty-percent production reserve from its 300 request fallback", async () => {
    const { context } = memoryContext();
    const quota = new HypixelQuota(context);
    const result = await call(quota, { action: "reserve", now: 10_000 });

    expect(hypixelQuotaPolicy).toEqual({ fallbackLimit: 300, reserveRatio: 0.2 });
    expect(result).toMatchObject({ ok: true, allowed: true, limit: 300, remaining: 239 });
  });

  it("adapts downward to Hypixel's authoritative remaining headers", async () => {
    const { context } = memoryContext();
    const quota = new HypixelQuota(context);
    await call(quota, {
      action: "observe",
      now: 10_000,
      limit: 300,
      remaining: 100,
      resetSeconds: 40,
    });
    const result = await call(quota, { action: "reserve", now: 11_000 });

    // 100 upstream units remain, but 60 stay protected for ordinary traffic.
    expect(result).toMatchObject({ ok: true, allowed: true, remaining: 39 });
  });

  it("never increases the current window when responses arrive out of order", async () => {
    const { context } = memoryContext();
    const quota = new HypixelQuota(context);
    await call(quota, {
      action: "observe",
      now: 10_000,
      limit: 300,
      remaining: 80,
      resetSeconds: 40,
    });
    await call(quota, {
      action: "observe",
      now: 11_000,
      limit: 300,
      remaining: 200,
      resetSeconds: 39,
    });
    const result = await call(quota, { action: "reserve", now: 12_000 });

    expect(result).toMatchObject({ allowed: true, remaining: 19 });
  });

  it("opens a fresh protected allowance after the observed reset", async () => {
    const { context } = memoryContext();
    const quota = new HypixelQuota(context);
    await call(quota, {
      action: "observe",
      now: 10_000,
      limit: 300,
      remaining: 60,
      resetSeconds: 5,
    });
    const blocked = await call(quota, { action: "reserve", now: 11_000 });
    const reset = await call(quota, { action: "reserve", now: 16_000 });

    expect(blocked).toMatchObject({ allowed: false, remaining: 0 });
    expect(reset).toMatchObject({ allowed: true, remaining: 239 });
  });
});
