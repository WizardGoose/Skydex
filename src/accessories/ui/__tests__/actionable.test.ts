import { describe, expect, it } from "vitest";
import { actionablePathOf } from "../actionable";
import { buildShopIndex } from "../../../items/wikiShops";
import { DAYS_PER_YEAR, SKYBLOCK_DAY_MS, SKYBLOCK_EPOCH_MS } from "../../skyblockCalendar";
import type { CheckedRequirement } from "../types";
import type { AccessoryView } from "../types";

/**
 * The border rule, against a pinned clock and a synthetic shop index.
 *
 * Every case here is one clause of the border rule: craftable-and-unblocked,
 * sold-by-an-NPC-shop, or event-currently-running, in that priority, and
 * nothing else lights a border.
 */

const view = (over: Partial<AccessoryView> & { id: string }): AccessoryView => ({
  name: over.id,
  tier: null,
  family: null,
  familyRank: null,
  itemId: null,
  craftable: false,
  recipe: null,
  recipeYields: 1,
  unlocks: null,
  requirements: [],
  checked: [],
  stats: null,
  rift: false,
  riftTransferable: false,
  group: "other",
  attainability: "unknownReach",
  status: "missing",
  source: "wiki",
  acquisition: { category: "needsReview", detail: null, alternatives: [], evidence: "fallback" },
  readiness: { kind: "unknown", label: "Acquisition route still needs review." },
  blockedBy: null,
  coveredByFamily: false,
  foldedBehind: null,
  foldedHigher: [],
  ownedPrerequisite: null,
  eventKey: null,
  ...over,
});

const collectionBlock: CheckedRequirement = {
  kind: "collection",
  target: "Acacia Log collection",
  threshold: "tier 6",
  how: "Collect 250 Acacia Log.",
  raw: "COLLECTION",
  state: "unmet",
  have: "40",
  gap: 210,
};

const slayerBlock: CheckedRequirement = {
  kind: "slayer",
  target: "Tarantula Broodfather Slayer",
  threshold: "7",
  how: "Level Tarantula slayer to 7.",
  raw: "SLAYER",
  state: "unmet",
  have: "2",
  gap: 5,
};

/** A stock index selling exactly one thing, joined by name like the page does. */
const shops = buildShopIndex([
  {
    npc: "Adventurer",
    offers: [{ item: "Zombie Talisman", stack: 1, costs: [{ kind: "currency", currency: "Coins", amount: 500 }] }],
  },
]);
const noShops = buildShopIndex([]);

/**
 * Event-gated counters, built through the REAL index builder so the test
 * covers the `SHOP_EVENTS` join and not a hand-assembled listing. "Bingo
 * (NPC)" and "Drakuu" are entries in that map; the point of using them is
 * that these are the two verified liars: outside Bingo's window the old
 * border told the player to go buy the Bingo Talisman from an NPC that did
 * not exist, and Drakuu's counter is gated by Kuudra progression no clock
 * can decide.
 */
const eventShops = buildShopIndex([
  {
    npc: "Bingo (NPC)",
    offers: [{ item: "Bingo Talisman", stack: 1, costs: [{ kind: "currency", currency: "Bingo Points", amount: 100 }] }],
  },
  {
    npc: "Drakuu",
    offers: [{ item: "Kuudra Follower Artifact", stack: 1, costs: [{ kind: "currency", currency: "Coins", amount: 50000000 }] }],
  },
  {
    npc: "Weaponsmith",
    offers: [{ item: "Zombie Talisman", stack: 1, costs: [{ kind: "currency", currency: "Coins", amount: 500 }] }],
  },
]);

/** Real instants either side of Bingo's first-seven-real-days window. */
const bingoLive = Date.UTC(2026, 7, 3); // Aug 3: day 3 of the month
const bingoOver = Date.UTC(2026, 7, 15); // Aug 15: window closed for weeks

/** An instant inside the Spooky Festival window (Autumn 29) of some year. */
const spookyLive = SKYBLOCK_EPOCH_MS + (4 * DAYS_PER_YEAR + 7 * 31 + 28) * SKYBLOCK_DAY_MS;
/** The same calendar spot one month earlier: nothing running. */
const nothingLive = SKYBLOCK_EPOCH_MS + (4 * DAYS_PER_YEAR + 6 * 31 + 28) * SKYBLOCK_DAY_MS;

