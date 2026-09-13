import { FIXED_BANKS, PATTERNS, isSlot } from "./patterns";
import type { Pattern, Slot } from "./patterns";
import { makeRng, randInt } from "./prng";

/** A grammar pattern with its exact number of possible sentences. */
export interface PreparedPattern {
  pattern: Pattern;
  combinations: number;
}

export interface SayingDeck {
  usable: readonly PreparedPattern[];
  cumulative: readonly number[];
  totalWeight: number;
  combinations: number;
}

/**
 * Prepare Wonder's immutable speech deck. No search-index nouns enter this
 * path: the bar remains a real search field, but its idle voice belongs to
 * Wonder rather than to the results catalogue.
 */
export const prepareSayings = (): SayingDeck => {
  const usable: PreparedPattern[] = [];
  const cumulative: number[] = [];
  let totalWeight = 0;
  let combinations = 0;

  for (const pattern of PATTERNS) {
    let count = 1;
    for (const part of pattern.parts) {
      if (isSlot(part)) count *= FIXED_BANKS[part.kind].length;
    }
    if (count <= 0) continue;

    usable.push({ pattern, combinations: count });
    totalWeight += pattern.weight;
    cumulative.push(totalWeight);
    combinations += count;
  }

  return { usable, cumulative, totalWeight, combinations };
};

const choosePattern = (deck: SayingDeck, rng: () => number): PreparedPattern | null => {
  if (deck.usable.length === 0) return null;

  const roll = rng() * deck.totalWeight;
  for (let i = 0; i < deck.cumulative.length; i++) {
    if (roll < deck.cumulative[i]) return deck.usable[i];
  }
  return deck.usable[deck.usable.length - 1];
};

const drawSlot = (slot: Slot, rng: () => number): string => {
  const bank = FIXED_BANKS[slot.kind];
  return bank[randInt(rng, bank.length)];
};

/** The same seed always produces the same complete sentence. */
export const pickSaying = (deck: SayingDeck, seed: string | number): string => {
  const rng = makeRng(seed);
  const chosen = choosePattern(deck, rng);
  if (!chosen) return "The toolkit is ready whenever you are.";

  let out = "";
  for (const part of chosen.pattern.parts) out += isSlot(part) ? drawSlot(part, rng) : part;
  return out;
};

export const countSayings = (deck: SayingDeck): number => deck.combinations;

export const explainCount = (deck: SayingDeck): { id: string; combinations: number }[] =>
  deck.usable.map(({ pattern, combinations }) => ({ id: pattern.id, combinations }));
