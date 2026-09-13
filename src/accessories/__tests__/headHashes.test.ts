import { describe, expect, it, beforeEach } from "vitest";
import {
  buildHeadIndex,
  hashFromSkinValue,
  headHashFor,
  headSrcFor,
  __setHeadsForTests,
} from "../headHashes";
import { chooseIconSource, derivedCandidates } from "../../items/wikiImages";

/*
 * Fixtures are real `skin.value` strings, copied verbatim from Hypixel's
 * `/v2/resources/skyblock/items` on 2026-08-02. Hand-rolled base64 would only
 * prove the decoder can read something this module invented; these prove it can
 * read what the game actually ships, spacing, key order and all.
 */
const CAMPFIRE_INITIATE_I =
  "ewogICJ0aW1lc3RhbXAiIDogMTc0NDE5OTgzMTIxOCwKICAicHJvZmlsZUlkIiA6ICJiYzRlZGZiNWYzNmM0OGE3YWM5ZjFhMzlkYzIzZjRmOCIsCiAgInByb2ZpbGVOYW1lIiA6ICI4YWNhNjgwYjIyNDYxMzQwIiwKICAic2lnbmF0dXJlUmVxdWlyZWQiIDogdHJ1ZSwKICAidGV4dHVyZXMiIDogewogICAgIlNLSU4iIDogewogICAgICAidXJsIiA6ICJodHRwOi8vdGV4dHVyZXMubWluZWNyYWZ0Lm5ldC90ZXh0dXJlLzNhZGE2NjY3MTViZmQyYWE5ZmJkODFkYWVmNTliOWZlMWM5NmM0ZmEwZDA4ZGJjNzJlYWU1NjMzMTc3ZGJmODgiLAogICAgICAibWV0YWRhdGEiIDogewogICAgICAgICJtb2RlbCIgOiAic2xpbSIKICAgICAgfQogICAgfQogIH0KfQ==";

const ABICASE =
  "ewogICJ0aW1lc3RhbXAiIDogMTcyMDAyMDY2ODk1MywKICAicHJvZmlsZUlkIiA6ICI5NDczNjdlMTE1N2Q0ZjQzYTZmYmY0MGQwOTY3MjY3MyIsCiAgInByb2ZpbGVOYW1lIiA6ICJ3aW5uZXIzMiIsCiAgInNpZ25hdHVyZVJlcXVpcmVkIiA6IHRydWUsCiAgInRleHR1cmVzIiA6IHsKICAgICJTS0lOIiA6IHsKICAgICAgInVybCIgOiAiaHR0cDovL3RleHR1cmVzLm1pbmVjcmFmdC5uZXQvdGV4dHVyZS9iMjEyOGY0OGQ5OTcxODY1NjNmYmM1YjQ3YTg4YzBkMGFhYzkyZmEyYzI4NWNkMWZhZTQyMGMzNGZhOGYyMDEwIiwKICAgICAgIm1ldGFkYXRhIiA6IHsKICAgICAgICAibW9kZWwiIDogInNsaW0iCiAgICAgIH0KICAgIH0KICB9Cn0=";

const CAMPFIRE_HASH = "3ada666715bfd2aa9fbd81daef59b9fe1c96c4fa0d08dbc72eae5633177dbf88";
const ABICASE_HASH = "b2128f48d997186563fbc5b47a88c0d0aac92fa2c285cd1fae420c34fa8f2010";

/** Base64 of an arbitrary object, for the shapes that are not texture documents. */
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64");

describe("hashFromSkinValue", () => {
  it("pulls the texture hash out of a real skin value", () => {
    expect(hashFromSkinValue(CAMPFIRE_INITIATE_I)).toBe(CAMPFIRE_HASH);
    expect(hashFromSkinValue(ABICASE)).toBe(ABICASE_HASH);
  });

  it("lower cases the hash, so one texture is one URL", () => {
    const upper = b64({
      textures: { SKIN: { url: `http://textures.minecraft.net/texture/${CAMPFIRE_HASH.toUpperCase()}` } },
    });
    expect(hashFromSkinValue(upper)).toBe(CAMPFIRE_HASH);
  });

  it("accepts a trailing slash and an https URL", () => {
    expect(
      hashFromSkinValue(b64({ textures: { SKIN: { url: `https://textures.minecraft.net/texture/${ABICASE_HASH}/` } } }))
    ).toBe(ABICASE_HASH);
  });

  /*
   * Every one of these is a null, never a throw. A value we cannot read means
   * the item has no late rung, which is exactly the state it was already in.
   */
  it("returns null for anything that is not a texture document", () => {
    expect(hashFromSkinValue("")).toBeNull();
    expect(hashFromSkinValue("not base64 at all !!!")).toBeNull();
    expect(hashFromSkinValue(Buffer.from("plain text", "utf8").toString("base64"))).toBeNull();
    expect(hashFromSkinValue(b64({}))).toBeNull();
    expect(hashFromSkinValue(b64({ textures: {} }))).toBeNull();
    expect(hashFromSkinValue(b64({ textures: { CAPE: { url: "http://x/texture/abc" } } }))).toBeNull();
    expect(hashFromSkinValue(b64({ textures: { SKIN: { url: 42 } } }))).toBeNull();
  });

  it("refuses a URL whose tail is not a hex hash", () => {
    expect(hashFromSkinValue(b64({ textures: { SKIN: { url: "http://evil.example/texture/../../etc" } } }))).toBeNull();
    expect(hashFromSkinValue(b64({ textures: { SKIN: { url: "http://x/texture/nothexatall" } } }))).toBeNull();
    // Too short to be a texture hash.
    expect(hashFromSkinValue(b64({ textures: { SKIN: { url: "http://x/texture/abc123" } } }))).toBeNull();
  });
});

