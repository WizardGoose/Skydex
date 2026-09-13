/**
 * The mark's face, as a table and a pure function.
 *
 * The expressions are GLYPH SWAPS. ADLaM Display is single weight and has no
 * variation axis, so "manipulate the font" cannot mean interpolating one; what
 * it means here is changing which characters are set. The mark is a kaomoji
 * that happens to be a logo:
 *
 *   idle       W.W
 *   blink      u.u
 *   alert      O.O
 *   thinking   >.>  and  <.<  alternating
 *   satisfied  ^.^
 *
 * The two W's are the eyes and the full stop is the mouth. The mouth never
 * changes glyph in any state, which is the whole reason the face reads as a
 * face rather than as three characters taking turns.
 *
 * WHY THIS FILE IS SEPARATE FROM THE COMPONENT
 * --------------------------------------------
 * Two things here are worth being able to test without a DOM: which glyph a
 * given combination of states resolves to, and whether the reserved width is
 * actually wide enough for every glyph that can appear in it. Both are plain
 * data and a plain function, so they live away from React and the page imports
 * them.
 */

/**
 * Every glyph an eye is allowed to be.
 *
 * `w` is the sleeping eye and it is the one glyph here that is a CASE change
 * rather than a different character. That is the owner's spec written literally:
 * `w.w` asleep, `W.W` awake. A lowercase w is the same letterform at less
 * height, which is exactly what the pose model already expresses as `squash`,
 * so the sleeping mark is the resting mark with the air let out of it rather
 * than a second drawing of the same logo.
 */
export type EyeGlyph = "W" | "w" | "u" | "O" | ">" | "<" | "^";

/** The mouth at rest, which is a constant in every state but one. */
export const MOUTH = ".";

/**
 * The petted mouth: an `o` sized down to the full stop's own size, so it reads
 * as a HOLLOW DOT rather than as a third letter.
 *
 * This is the one place the long-standing "the mouth never changes glyph" rule
 * is broken, and it is broken on the owner's instruction. The rule existed to
 * stop the mark reading as three characters taking turns, and the reason this
 * particular break does not do that is size: the o is drawn at the dot's
 * footprint, on the dot's baseline, with the dot's own weight. Nothing moves
 * and nothing grows. The mouth simply opens.
 */
export const MOUTH_OPEN = "o";

/**
 * Per-glyph metrics, in ems, measured out of the bundled subset.
 *
 * Measured rather than guessed: these came from `canvas.measureText` at 1000px
 * against `"ADLaM Display"` as loaded by the real page, then divided by 1000.
 * `advance` is the glyph's advance width. `centre` is the midpoint of its ink
 * box above the baseline, which is what has to be lined up between states, and
 * is derived from the reported ascent and descent as `(ascent - descent) / 2`.
 *
 * They are constants and not measured at runtime. A face that measured itself
 * on mount would be doing font work on the critical path of the front door to
 * answer a question whose answer cannot change: the font is bundled, subsetted
 * and versioned in this repository, so if it is ever replaced these numbers are
 * re-measured in the same breath.
 *
 *   glyph  advance   ink ascent   ink descent   centre
 *   W      1.0151    0.7188        0.0000       0.3594
 *   u      0.6157    0.5313        0.0156       0.2578
 *   O      0.7642    0.7188        0.0156       0.3516
 *   ^      0.7065    0.7188       -0.2969       0.5078
 *   >      0.6904    0.5469       -0.0313       0.2891
 *   <      0.6904    0.5469       -0.0313       0.2891
 *
 * A negative ink descent means the glyph's lowest ink sits above the baseline,
 * which is why the caret needs the largest correction of the set.
 */
export const GLYPH_METRICS: Record<EyeGlyph, { advance: number; centre: number }> = {
  W: { advance: 1.0151, centre: 0.3594 },
  /* Measured the same way as the rest, from the same bundled subset. The
     lowercase w is narrower and shorter than the capital, and its ink centre
     sits lower, which is why it needs the second largest nudge in the table. */
  w: { advance: 0.7842, centre: 0.2578 },
  u: { advance: 0.6157, centre: 0.2578 },
  O: { advance: 0.7642, centre: 0.3516 },
  ">": { advance: 0.6904, centre: 0.2891 },
  "<": { advance: 0.6904, centre: 0.2891 },
  "^": { advance: 0.7065, centre: 0.5078 },
};

