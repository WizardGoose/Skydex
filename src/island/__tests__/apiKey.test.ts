import { describe, expect, it } from "vitest";
import {
  EXPIRY_WARN_MS,
  expiryLabel,
  readExpiry,
  stampExpiry,
  uuidForName,
  withoutPersonalApiKey,
} from "../apiKey";
import type { KeyExpiry } from "../apiKey";

/**
 * The key expiry countdown.
 *
 * Two pure functions, and the whole point of them being pure is that the
 * thresholds can be pinned without a clock. `readExpiry` takes `now` as an
 * argument for exactly this reason, so nothing here mocks a timer, freezes a
 * date or touches storage. Importing the module only ever reads.
 *
 * WHY THE DATES ARE BUILT RATHER THAN WRITTEN AS EPOCH NUMBERS
 * -----------------------------------------------------------
 * `readExpiry` anchors to LOCAL midnight, because the player typed the date off
 * their own calendar and the countdown has to agree with that calendar. A
 * hardcoded epoch number would encode one timezone and the suite would then
 * pass in London and fail in Denver. Every `now` below is therefore derived
 * from the same local midnight the function itself computes, so each test says
 * "this many milliseconds before the deadline" and means it everywhere.
 */

/** Local midnight of a `YYYY-MM-DD` day, the instant `readExpiry` counts down to. */
const midnight = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("production credential migration", () => {
  it("removes every personal-key field without losing the saved account or profile", () => {
    expect(withoutPersonalApiKey({
      key: "old-personal-key",
      keyState: "valid",
      checkedAt: 123,
      keyExpiresOn: "2027-03-09",
      uuid: "b876ec32e396476ba1158438d83c67d4",
      name: "Wizard",
      profileId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    })).toEqual({
      key: "",
      keyState: "unchecked",
      checkedAt: null,
      keyExpiresOn: null,
      uuid: "b876ec32e396476ba1158438d83c67d4",
      name: "Wizard",
      profileId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
  });
});

/** `now` placed an exact distance before the named day begins. */
const before = (iso: string, ms: number): number => midnight(iso) - ms;

/** Non-null assertion with a real failure message when the parse unexpectedly gives up. */
const expiryAt = (iso: string, now: number): KeyExpiry => {
  const got = readExpiry(iso, now);
  if (got === null) throw new Error(`readExpiry refused ${iso}, which the test needed parsed`);
  return got;
};

describe("readExpiry: what counts as a date", () => {
  it("returns null when no date has been given", () => {
    // The permanent, normal state. Most people will never fill this field in.
    expect(readExpiry(null, Date.now())).toBeNull();
    expect(readExpiry("", Date.now())).toBeNull();
  });

  it("refuses anything that is not exactly YYYY-MM-DD", () => {
    const now = Date.now();
    expect(readExpiry("2027-3-9", now)).toBeNull();
    expect(readExpiry("2027-03-9", now)).toBeNull();
    expect(readExpiry("20270309", now)).toBeNull();
    expect(readExpiry("09-03-2027", now)).toBeNull();
    expect(readExpiry("2027-03-09T00:00:00Z", now)).toBeNull();
    expect(readExpiry("tomorrow", now)).toBeNull();
  });

  it("refuses a date-shaped string that is not a real day", () => {
    /*
     * The case the shape test alone would wave through. `new Date(2027, 1, 30)`
     * silently rolls forward to the 2nd of March, and a countdown that quietly
     * moved somebody's deadline two days later is worse than no countdown.
     */
    const now = Date.now();
    expect(readExpiry("2027-02-30", now)).toBeNull();
    expect(readExpiry("2027-13-01", now)).toBeNull();
    expect(readExpiry("2027-00-10", now)).toBeNull();
    expect(readExpiry("2027-04-31", now)).toBeNull();
  });

  it("accepts a real leap day and rejects the one that does not exist", () => {
    const now = Date.now();
    expect(readExpiry("2028-02-29", now)).not.toBeNull();
    expect(readExpiry("2027-02-29", now)).toBeNull();
  });
});

describe("readExpiry: the two day threshold", () => {
  const day = "2027-03-09";

  it("is still fine at exactly the warning threshold", () => {
    /*
     * The boundary the whole feature turns on. `state` flips strictly UNDER
     * `EXPIRY_WARN_MS`, so landing precisely on 48 hours is the last moment
     * that is not a warning. Pinned so that a later refactor to `<=` fails here
     * rather than in front of somebody.
     */
    const got = expiryAt(day, before(day, EXPIRY_WARN_MS));
    expect(got.msLeft).toBe(EXPIRY_WARN_MS);
    expect(got.state).toBe("fine");
  });

  it("turns amber one millisecond inside the threshold", () => {
    const got = expiryAt(day, before(day, EXPIRY_WARN_MS - 1));
    expect(got.msLeft).toBe(EXPIRY_WARN_MS - 1);
    expect(got.state).toBe("soon");
  });

  it("stays fine comfortably above the threshold", () => {
    expect(expiryAt(day, before(day, EXPIRY_WARN_MS + 1)).state).toBe("fine");
    expect(expiryAt(day, before(day, 7 * DAY)).state).toBe("fine");
    expect(expiryAt(day, before(day, 90 * DAY)).state).toBe("fine");
  });

  it("agrees that the threshold is two days", () => {
    // Stated independently of the constant, so a change to the policy has to be
    // a deliberate edit to this line and not a silent follow-on.
    expect(EXPIRY_WARN_MS).toBe(48 * HOUR);
  });

  it("stays soon for the whole of the last two days", () => {
    for (const ms of [47 * HOUR, 24 * HOUR, 6 * HOUR, HOUR, 60 * 1000, 1]) {
      expect(expiryAt(day, before(day, ms)).state).toBe("soon");
    }
  });
});

describe("readExpiry: expired", () => {
  const day = "2027-03-09";

  it("counts the moment the day begins as gone", () => {
    /*
     * Anchored to the start of the named day rather than its end. Warning half a
     * day early costs nothing; telling somebody their key is fine on the morning
     * it dies is the exact failure this exists to prevent.
     */
    const got = expiryAt(day, midnight(day));
    expect(got.msLeft).toBe(0);
    expect(got.state).toBe("expired");
  });

  it("stays expired afterwards", () => {
    expect(expiryAt(day, midnight(day) + 1).state).toBe("expired");
    expect(expiryAt(day, midnight(day) + 30 * DAY).state).toBe("expired");
  });

  it("reports negative time left once past", () => {
    expect(expiryAt(day, midnight(day) + HOUR).msLeft).toBe(-HOUR);
  });
});

describe("readExpiry: the numbers it hands the label", () => {
  const day = "2027-03-09";

  it("floors hours and days rather than rounding them", () => {
    // 47h59m is 47 hours, not 48. Rounding up would let the panel say "expires
    // in 48 hours" while the state had already flipped to soon.
    const got = expiryAt(day, before(day, 48 * HOUR - 60 * 1000));
    expect(got.hoursLeft).toBe(47);
    expect(got.daysLeft).toBe(1);
  });

  it("counts whole days above the threshold", () => {
    expect(expiryAt(day, before(day, 30 * DAY)).daysLeft).toBe(30);
    expect(expiryAt(day, before(day, 30 * DAY + 12 * HOUR)).daysLeft).toBe(30);
  });
});

describe("expiryLabel", () => {
  const day = "2027-03-09";
  const at = (ms: number) => expiryLabel(expiryAt(day, before(day, ms)));

  it("says nothing about hours once the key is dead", () => {
    expect(expiryLabel(expiryAt(day, midnight(day)))).toBe("key expired");
    expect(expiryLabel(expiryAt(day, midnight(day) + 5 * DAY))).toBe("key expired");
  });

  it("collapses the last hour into one phrase", () => {
    // Zero is a legal `hoursLeft`, and "expires in 0 hours" is not a sentence.
    expect(at(59 * 60 * 1000)).toBe("expires within the hour");
    expect(at(1)).toBe("expires within the hour");
  });

  it("counts in hours inside the threshold", () => {
    expect(at(HOUR)).toBe("expires in 1 hour");
    expect(at(2 * HOUR)).toBe("expires in 2 hours");
    expect(at(47 * HOUR)).toBe("expires in 47 hours");
  });

  it("counts in days above it", () => {
    // Precision matters exactly when the deadline is close, so the wording
    // switches units at the same line the colour does.
    expect(at(EXPIRY_WARN_MS)).toBe("expires in 2 days");
    expect(at(31 * DAY)).toBe("expires in 31 days");
  });

  it("gets the singular right on both sides of the unit switch", () => {
    expect(at(HOUR)).toContain(" 1 hour");
    expect(at(HOUR)).not.toContain("hours");
    // A day and a bit is still inside the two day window, so the only route to
    // "1 day" is a key whose date has been set in a way that floors to one.
    expect(expiryLabel({ msLeft: 25 * HOUR, hoursLeft: 25, daysLeft: 1, state: "fine" })).toBe("expires in 1 day");
  });

  it("never emits a dash of any width", () => {
    /*
     * The site's copy rule, pinned where generated text is assembled. Written as
     * code point escapes rather than literal characters so that this file, like
     * `sayings/banks.ts`, contains no long dash of its own. U+2010 to U+2015 is
     * the dash block and U+2212 is the minus sign a paste can drag in.
     */
    for (const ms of [1, HOUR, 47 * HOUR, EXPIRY_WARN_MS, 31 * DAY]) {
      expect(at(ms)).not.toMatch(/[\u2010-\u2015\u2212]/);
    }
  });
});

/**
 * The uuid/name pair.
 *
 * `importPlayerProfile` skips the name service whenever the typed name matches
 * the stored one and imports whatever the stored uuid points at, so a record
 * carrying one player's uuid under another player's name imports the wrong
 * account's data and reports no error. This is the rule that stops such a
 * record from being written; pure, so it is pinned without a store or storage.
 */
describe("uuidForName", () => {
  const alice = { uuid: "aaaaaaaaaaaa4aaaaaaaaaaaaaaaaaaa", name: "Alice" };

  it("keeps the uuid while the name still names it", () => {
    expect(uuidForName(alice, "Alice")).toBe(alice.uuid);
  });

  it("keeps it through a recase, which is the same account to Mojang", () => {
    expect(uuidForName(alice, "alice")).toBe(alice.uuid);
    expect(uuidForName(alice, "ALICE")).toBe(alice.uuid);
  });

  it("drops it for a different name, so the resolver derives the right one", () => {
    expect(uuidForName(alice, "Bob")).toBe("");
  });

  it("drops it part way through retyping, not just once the new name is complete", () => {
    // The tour writes on every keystroke, so "Alic", "Ali", "Al" are all states
    // the record actually passes through on the way from Alice to Bob.
    for (const partial of ["Alic", "Ali", "Al", "A", ""]) {
      expect(uuidForName(alice, partial)).toBe("");
    }
  });

  it("has nothing to keep when no name is stored", () => {
    expect(uuidForName({ uuid: alice.uuid, name: "" }, "Alice")).toBe("");
  });
});

/**
 * The stamp written beside a key the moment one is typed into the tour.
 *
 * Pure and clock-free like the rest of this file: every `now` below is an
 * absolute UTC instant, because the stamp is a UTC calendar date and pinning
 * it against a locally built date would only re-derive the code under test.
 */
describe("stampExpiry", () => {
  /** The LOCAL instant of a `YYYY-MM-DD HH:MM`, matching the clock the stamp and countdown share. */
  const local = (y: number, m: number, d: number, h: number, min = 0): number => new Date(y, m - 1, d, h, min).getTime();

  it("names the local day 47 hours out", () => {
    expect(stampExpiry(local(2026, 8, 9, 12))).toBe("2026-08-11");
  });

  it("is 47 hours and not 48, which is the whole point of it", () => {
    /* Proved at the half-hour where the two answers differ: from 00:30, 47
       hours lands at 23:30 on the 10th while 48 would cross into the 11th. */
    expect(stampExpiry(local(2026, 8, 9, 1, 30))).toBe("2026-08-11");
    expect(stampExpiry(local(2026, 8, 9, 0, 30))).toBe("2026-08-10");
  });

  it("rolls over months and years", () => {
    expect(stampExpiry(local(2026, 12, 30, 12))).toBe("2027-01-01");
    expect(stampExpiry(local(2026, 2, 27, 12))).toBe("2026-03-01");
  });

  it("always writes a date the store will keep", () => {
    /* `writeAccess` nulls anything `readExpiry` cannot parse, so a stamp that
       failed this would be dropped on the way to storage and the countdown
       would silently never appear. Leap day included, since that is the date
       a shape-only check would let through wrongly. */
    for (const now of [local(2026, 8, 9, 12), local(2026, 12, 30, 23, 59), local(2028, 2, 26, 12), local(2027, 1, 1, 0)]) {
      expect(readExpiry(stampExpiry(now), now)).not.toBeNull();
    }
  });

  it("is a plain YYYY-MM-DD with nothing of the time left on it", () => {
    expect(stampExpiry(local(2026, 8, 9, 23, 59))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