describe("buildHeadIndex", () => {
  it("keys hashes by Hypixel item id", () => {
    const index = buildHeadIndex([
      { id: "CAMPFIRE_TALISMAN_1", skin: { value: CAMPFIRE_INITIATE_I } },
      { id: "ABICASE", skin: { value: ABICASE } },
    ]);
    expect(index).toEqual({ CAMPFIRE_TALISMAN_1: CAMPFIRE_HASH, ABICASE: ABICASE_HASH });
  });

  it("omits items with no skin rather than recording a broken one", () => {
    const index = buildHeadIndex([
      { id: "WITH", skin: { value: ABICASE } },
      { id: "NO_SKIN_FIELD" },
      { id: "NULL_SKIN", skin: null },
      { id: "EMPTY_VALUE", skin: { value: "" } },
      { id: "UNPARSABLE", skin: { value: "@@@" } },
    ]);
    expect(Object.keys(index)).toEqual(["WITH"]);
  });
});

describe("headHashFor and headSrcFor", () => {
  beforeEach(() => {
    __setHeadsForTests({ CAMPFIRE_TALISMAN_1: CAMPFIRE_HASH }, Date.now());
  });

  it("renders a known id through the MCHeads chain the Island page uses", () => {
    expect(headHashFor("CAMPFIRE_TALISMAN_1")).toBe(CAMPFIRE_HASH);
    expect(headSrcFor("CAMPFIRE_TALISMAN_1")).toBe(`https://mc-heads.net/head/${CAMPFIRE_HASH}/64`);
  });

  it("gives undefined for an id with no head, so no lateSrc prop is set", () => {
    expect(headHashFor("MASTER_SKULL_TIER_1")).toBeNull();
    expect(headSrcFor("MASTER_SKULL_TIER_1")).toBeUndefined();
    expect(headSrcFor(null)).toBeUndefined();
    expect(headSrcFor(undefined)).toBeUndefined();
  });
});

/*
 * THE ORDERING, WHICH IS THE WHOLE POINT.
 *
 * The wiki sources are licensed, cached and already working, so they keep first
 * refusal and the head render is the last thing standing between us and the
 * fallback. These assert that against `chooseIconSource`, the function that
 * actually decides, rather than against a description of it.
 */
describe("icon chain ordering, wiki first and head last", () => {
  const NAME = "Campfire Initiate Badge I";
  const HEAD = `https://mc-heads.net/head/${CAMPFIRE_HASH}/64`;
  const wikiRungs = derivedCandidates(NAME);

  it("has wiki rungs to try in the first place", () => {
    expect(wikiRungs.length).toBeGreaterThan(0);
  });

  it("shows a wiki rung first, never the head", () => {
    const { current } = chooseIconSource({ display: NAME, failed: [], lateSrc: HEAD });
    expect(current).toBe(wikiRungs[0]);
    expect(current).not.toBe(HEAD);
  });

  it("waits rather than showing the head while the wiki lookup is still in flight", () => {
    // Every free rung has failed but the API has not answered yet. An
    // unanswered title is a question, not an answer, and settling for a head
    // here would beat a real wiki result that is about to arrive.
    const { current, exhausted } = chooseIconSource({
      display: NAME,
      failed: [...wikiRungs],
      lateSrc: HEAD,
    });
    expect(exhausted).toBe(true);
    expect(current).toBeNull();
  });

  it("prefers what the wiki API resolved over the head", () => {
    const fromApi = "https://hypixelskyblock.minecraft.wiki/images/thumb/Something.png/64px-Something.png";
    const { current } = chooseIconSource({
      display: NAME,
      failed: [...wikiRungs],
      lateSrc: HEAD,
      known: () => fromApi,
    });
    expect(current).toBe(fromApi);
  });

  it("shows the head only once the wiki has said it has nothing", () => {
    const { current } = chooseIconSource({
      display: NAME,
      failed: [],
      lateSrc: HEAD,
      known: () => null,
    });
    expect(current).toBe(HEAD);
  });

  it("keeps a caller supplied src ahead of everything, head included", () => {
    const local = "/greenhouse/crops/choconut.png";
    const { current } = chooseIconSource({
      display: NAME,
      failed: [],
      src: local,
      lateSrc: HEAD,
      known: () => null,
    });
    expect(current).toBe(local);
  });

  /*
   * TERMINAL. There is no rung after the head render, which matters more than it
   * looks: mc-heads.net answers an unknown hash with 200 and a default Steve
   * head rather than a 404, so `onError` never fires and nothing would ever put
   * the head into `failed` in the browser. Forcing it in here proves the only
   * thing the code can promise, which is that nothing follows it.
   */
  it("has nothing after the head", () => {
    const { current } = chooseIconSource({
      display: NAME,
      failed: [HEAD],
      lateSrc: HEAD,
      known: () => null,
    });
    expect(current).toBeNull();
  });

  it("falls back with no head at all, exactly as before this existed", () => {
    const { current } = chooseIconSource({ display: NAME, failed: [], known: () => null });
    expect(current).toBeNull();
  });
});
