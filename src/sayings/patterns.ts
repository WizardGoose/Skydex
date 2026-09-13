import {
  ACTIONS,
  OFFER_OPENERS,
  PLAN_OPENERS,
  QUESTION_OPENERS,
  SIGNATURE_LINES,
  TARGETS,
  THOUGHT_OPENERS,
  TIMINGS,
} from "./banks";

/**
 * Patterns own Wonder's grammar. Slots only accept banks written for that
 * exact position, and literal fragments own their spacing and punctuation.
 */
export type SlotKind = "thought" | "offer" | "question" | "plan" | "action" | "target" | "timing" | "signature";

export interface Slot {
  kind: SlotKind;
}

export type Part = string | Slot;

export interface Pattern {
  id: string;
  /** Relative likelihood. This is deliberately separate from combination count. */
  weight: number;
  parts: readonly Part[];
}

const slot = (kind: SlotKind): Slot => ({ kind });

const THOUGHT = slot("thought");
const OFFER = slot("offer");
const QUESTION = slot("question");
const PLAN = slot("plan");
const ACTION = slot("action");
const TARGET = slot("target");
const TIMING = slot("timing");
const SIGNATURE = slot("signature");

export const isSlot = (part: Part): part is Slot => typeof part !== "string";

export const FIXED_BANKS: Record<SlotKind, readonly string[]> = {
  thought: THOUGHT_OPENERS,
  offer: OFFER_OPENERS,
  question: QUESTION_OPENERS,
  plan: PLAN_OPENERS,
  action: ACTIONS,
  target: TARGETS,
  timing: TIMINGS,
  signature: SIGNATURE_LINES,
};

/** The Home field is 54rem wide; this also catches accidental runaway copy. */
export const MAX_LENGTH = 90;

/**
 * Four compatible sentence shapes contribute exactly 250,000 combinations
 * each. Signature lines are weighted more heavily as a family, so Wonder has
 * a recognisable voice rather than exposing the combinatorics too loudly.
 */
export const PATTERNS: readonly Pattern[] = [
  { id: "signature", weight: 5, parts: [SIGNATURE] },
  { id: "thought", weight: 3, parts: [THOUGHT, " we should ", ACTION, " ", TARGET, " ", TIMING, "."] },
  { id: "offer", weight: 3, parts: [OFFER, " I can ", ACTION, " ", TARGET, " ", TIMING, "."] },
  { id: "question", weight: 2, parts: [QUESTION, " we ", ACTION, " ", TARGET, " ", TIMING, "?"] },
  { id: "plan", weight: 3, parts: [PLAN, " let's ", ACTION, " ", TARGET, " ", TIMING, "."] },
];
