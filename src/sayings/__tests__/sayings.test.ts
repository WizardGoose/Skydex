import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  OFFER_OPENERS,
  PLAN_OPENERS,
  QUESTION_OPENERS,
  SIGNATURE_LINES,
  TARGETS,
  THOUGHT_OPENERS,
  TIMINGS,
  hasLongDash,
} from "../banks";
import { FIXED_BANKS, MAX_LENGTH, PATTERNS, isSlot } from "../patterns";
import { countSayings, explainCount, pickSaying, prepareSayings } from "../sayings";
import type { SayingDeck } from "../sayings";
import { makeRng, seedFrom } from "../prng";

const deck = prepareSayings();
const sample = (n: number): string[] => Array.from({ length: n }, (_, i) => pickSaying(deck, i));

const banks = [
  THOUGHT_OPENERS,
  OFFER_OPENERS,
  QUESTION_OPENERS,
  PLAN_OPENERS,
  ACTIONS,
  TARGETS,
  TIMINGS,
  SIGNATURE_LINES,
];

describe("Wonder's vocabulary", () => {
  it("keeps every bank non-empty, unique, and free of broken spacing", () => {
    for (const bank of banks) {
      expect(bank.length).toBeGreaterThan(0);
      expect(new Set(bank).size).toBe(bank.length);
      for (const entry of bank) {
        expect(entry).toBe(entry.trim());
        expect(entry).not.toMatch(/\s{2}/);
        expect(entry.length).toBeGreaterThan(0);
      }
    }
  });

  it("uses only base-form actions in the authored grammar frames", () => {
    expect(ACTIONS).toHaveLength(20);
    for (const action of ACTIONS) {
      expect(action).toMatch(/^[a-z]/);
      expect(action).not.toMatch(/\b(ing|ed)$/);
      expect(action).not.toMatch(/[.!?,:]$/);
    }
  });

  it("builds every target from compatible descriptor and noun sets", () => {
    expect(TARGETS).toHaveLength(50);
    for (const target of TARGETS) {
      expect(target).toMatch(
        /^the (missing|useful|hidden|next|right|odd|final|tricky|important|overlooked) (clue|detail|step|answer|option)$/
      );
    }
  });

  it("contains no item-name carousel vocabulary", () => {
    const copy = banks.flat().join("\n");
    expect(copy).not.toContain("Necron's Handle");
    expect(copy).not.toContain("Enchanted Book");
    expect(copy).not.toContain("Foul Flesh");
  });
});

describe("grammar patterns", () => {
  it("gives every slot a populated bank", () => {
    for (const pattern of PATTERNS) {
      for (const part of pattern.parts) {
        if (isSlot(part)) expect(FIXED_BANKS[part.kind].length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps stable ids and positive weights", () => {
    const ids = PATTERNS.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const pattern of PATTERNS) expect(pattern.weight).toBeGreaterThan(0);
  });

  it("can never exceed the field's copy budget", () => {
    for (const pattern of PATTERNS) {
      const widest = pattern.parts.reduce((length, part) => {
        if (!isSlot(part)) return length + part.length;
        return length + Math.max(...FIXED_BANKS[part.kind].map((entry) => entry.length));
      }, 0);
      expect(widest, pattern.id).toBeLessThanOrEqual(MAX_LENGTH);
    }
  });

  it("contains no long dash in any possible fragment", () => {
    for (const bank of banks) {
      for (const entry of bank) expect(hasLongDash(entry)).toBe(false);
    }
    for (const pattern of PATTERNS) {
      for (const part of pattern.parts) {
        if (typeof part === "string") expect(hasLongDash(part)).toBe(false);
      }
    }
  });
});

describe("generated speech", () => {
  const strings = sample(50000);

  it("always emits a complete, well-formed sentence", () => {
    for (const sentence of strings) {
      expect(sentence).toBe(sentence.trim());
      expect(sentence).toMatch(/^[A-Z]/);
      expect(sentence).toMatch(/[.!?]$/);
      expect(sentence).not.toMatch(/\s{2}/);
      expect(sentence).not.toMatch(/\s[.!?,:;]/);
      expect(sentence).not.toContain("undefined");
      expect(sentence).not.toContain("[object");
      expect(sentence.length).toBeLessThanOrEqual(MAX_LENGTH);
    }
  });

  it("draws from every sentence family", () => {
    expect(strings.some((line) => SIGNATURE_LINES.includes(line))).toBe(true);
    expect(strings.some((line) => THOUGHT_OPENERS.some((lead) => line.startsWith(`${lead} we should `)))).toBe(true);
    expect(strings.some((line) => OFFER_OPENERS.some((lead) => line.startsWith(`${lead} I can `)))).toBe(true);
    expect(strings.some((line) => QUESTION_OPENERS.some((lead) => line.startsWith(`${lead} we `)))).toBe(true);
    expect(strings.some((line) => PLAN_OPENERS.some((lead) => line.startsWith(`${lead} let's `)))).toBe(true);
  });

  it("reproduces a sentence from the same seed", () => {
    for (const seed of [0, 1, 7, 12345, 99999, "wonder", "still-wonder"]) {
      expect(pickSaying(deck, seed)).toBe(pickSaying(deck, seed));
    }
  });

  it("has a safe sentence even if handed an empty deck", () => {
    const empty: SayingDeck = { usable: [], cumulative: [], totalWeight: 0, combinations: 0 };
    expect(pickSaying(empty, 1)).toBe("The toolkit is ready whenever you are.");
  });
});

describe("combination count", () => {
  it("provides exactly one million generated combinations plus signature lines", () => {
    const rows = new Map(explainCount(deck).map((row) => [row.id, row.combinations]));
    expect(rows.get("signature")).toBe(20);
    expect(rows.get("thought")).toBe(250000);
    expect(rows.get("offer")).toBe(250000);
    expect(rows.get("question")).toBe(250000);
    expect(rows.get("plan")).toBe(250000);
    expect(countSayings(deck)).toBe(1000020);
  });
});

describe("seeding", () => {
  it("folds strings and numbers into stable, distinct seeds", () => {
    expect(seedFrom("wonder")).not.toBe(seedFrom("wandering"));
    expect(seedFrom(7)).toBe(7);
  });

  it("runs uniformly enough for the authored pattern weights", () => {
    const rng = makeRng("uniformity");
    const buckets = [0, 0, 0, 0];
    for (let i = 0; i < 40000; i++) buckets[Math.floor(rng() * 4)] += 1;
    for (const bucket of buckets) expect(Math.abs(bucket - 10000)).toBeLessThan(600);
  });
});
