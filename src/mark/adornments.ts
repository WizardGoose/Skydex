/**
 * The three things the mark grows that are not letters.
 *
 * `pose.ts` owns the letterforms and the mouth, and it is already the largest
 * file in the module. These are decoration: a zzz that floats off a sleeping
 * face, blush on the cheeks of a petted one, and the underscores beneath the
 * W's that arrive with it. None of them are part of the wordmark, none of them
 * exist in more than one state, and all of them are pure geometry over a clock.
 *
 * Everything here is a pure function of elapsed time and a progress value, for
 * the same reason the poses are: it can be tested without a DOM, and the lab
 * page can draw a frozen frame of it at any progress without running a timer.
 *
 * COORDINATES
 * -----------
 * The same canvas as `pose.ts`: 35 x 12, y down, baseline near the bottom edge.
 * Both the zzz and the underscores deliberately sit OUTSIDE that box - the zzz
 * above it, the underscores below the baseline, which is itself within a
 * stroke's width of the bottom. That is only safe because the `<svg>` carries
 * `overflow-visible`, which it already did for the breath. If that class is
 * ever removed, these are what get clipped first.
 */

import { TIMING } from "./face";
import { BASELINE, EYE_CX_L, EYE_CX_R, EYE_TOP, EYE_W, STROKE } from "./pose";

/* ------------------------------------------------------------------------ *
 * Blush
 * ------------------------------------------------------------------------ */

/**
 * Blush candidates, because the owner asked to compare rather than be given one.
 *
 * The constraint that rules out most pinks: this mark sits on a site whose
 * colours are DATA. `rarity-mythic` is #fa80d5 and `rarity-special` is #ff6b6b,
 * and a blush that lands between them would read as a rarity tier leaking onto
 * the logo. Each of these is picked to sit clear of both while still being
 * unmistakably a blush.
 *
 *   rose    the default. Warm, low chroma, closest to actual skin flush.
 *   coral   warmer and more orange. Reads younger and more cartoonish.
 *   candy   the deepest and pinkest. The most "kawaii" of the set.
 *
 * MEASURED, not eyeballed. A test asserts every candidate is more than 40 units
 * of RGB distance from both tiers, and it earned its keep immediately: `candy`
 * started at #ff7ac0 and measured 22.4 from mythic, which is the exact failure
 * the rule exists to prevent - a blush that IS the mythic pink, on a site where
 * a mythic pink means something. It moved to #f4568f, which measures 81.9 from
 * mythic and 43.1 from special. The distances for the shipped set:
 *
 *            vs mythic   vs special
 *   rose        52.6        66.6
 *   coral      138.6        51.3
 *   candy       81.9        43.1
 *
 * These are expression colours and they belong to nothing else on the site.
 * They are NOT an accent, they are NOT a state colour, and nothing outside this
 * module may reach for them - the site has one accent and this is not it.
 */
export const BLUSH = {
  rose: "#ff8fa3",
  coral: "#ff9b7d",
  candy: "#f4568f",
} as const;

export type BlushName = keyof typeof BLUSH;

export const BLUSH_DEFAULT: BlushName = "rose";

/**
 * Where the cheeks are.
 *
 * Under and slightly outboard of each eye, which is where a cheek is on a face
 * whose eyes are two W's. Outboard rather than inboard matters: placed toward
 * the middle they crowd the mouth and the three marks read as a cluster instead
 * of as a face.
 */
export const BLUSH_DX = EYE_W * 0.22;
export const BLUSH_CY = BASELINE - 1.9;
export const BLUSH_RX = 1.55;
export const BLUSH_RY = 0.72;

export const blushCentres = (): [number, number][] => [
  [EYE_CX_L - BLUSH_DX, BLUSH_CY],
  [EYE_CX_R + BLUSH_DX, BLUSH_CY],
];

/**
 * Peak opacity of a blush patch.
 *
 * Low, and it has to be. These sit UNDER the letters in paint order, over
 * whatever the page ground is, and a blush that reads as a solid shape stops
 * being a flush and starts being two pills stuck to the logo. 0.42 is where it
 * still reads as colour in the cheeks at the smallest rendered size without
 * ever resolving into an object with an edge.
 */
export const BLUSH_PEAK_OPACITY = 0.42;

/* ------------------------------------------------------------------------ *
 * Underscores
 * ------------------------------------------------------------------------ */