export const EYE_GLYPHS = Object.keys(GLYPH_METRICS) as EyeGlyph[];

/** The glyph the idle mark is set in, and the one every other state returns to. */
export const REST: EyeGlyph = "W";

/**
 * How wide each eye's box is held, in ems.
 *
 * The widest glyph in the set is `W` at 1.0151em, and no glyph in the set has
 * ink outside its own advance box, so reserving the widest advance and
 * centring inside it is sufficient for every state. Rounded up rather than
 * down, because rounding down would clip the state the mark spends most of its
 * life in.
 *
 * The reservation is per eye rather than across the whole mark, which is the
 * stronger version of the same idea: with each eye held at a fixed width the
 * mouth cannot move at all, no matter what the eyes do. Reserving only the
 * total width would keep the mark's outer edges still while letting the dot
 * slide about inside it.
 */
export const EYE_WIDTH_EM = 1.016;

/**
 * How far a glyph is nudged so its ink sits where the resting glyph's ink sits.
 *
 * The value is a CSS `translateY`, so POSITIVE IS DOWN, while `centre` is
 * measured UP from the baseline. The two axes point opposite ways and that is
 * the whole reason this is a named function with a stated sign convention
 * rather than a subtraction written inline: the first version of it had the
 * sign inverted, which pushed the already-low `u` further down instead of
 * lifting it, and the only thing that caught it was watching a blink happen.
 *
 * So: a glyph whose ink centre sits BELOW the resting glyph's needs to move UP,
 * which is a negative translate. `glyph.centre - REST.centre` gives exactly
 * that, and a test pins the direction for every glyph in the set.
 *
 * This is the correction the brief asked to be verified rather than assumed,
 * and it is not optional: at the largest type size the caret's ink centre sits
 * 20px above the W's, so an uncorrected `^.^` visibly leaps. The mouth is the
 * anchor of a kaomoji, and eyes that jump around it stop reading as one face.
 *
 * The values are precomputed here and never measured live.
 */
export const nudgeEm = (glyph: EyeGlyph): number =>
  Number((GLYPH_METRICS[glyph].centre - GLYPH_METRICS[REST].centre).toFixed(4));

export const NUDGE_EM: Record<EyeGlyph, number> = {
  W: nudgeEm("W"),
  w: nudgeEm("w"),
  u: nudgeEm("u"),
  O: nudgeEm("O"),
  ">": nudgeEm(">"),
  "<": nudgeEm("<"),
  "^": nudgeEm("^"),
};

/* ------------------------------------------------------------------------ *
 * The state machine
 * ------------------------------------------------------------------------ */

export interface FaceState {
  /** `prefers-reduced-motion`. Wins over everything: a swap is motion. */
  still: boolean;
  /** A search just settled. Transient. */
  satisfied: boolean;
  /** A query is in flight. */
  thinking: boolean;
  /** Which way the scan is looking. Positive looks right. */
  scan: number;
  /** The blink timer is holding the eyes shut. Transient. */
  blink: boolean;
  /** The search field has focus. */
  alert: boolean;
  /**
   * The visitor is away from Wonder and his nearby interaction surface. The
   * mark drops to `w.w` and grows a zzz after the local doze delay.
   *
   * This is deliberately local presence, not generic page activity. Reading or
   * moving elsewhere does not keep Wonder awake.
   */
  sleeping: boolean;
  /**
   * The pointer is to one side inside Wonder's attentive region: positive
   * right, negative left, zero when it is centred or away. The face resolves
   * the glance while the rig supplies the small follow-through.
   */
  glance: number;
  /**
   * The visitor is petting the mark. Transient, and the only state a person
   * causes ON THE MARK ITSELF rather than somewhere else on the page.
   */
  petted: boolean;
  /**
   * Mid-yawn. Fires occasionally on waking and nothing else triggers it.
   *
   * It outranks everything except reduced motion and petting, which is unusual
   * for a decorative state and is the honest model: you cannot stop a yawn to
   * answer a search result. Interrupting it would also look like a glitch,
   * because a yawn is a long shape and cutting one at 200ms reads as a dropped
   * frame rather than as a face changing its mind.
   */
  yawning: boolean;
}

