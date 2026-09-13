import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPetTextureCacheForTests,
  neuItemUrl,
  neuPetItemUrl,
  parseNeuItemTier,
  parseNeuPetTextureHash,
  resolveNeuItemHead,
  resolvePetHeadUrl,
} from "../petTextures";

const RABBIT_HASH = "63438555e899bd9a051a95dbea49eb2ecfa52a69dbba8998f3673819e277fdf5";
const HEDGEHOG_HASH = "5f5e835c116e8e200e2e06aa593cab8f1a9f8c40e7f005a9c76f12e24f4c6370";
const BEE_HASH = "9c72c132073ec5a058218d6fbfb4a9970652ced9214d53f4f614b3902fd99a7a";
const ROCK_SKIN_HASH = "7df8aab57136df2296c7c6f969ff25d58116fe2ec59b96a85ba4927e1f6779e6";

const skinValue = (hash: string): string => Buffer.from(JSON.stringify({
  textures: { SKIN: { url: `http://textures.minecraft.net/texture/${hash}` } },
})).toString("base64");

const escapedValue = (value: string): string => `${String.fromCharCode(92)}"${value}${String.fromCharCode(92)}"`;

const neuRecord = (hash: string, tier: string): { nbttag: string; lore: string[] } => ({
  nbttag: `{SkullOwner:{Properties:{textures:[0:{Value:${escapedValue(skinValue(hash))}}]}}}`,
  lore: [`§d§l${tier}`],
});

const response = (status: number, payload: unknown = null): Response => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => payload,
} as Response);

const fakeStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
};

let records: Map<string, Response>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetPetTextureCacheForTests();
  vi.stubGlobal("localStorage", fakeStorage());
  records = new Map();
  fetchMock = vi.fn(async (input: string | URL | Request) => records.get(String(input)) ?? response(404));
  vi.stubGlobal("fetch", fetchMock);
});

describe("parseNeuPetTextureHash", () => {
  it("reads the escaped SkullOwner texture value used by NEU records", () => {
    expect(parseNeuPetTextureHash(neuRecord(RABBIT_HASH, "MYTHIC"))).toBe(RABBIT_HASH);
  });

  it("rejects a missing, malformed, or non-texture value", () => {
    expect(parseNeuPetTextureHash({})).toBeNull();
    expect(parseNeuPetTextureHash({ nbttag: "{Value:\"not-base64\"}" })).toBeNull();
    expect(parseNeuPetTextureHash({
      nbttag: `{Value:${escapedValue(skinValue("not-a-hash"))}}`,
    })).toBeNull();
  });
});

describe("resolvePetHeadUrl", () => {
  it("resolves distinct exact heads for Rabbit, Hedgehog, and Bee", async () => {
    records.set(neuPetItemUrl("RABBIT", 5), response(200, neuRecord(RABBIT_HASH, "MYTHIC")));
    records.set(neuPetItemUrl("HEDGEHOG", 4), response(200, neuRecord(HEDGEHOG_HASH, "LEGENDARY")));
    records.set(neuPetItemUrl("BEE", 0), response(200, neuRecord(BEE_HASH, "COMMON")));

    await expect(resolvePetHeadUrl("RABBIT", "mythic")).resolves.toBe(`https://mc-heads.net/head/${RABBIT_HASH}/64`);
    await expect(resolvePetHeadUrl("HEDGEHOG", "legendary")).resolves.toBe(`https://mc-heads.net/head/${HEDGEHOG_HASH}/64`);
    await expect(resolvePetHeadUrl("BEE", "common")).resolves.toBe(`https://mc-heads.net/head/${BEE_HASH}/64`);
    expect(new Set([
      `https://mc-heads.net/head/${RABBIT_HASH}/64`,
      `https://mc-heads.net/head/${HEDGEHOG_HASH}/64`,
      `https://mc-heads.net/head/${BEE_HASH}/64`,
    ]).size).toBe(3);
  });

  it("tries another rarity when the exact NEU record is absent", async () => {
    records.set(neuPetItemUrl("BEE", 0), response(404));
    records.set(neuPetItemUrl("BEE", 4), response(200, neuRecord(BEE_HASH, "LEGENDARY")));

    await expect(resolvePetHeadUrl("BEE", "common")).resolves.toBe(`https://mc-heads.net/head/${BEE_HASH}/64`);
    expect(fetchMock).toHaveBeenCalledWith(neuPetItemUrl("BEE", 0));
    expect(fetchMock).toHaveBeenCalledWith(neuPetItemUrl("BEE", 4));
  });

  it("returns null on a transport error and retries on the next request", async () => {
    records.set(neuPetItemUrl("BEE", 0), response(503));
    await expect(resolvePetHeadUrl("BEE", "common")).resolves.toBeNull();

    records.set(neuPetItemUrl("BEE", 0), response(200, neuRecord(BEE_HASH, "COMMON")));
    await expect(resolvePetHeadUrl("BEE", "common")).resolves.toBe(`https://mc-heads.net/head/${BEE_HASH}/64`);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("resolveNeuItemHead", () => {
  it("preserves an exact custom skin head and its recorded rarity", async () => {
    records.set(neuItemUrl("PET_SKIN_ROCK_COOL"), response(200, neuRecord(ROCK_SKIN_HASH, "EPIC")));

    await expect(resolveNeuItemHead("PET_SKIN_ROCK_COOL")).resolves.toEqual({
      url: `https://mc-heads.net/head/${ROCK_SKIN_HASH}/64`,
      tier: "epic",
    });
    expect(parseNeuItemTier(neuRecord(ROCK_SKIN_HASH, "EPIC"))).toBe("epic");
  });

  it("does not invent artwork for an absent custom skin record", async () => {
    await expect(resolveNeuItemHead("PET_SKIN_DOES_NOT_EXIST")).resolves.toEqual({ url: null, tier: null });
  });
});