/**
 * The two rules that arrive under the W's when the mark is petted.
 *
 * The owner asked for "underscoring of the W's ... blush coloured". They are
 * drawn as their own strokes rather than as a `text-decoration`, because the
 * letters are paths and there is no text to decorate.
 *
 * They sit BELOW the baseline by a little over one stroke width. Sitting ON the
 * baseline would weld them to the letters' feet and read as the mark standing
 * on a shelf; a clear gap reads as an underline drawn beneath it.
 *
 * Each rule is slightly narrower than its letter and grows from the centre
 * outward, which is what makes them look drawn rather than switched on.
 */
export const UNDERSCORE_GAP = STROKE * 1.15;
export const UNDERSCORE_Y = BASELINE + UNDERSCORE_GAP;
export const UNDERSCORE_W = EYE_W * 0.92;
export const UNDERSCORE_STROKE = STROKE * 0.62;

/**
 * One rule's end points at a given progress, growing from its own centre.
 *
 * `t` is 0 to 1. At 0 the rule is a zero-length line at the letter's centre,
 * which draws nothing; at 1 it is the full width. Returned rather than
 * animated with a dash array because a dash offset animating from a length
 * needs the length measured first, and this is two subtractions.
 */
export const underscoreSpan = (eyeCx: number, t: number): { x1: number; x2: number } => {
  const half = (UNDERSCORE_W / 2) * Math.min(1, Math.max(0, t));
  return { x1: eyeCx - half, x2: eyeCx + half };
};

export const underscoreSpans = (t: number) => [underscoreSpan(EYE_CX_L, t), underscoreSpan(EYE_CX_R, t)];

/* ------------------------------------------------------------------------ *
 * The zzz
 * ------------------------------------------------------------------------ */

/** How many z's are in flight at once. */
export const ZZZ_COUNT = 3;

/** Full glyph travel, including font extents, stays inside its own SVG viewport. */
export const ZZZ_VIEWPORT = { x: 0, y: -8, width: 40, height: 20 } as const;

/** Where the first z leaves the face: just off the right eye's outer shoulder. */
export const ZZZ_X = EYE_CX_R + EYE_W * 0.62;
export const ZZZ_Y = EYE_TOP + 0.6;

/** How far one z travels over its life. Up, and drifting outward. */
export const ZZZ_RISE = 5.4;
export const ZZZ_DRIFT = 2.1;

/** The z's own size, at birth and at death. It grows as it fades. */
export const ZZZ_SCALE_MIN = 0.5;
export const ZZZ_SCALE_MAX = 1.15;

/** Peak opacity. Never 1: a fully opaque z competes with the letters. */
export const ZZZ_PEAK_OPACITY = 0.72;

export interface Zzz {
  visible: boolean;
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

/**
 * Where one z is at a moment.
 *
 * The three z's share one clock and are separated by index alone, so they can
 * never drift apart or bunch up the way three independent timers would.
 *
 * The opacity envelope is a ramp in, a hold, and a longer fade out. That
 * asymmetry is what makes it read as something drifting away rather than
 * blinking: things that recede spend most of their visible life getting
 * fainter.
 *
 * `visible` is returned rather than leaving the caller to test opacity, because
 * a z past the end of its life has a MEANINGLESS position, not merely a
 * transparent one, and a renderer that trusted the coordinates would park three
 * invisible glyphs at the top of their arc.
 */
export const zzzAt = (elapsedMs: number, index: number): Zzz => {
  const period = TIMING.zzzGap * ZZZ_COUNT;
  const raw = elapsedMs - index * TIMING.zzzGap;
  const local = ((raw % period) + period) % period;
  const t = local / TIMING.zzzRise;

  if (t >= 1) return { visible: false, x: ZZZ_X, y: ZZZ_Y, scale: ZZZ_SCALE_MIN, opacity: 0 };

  /* Ease the travel so the z slows as it rises, the way smoke does. */
  const travel = 1 - Math.pow(1 - t, 2);

  const fadeIn = Math.min(1, t / 0.18);
  const fadeOut = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;

  return {
    visible: true,
    x: ZZZ_X + ZZZ_DRIFT * travel,
    y: ZZZ_Y - ZZZ_RISE * travel,
    scale: ZZZ_SCALE_MIN + (ZZZ_SCALE_MAX - ZZZ_SCALE_MIN) * travel,
    opacity: ZZZ_PEAK_OPACITY * Math.max(0, Math.min(fadeIn, fadeOut)),
  };
};