/**
 * Switches the owner asked to be able to compare rather than have decided for
 * him. They are options rather than constants because the answer is a taste
 * call and the lab exists to make that call side by side.
 */
export interface FaceOptions {
  /**
   * Whether focus opens the eyes wide.
   *
   * The mark used to answer focus with `O.O`, which was correct when `W.W` was
   * the resting face and focus needed to be visibly different from it. With a
   * sleeping face in the system that difference is already carried: the mark is
   * `w.w` until you engage and `W.W` once you do, so waking IS the reaction and
   * `O.O` becomes a second, louder one stacked on top.
   *
   * Default `false`, which is the owner's spec read literally ("W.W when
   * attentive"). Set it true to get the old startle back.
   */
  wideEyedFocus?: boolean;
}

/**
 * What a resolved glyph READS as, which is not always its own name.
 *
 * `u` is the blink, and it is drawn as the lowercase w now: the owner replaced
 * the old circle-and-accent blink with the sleeping shape. The glyph keeps the
 * name `u` internally because the blink and the nap are genuinely different
 * STATES - they arrive at different speeds and mean different things - but they
 * are the same drawing, so anything showing a person what the mark says has to
 * show them a `w`.
 */
const READS_AS: Record<EyeGlyph, string> = {
  W: "W",
  w: "w",
  u: "w",
  O: "O",
  ">": ">",
  "<": "<",
  "^": "^",
};

/**
 * Which glyph the eyes are set in, given everything at once.
 *
 * The order is a priority, and the reasoning for it is that the transient,
 * meaningful states have to beat the ambient ones or they never get seen. A
 * result landing outranks a query in flight because it is the end of that
 * query. A blink outranks focus, because a face with its eyes shut is blinking
 * whatever else it is doing, and `O.O` resumes the moment it opens.
 *
 * A blink is suppressed while thinking or satisfied, and that is a real
 * decision rather than an accident of ordering: those two states are short,
 * busy and already saying something, and a blink cutting into a scan reads as
 * a dropped frame rather than as a face.
 *
 * `still` short-circuits the lot. Under reduced motion the mark is `W.W` and
 * there is nothing to switch off, because the timers that set the rest of these
 * flags are never started.
 */
export const resolveEye = (s: FaceState, opts: FaceOptions = {}): EyeGlyph => {
  if (s.still) return REST;
  /* Petting does not change the EYES. `WoW` is a W, a hollow o and a W: the
     mouth opens, the cheeks colour and the underscores arrive, and the two
     letters stay exactly the letters they were. That is what keeps it reading
     as the wordmark being delighted rather than as a fourth face. */
  if (s.petted) return REST;
  /* A yawn shuts the eyes, and it does so with its own pose rather than by
     borrowing the squint: `pose.ts` reads `yawning` directly. `^` here is the
     nearest honest GLYPH - eyes closed, mouth open - and it keeps the metrics
     table exhaustive without inventing a character the font has no opinion
     about. */
  if (s.yawning) return "^";
  if (s.satisfied) return "^";
  if (s.thinking) return s.scan >= 0 ? ">" : "<";
  if (s.blink) return "u";
  if (s.alert) return opts.wideEyedFocus ? "O" : REST;
  /* Below alert on purpose: eyes darting after the pointer while the player
     is typing in the field would be distraction, not curiosity. */
  if (s.glance > 0) return ">";
  if (s.glance < 0) return "<";
  /* Last, because sleep is what is left when nothing else is happening. It sits
     BELOW blink deliberately: the ordering above is documented and load
     bearing, and a sleeping face is stopped from blinking at the timer instead,
     the same way thinking and satisfied already are. Encoding "asleep does not
     blink" here would have meant reversing a rule that exists for its own
     reasons. */
  if (s.sleeping) return "w";
  return REST;
};

/**
 * The whole mark as a string: what a person would type to write what they are
 * looking at. Used by the tests and by the lab's readout.
 *
 * Two states make this more than `eye + "." + eye`:
 *   a blink reads `w.w`, because it is drawn as the lowercase w;
 *   petting reads `WoW`, because the mouth opens into a hollow dot;
 *   a yawn reads `^o^`, eyes screwed shut around the same open mouth.
 */
export const faceString = (s: FaceState, opts: FaceOptions = {}): string => {
  const eye = READS_AS[resolveEye(s, opts)];
  const mouth = (s.petted || s.yawning) && !s.still ? MOUTH_OPEN : MOUTH;
  return eye + mouth + eye;
};