describe("actionablePathOf", () => {
  it("lights craft for an unblocked craftable", () => {
    expect(actionablePathOf(view({ id: "x", craftable: true }), noShops, nothingLive)).toBe("craft");
  });

  it("refuses craft for a collection-blocked craftable", () => {
    // The border is an instruction, and the game will not let them craft it
    // today. This clause is stated in the rule deliberately, not implied.
    const entry = view({ id: "x", craftable: true, status: "locked", blockedBy: collectionBlock });
    expect(actionablePathOf(entry, noShops, nothingLive)).toBeNull();
  });

  it("still lights shop behind a collection gate, which only locks the recipe", () => {
    const entry = view({
      id: "x",
      name: "Zombie Talisman",
      craftable: true,
      status: "locked",
      blockedBy: collectionBlock,
    });
    expect(actionablePathOf(entry, shops, nothingLive)).toBe("shop");
  });

  it("closes every door on one of Hypixel's own unmet requirements", () => {
    // A slayer level gates the item however it is acquired.
    const entry = view({
      id: "x",
      name: "Zombie Talisman",
      craftable: true,
      status: "locked",
      blockedBy: slayerBlock,
      eventKey: "spookyFestival",
    });
    expect(actionablePathOf(entry, shops, spookyLive)).toBeNull();
  });

  it("lights shop from the stock index, joined by name", () => {
    expect(actionablePathOf(view({ id: "x", name: "Zombie Talisman" }), shops, nothingLive)).toBe("shop");
    expect(actionablePathOf(view({ id: "x", name: "Wolf Paw" }), shops, nothingLive)).toBeNull();
  });

  it("lights an event-gated shop only while its event is live: the Bingo Talisman case", () => {
    // The regression this whole rule exists for. The article's merchant field
    // classifies the Bingo Talisman as "shop" (so eventKey stays null), and
    // the stock index lists the offer year-round, but the Bingo NPC exists
    // for the first seven real days of each month and no longer.
    const entry = view({ id: "x", name: "Bingo Talisman", source: "shop" });
    expect(actionablePathOf(entry, eventShops, bingoLive)).toBe("shop");
    expect(actionablePathOf(entry, eventShops, bingoOver)).toBeNull();
  });

  it("never lights a shop whose gate the clock cannot decide: the Drakuu case", () => {
    // Drakuu appears only after defeating Kuudra, which is progression, not
    // time. `SHOP_EVENTS` carries it as `unknown`, and unknown never lights,
    // whatever the date.
    const entry = view({ id: "x", name: "Kuudra Follower Artifact", source: "shop" });
    expect(actionablePathOf(entry, eventShops, bingoLive)).toBeNull();
    expect(actionablePathOf(entry, eventShops, bingoOver)).toBeNull();
  });

  it("keeps ordinary counters lit whatever the date", () => {
    // The Weaponsmith has no entry in SHOP_EVENTS and must not be dimmed by
    // the machinery that dims the Bingo NPC.
    const entry = view({ id: "x", name: "Zombie Talisman" });
    expect(actionablePathOf(entry, eventShops, bingoLive)).toBe("shop");
    expect(actionablePathOf(entry, eventShops, bingoOver)).toBe("shop");
  });

  it("lights event only while the event is actually running", () => {
    const entry = view({ id: "x", source: "event", eventKey: "spookyFestival" });
    expect(actionablePathOf(entry, noShops, spookyLive)).toBe("event");
    expect(actionablePathOf(entry, noShops, nothingLive)).toBeNull();
  });

  it("an unknown event never lights a border, even during every festival", () => {
    // Great Spook, Mining Fiesta and their kind: the calendar cannot say, so
    // the border must not.
    const entry = view({ id: "x", source: "event", eventKey: "unknown" });
    expect(actionablePathOf(entry, noShops, spookyLive)).toBeNull();
  });

  it("resolves several open doors in the order craft, shop, event", () => {
    const entry = view({
      id: "x",
      name: "Zombie Talisman",
      craftable: true,
      eventKey: "spookyFestival",
    });
    expect(actionablePathOf(entry, shops, spookyLive)).toBe("craft");
    expect(actionablePathOf(view({ ...entry, id: "x", craftable: false }), shops, spookyLive)).toBe("shop");
  });

  it("never lights an owned tile", () => {
    const entry = view({ id: "x", name: "Zombie Talisman", craftable: true, status: "owned" });
    expect(actionablePathOf(entry, shops, spookyLive)).toBeNull();
  });
});
