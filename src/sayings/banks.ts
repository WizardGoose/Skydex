/**
 * Wonder's vocabulary.
 *
 * These banks are sentence parts, not interchangeable words. Every entry in a
 * bank has the same grammatical job, so the templates can combine them
 * freely without repairing articles, verb agreement, spacing, or punctuation
 * afterwards. That is what keeps the large combination count from turning
 * Wonder into a word-salad generator.
 */

/** Leads naturally into "we should ...". */
export const THOUGHT_OPENERS: readonly string[] = [
  "I think",
  "I suspect",
  "I reckon",
  "Maybe",
  "Perhaps",
  "My guess is",
  "I have a hunch",
  "It seems",
  "Something tells me",
  "Just maybe",
];

/** Leads naturally into "I can ...". Punctuation belongs to the opener. */
export const OFFER_OPENERS: readonly string[] = [
  "If you like,",
  "When you are ready,",
  "If that helps,",
  "Whenever you like,",
  "If we need it,",
  "With one good search,",
  "Before I nod off,",
  "If you point the way,",
  "If we start here,",
  "While I am awake,",
];

/** Modal question leads. Every one takes "we" and a base-form verb. */
export const QUESTION_OPENERS: readonly string[] = [
  "Should",
  "Could",
  "Can",
  "Shall",
  "Might",
  "Would",
  "May",
  "Why don't",
  "What if",
  "How about",
];

/** Leads naturally into "let's ...". */
export const PLAN_OPENERS: readonly string[] = [
  "All right,",
  "Good,",
  "Excellent,",
  "Interesting,",
  "In that case,",
  "As a start,",
  "For the moment,",
  "One thought:",
  "New plan:",
  "I have an idea:",
];

/** Base-form actions that make sense with every target below. */
export const ACTIONS: readonly string[] = [
  "find",
  "check",
  "inspect",
  "revisit",
  "review",
  "investigate",
  "explore",
  "uncover",
  "identify",
  "examine",
  "look into",
  "search for",
  "learn about",
  "make sense of",
  "figure out",
  "double-check",
  "consider",
  "study",
  "understand",
  "verify",
];

const TARGET_DESCRIPTORS: readonly string[] = [
  "missing",
  "useful",
  "hidden",
  "next",
  "right",
  "odd",
  "final",
  "tricky",
  "important",
  "overlooked",
];

const TARGET_NOUNS: readonly string[] = ["clue", "detail", "step", "answer", "option"];

/** Fifty compact noun phrases whose adjective and noun always agree. */
export const TARGETS: readonly string[] = TARGET_DESCRIPTORS.flatMap((descriptor) =>
  TARGET_NOUNS.map((noun) => `the ${descriptor} ${noun}`)
);

/** Adverbials that can close every authored sentence shape. */
export const TIMINGS: readonly string[] = [
  "first",
  "today",
  "this time",
  "right now",
  "soon",
  "together",
  "from here",
  "in one search",
  "with one clue",
  "without guessing",
  "without a detour",
  "before we wander",
  "before it gets costly",
  "before they notice",
  "before I nap",
  "when you are ready",
  "while we are here",
  "for a change",
  "properly",
  "carefully",
  "once more",
  "after one look",
  "as a warm-up",
  "eventually",
  "before the next detour",
];

/**
 * Lines with enough character to recur as Wonder's recognisable voice.
 * Generated lines provide scale; these keep that scale anchored to the small,
 * curious, occasionally sleepy companion already expressed by his motion.
 */
export const SIGNATURE_LINES: readonly string[] = [
  "I was not napping. I was indexing with my eyes closed.",
  "If we call it planning, the hoarding sounds responsible.",
  "The minions are probably doing something useful.",
  "I am thinking. It just looks a little like napping.",
  "Tell me the mystery. I like mysteries.",
  "One good search can save us a very long detour.",
  "Somewhere, a chest is becoming a storage problem.",
  "I wonder what we forgot to collect this time.",
  "We can be sensible for at least one search.",
  "I have been waiting here very patiently.",
  "The toolkit is ready whenever you are.",
  "I suspect we are going to need more storage.",
  "Let's find the useful bit before we get distracted.",
  "Today feels like a good day to find something useful.",
  "I am ready for the next oddly specific question.",
  "There is always one more ingredient, isn't there?",
  "I can help. I was standing here anyway.",
  "The shortest route is probably hiding behind one clue.",
  "We should check the numbers before trusting the numbers.",
  "I have a feeling this begins with one small search.",
];

/** Long dash detection is kept explicit so generated UI copy follows the project voice. */
const DASH_CODES = new Set([0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212]);

export const hasLongDash = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) if (DASH_CODES.has(s.charCodeAt(i))) return true;
  return false;
};