/* ------------------------------------------------------------------------ *
 * Timings
 * ------------------------------------------------------------------------ */

/**
 * Every duration the face uses, in milliseconds, in one place.
 *
 * The blink gap is a range and is redrawn every time, because CSS cannot be
 * irregular and a blink on a fixed interval stops reading as a blink within
 * about three repetitions. Everything else is fixed.
 */
export const TIMING = {
  /** Shortest and longest gap between blinks. */
  blinkGapMin: 4000,
  blinkGapMax: 11000,
  /** How long the eyes stay shut. Short: a hard cut needs less time than a squash. */
  blinkHold: 120,
  /**
   * The whole blink, end to end, drawn fresh every time (owner: "make the blink
   * randomly range from 250ms 350ms").
   *
   * The three phases below - close, hold, open - keep their RATIO to each other
   * and are scaled together to land on a total in this range. Scaling them
   * together rather than randomising each one is what keeps a blink a blink: the
   * open is always about twice the close, so the eye always snaps shut and eases
   * back up, whether that particular blink took 250ms or 350ms.
   *
   * The old fixed total was 276ms, which sits inside this range, so the average
   * blink is barely changed. What changes is that no two are identical, which is
   * the same reason the GAP between blinks was already random.
   */
  blinkTotalMin: 250,
  blinkTotalMax: 350,
  /** How long each side of a scan is held before it flips. */
  scanFlip: 450,
  /** How long `^.^` is held after a search settles. */
  satisfiedHold: 450,
  /** Half the legacy geometry-only breath cycle retained for pure pose tools. */
  breathHalf: 3400,

  /* ---- sleep ---------------------------------------------------------- */

  /**
   * How long after the visitor leaves the search field before the mark nods off.
   *
   * The trigger CHANGED on the owner's instruction: "make it sleep unless
   * someone is in the field, or their mouse is like, ontop or around the
   * field". It was watching the whole document for any sign of life, which
   * meant the mark stayed awake while you read an unrelated corner of the page,
   * and 22 seconds was the right number for that rule.
   *
   * With the rule this tight, 22s would mean the sleeping state was almost
   * never seen: you move the mouse off the field and then have to not come back
   * for the better part of half a minute. A little over 3 seconds is the pause after which
   * "they have gone to do something else" is a fair reading, and it makes sleep
   * the state the mark is usually IN rather than a rare event, which is what
   * "sleep unless" asks for.
   */
  sleepAfter: 3200,
  /** How long the drop into sleep takes. Slow: nodding off is not a snap. */
  sleepIn: 900,
  /** How long waking takes. Faster than falling asleep, because being woken is. */
  sleepOut: 260,
  /** One zzz's whole life, from appearing to fading out at the top of its drift. */
  zzzRise: 2600,
  /** Gap between one zzz setting off and the next. */
  zzzGap: 1150,

  /* ---- petting -------------------------------------------------------- */

  /**
   * How long the petted face is held after the last stroke.
   *
   * Long enough to be enjoyed, short enough that the mark does not sit there
   * blushing at an empty room. It is refreshed by every further stroke, so
   * continuous petting holds the state open indefinitely and this is really the
   * RELEASE time rather than a duration.
   */
  petHold: 1400,
  /** How long the blush takes to arrive, and to leave. Arriving is quicker. */
  petIn: 220,
  petOut: 520,
} as const;

/**
 * How much pointer travel across the mark counts as a pet, in CSS pixels.
 *
 * Petting is a STROKE, not a hover, and that distinction is the whole design of
 * this interaction. A hover trigger fires when the cursor merely crosses the
 * mark on its way to the search field, so the mark would blush at people who
 * were not touching it, and the state would mean nothing. Requiring
 * accumulated movement means the visitor has to actually rub back and forth
 * over it, which is what petting is.
 *
 * 120px is roughly two passes across the mark at its smallest rendered size, so
 * the gesture is discoverable by accident but never triggered by accident.
 */
export const PET_TRAVEL_PX = 120;

/**
 * How far outside the search field's own box still counts as "at the field",
 * in CSS pixels.
 *
 * The owner asked for this to be tight: "very tight dimensions, nothing too
 * loose". 18px is about one finger width past the edge of the control. It is
 * enough that the mark does not flicker awake and asleep while you are aiming
 * at the field, and small enough that a pointer merely passing above the field
 * on its way to the nav does not wake it.
 *
 * Applied as a uniform inset around the field's rectangle rather than as a
 * radius from its centre, because the field is a long pill and a radius would
 * make its ends far more sensitive than its middle.
 */
export const WAKE_PADDING_PX = 18;

/**
 * Wonder is a much smaller target than the search field, so its attentive
 * region needs a little more room than the field's one-finger inset. This is
 * still local to the character: at the largest mark size it reaches roughly
 * half a mark-width past the visible strokes, not across the page.
 */
export const MARK_WAKE_PADDING_PX = 54;

/**
 * Whether a pointer at `(px, py)` counts as being at the field.
 *
 * Pure, and takes a plain rectangle rather than an element, so the rule can be
 * tested at its edges without a DOM or a layout. `null` for the rectangle means
 * the field is not on the page at all, which is not the same as the pointer
 * being far away: on a page with no search field there is nothing to be near,
 * and the mark should be free to sleep.
 */
export const nearField = (
  rect: { left: number; top: number; right: number; bottom: number } | null,
  px: number,
  py: number,
  padding = WAKE_PADDING_PX
): boolean =>
  rect !== null &&
  px >= rect.left - padding &&
  px <= rect.right + padding &&
  py >= rect.top - padding &&
  py <= rect.bottom + padding;

/**
 * How long a stroke's accumulated travel is remembered, in milliseconds.
 *
 * Without a window the accumulator is a lifetime odometer: a visitor who
 * crossed the mark forty times over ten minutes would eventually trip it while
 * doing nothing of the kind. The travel decays to nothing over this long, so
 * only movement that is genuinely CONTINUOUS adds up.
 */
export const PET_WINDOW_MS = 900;

/**
 * The pet accumulator, as a pure function so it can be tested without a pointer.
 *
 * Returns the new travel total given the previous total, how long ago the last
 * move was, and how far this move went. The decay is linear in elapsed time
 * rather than exponential because linear is what a person's sense of "I am
 * still stroking this" actually behaves like, and because a half-life is a
 * parameter nobody could tune by feel.
 */
export const petTravel = (prev: number, elapsedMs: number, distancePx: number): number => {
  const decayed = Math.max(0, prev - (elapsedMs / PET_WINDOW_MS) * PET_TRAVEL_PX);
  return decayed + Math.max(0, distancePx);
};

/** A blink gap, drawn from the range. `rand` is a number in [0, 1). */
export const blinkGap = (rand: number): number =>
  TIMING.blinkGapMin + rand * (TIMING.blinkGapMax - TIMING.blinkGapMin);

/** How long one whole blink takes, drawn from the range. `rand` is in [0, 1). */
export const blinkDuration = (rand: number): number =>
  TIMING.blinkTotalMin + rand * (TIMING.blinkTotalMax - TIMING.blinkTotalMin);

/* ------------------------------------------------------------------------ *
 * The yawn
 * ------------------------------------------------------------------------ */

/**
 * The chance that waking up produces a yawn, per wake.
 *
 * A yawn on every wake is a tic, and this mark wakes every time you come back
 * to the search field. At one in five it happens often enough to be found and
 * rarely enough to still be a small event when it does.
 */
export const YAWN_CHANCE = 0.2;

/** How long after waking the yawn starts. Long enough to read as a consequence. */
export const YAWN_DELAY_MS = 260;

/**
 * The yawn's beats: the slow inhale open, the held stretch, and a close that
 * carries an exhale inside it. The close is the longest beat because a real
 * yawn does not shut, it collapses: past rest, through a slump, and back up.
 * The slump itself lives in `yawnStretch` (pose.ts); this file only says how
 * long each beat has.
 */
export const YAWN_OPEN_MS = 560;
export const YAWN_HOLD_MS = 420;
export const YAWN_CLOSE_MS = 640;

/** The whole thing, for the scheduler and for the tests. */
export const YAWN_TOTAL_MS = YAWN_OPEN_MS + YAWN_HOLD_MS + YAWN_CLOSE_MS;

/** Whether a given wake yawns. `rand` is a number in [0, 1). */
export const shouldYawn = (rand: number): boolean => rand < YAWN_CHANCE;

