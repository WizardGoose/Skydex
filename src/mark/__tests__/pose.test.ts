import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EYE_GLYPHS, REST, TIMING } from "../face";
import type { EyeGlyph } from "../face";
import {
  ADLAM_O_COUNTER_RATIO,
  BASELINE,
  BLINK_CLOSE_MS,
  BLINK_OPEN_MS,
  BLINK_SHUT_MS,
  CANVAS_H,
  CANVAS_W,
  CIRCLE_CY,
  CIRCLE_R,
  EYE_BOT,
  EYE_CX_L,
  EYE_CX_R,
  EYE_TOP,
  EYE_W,
  FOOT,
  MARK_SPEC,
  MOUTH_CX,
  MOUTH_CY,
  MOUTH_H,
  MOUTH_W,
  MORPH_SAMPLES,
  MOUTH_POSES,
  POSES,
  SLOSH_AMP_A,
  SLOSH_AMP_B,
  SPINE,
  STROKE,
  TRANSITIONS,
  accentMix,
  breathScale,
  circleAt,
  ease,
  eyePath,
  eyePoints,
  eyePosesFor,
  facePoseFor,
  inkBounds,
  lerpMouth,
  lerpPose,
  mouthGeometry,
  pathFor,
  sloshAt,
  spinePoints,
  transitionNameFor,
} from "../pose";
import type { PoseName } from "../pose";

const ALL: PoseName[] = Object.keys(POSES) as PoseName[];
/** Every pose that is still the W. The blink alone morphs to another glyph. */
const LETTERFORMS: PoseName[] = ALL.filter((n) => POSES[n].round === 0);
/**
 * Every pose an eye can actually be put into, via ANY route.
 *
 * Petting and yawning are the third and fourth routes, and both have to be
 * swept here rather than assumed: neither `pet` nor `yawn` is an `EyeGlyph`, so
 * a sweep over glyphs alone can never reach them, and the "no pose is dead
 * weight" test below would have quietly stopped covering a pose the moment one
 * was added behind a flag instead of a glyph.
 */
const REACHABLE: PoseName[] = [
  ...new Set(
    EYE_GLYPHS.flatMap((g) => [
      ...eyePosesFor(g),
      ...eyePosesFor(g, true),
      ...eyePosesFor(g, false, true),
    ])
  ),
];

/* ------------------------------------------------------------------------ *
 * The motion language: scale, never space
 * ------------------------------------------------------------------------ */

describe("nothing translates", () => {
  it("gives a pose no way to express a position at all", () => {
    /* The strongest form of the rule: there is no number anywhere in a pose
       that COULD move a letter. Not a lift, not an x, not a rotation. An
       earlier version had a `lift` channel and a separate gaze translate, and
       that is exactly what got the first attempt rejected. `round` is a SHAPE
       channel, not a position: it says which of two shapes the letter is. */
    for (const name of ALL) {
      expect(Object.keys(POSES[name]).sort()).toEqual(["round", "spread", "squash", "weight"]);
    }
  });

  it("keeps every LETTERFORM's feet welded to the baseline", () => {
    /* This is the anchoring rule, and it is the reason `squash` pivots on
       `FOOT` rather than on the middle. If this fails the letters hover above
       the line the full stop is sitting on, and the mark stops reading as
       type. Checked on the control points, where it is exact.

       The blink is excluded because it is no longer a letterform: it closes
       into a circle CENTRED on the baseline, which is the one shape in the
       mark that deliberately crosses the line. It has its own tests below. */
    expect(FOOT).toBe(1);
    for (const name of LETTERFORMS) {
      for (const cx of [EYE_CX_L, EYE_CX_R]) {
        const pts = spinePoints(POSES[name], cx);
        expect(pts[1][1]).toBeCloseTo(EYE_BOT, 10);
        expect(pts[3][1]).toBeCloseTo(EYE_BOT, 10);
      }
    }
  });

  it("keeps each letter centred in its own slot, in every shape it takes", () => {
    /* `spread` scales about the letter's own centre and the blink's circle is
       centred on that same axis, so nothing ever slides within its slot. */
    for (const name of ALL) {
      for (const cx of [EYE_CX_L, EYE_CX_R]) {
        const xs = eyePoints(POSES[name], cx).map((p) => p[0]);
        expect((Math.min(...xs) + Math.max(...xs)) / 2, `${name} drifted in its slot`).toBeCloseTo(cx, 6);
      }
    }
  });

  it("is always the same letterform, only ever at a different proportion", () => {
    /* The spine is a constant, so the peak must sit at the same FRACTION of
       the letter's height in every pose that is still a letter. That is what
       makes this type deforming rather than shapes swapping. The blink is the
       one sanctioned shape change, and it is a morph to a named glyph rather
       than to an arbitrary blob. */
    for (const name of LETTERFORMS) {
      const pts = spinePoints(POSES[name], EYE_CX_L);
      const foot = pts[1][1];
      const corner = pts[0][1];
      const peak = pts[2][1];
      expect((peak - foot) / (corner - foot)).toBeCloseTo(0.6, 10);
    }
  });

  it("has no gaze table and no rotation left anywhere in the spec", () => {
    const keys = JSON.stringify(MARK_SPEC);
    expect(keys).not.toContain("gaze");
    expect(keys).not.toContain("tilt");
    expect(keys).not.toContain("drift");
    expect(keys).not.toContain("lift");
  });
});

describe("mass is roughly conserved", () => {
  it("spreads whatever it squashes, and narrows whatever it stretches", () => {
    /* This is what makes it read as a volume being deformed rather than a box
       being rescaled. Rest is exempt because it is doing neither.

       There is no exception any more. `winkSwell` was the single documented one
       - a swell is supposed to GAIN volume on both axes - and it went when the
       wink was removed entirely, so no pose in the table gains volume and the
       rule is finally unconditional. */
    for (const name of ALL) {
      const { squash, spread } = POSES[name];
      if (Math.abs(squash - 1) < 1e-9) continue;
      if (squash < 1) expect(spread, `${name} squashes so it must spread`).toBeGreaterThan(1);
      else expect(spread, `${name} stretches so it must narrow`).toBeLessThan(1);
    }
  });

  it("has nothing left that grows on both axes at once", () => {
    /* The inverse of the retired swell test, and worth keeping as an assertion
       rather than deleting: it is what makes the conservation rule above safe
       to state without an exception list.

       The claim is about DIRECTION, not about area. `O` multiplies out to 1.014
       because conservation here is "roughly", as the describe block says, and
       trading 9% of height for 7% of width does not come out exactly even. What
       must never happen again is a pose that gains on both axes together, which
       is what a swell was. */
    for (const name of ALL) {
      const { squash, spread } = POSES[name];
      expect(squash > 1 && spread > 1, `${name} grows on both axes`).toBe(false);
    }
  });

  it("does the same in the idle slosh, every sample", () => {
    for (let t = 0; t < 16000; t += 97) {
      const s = sloshAt(t, 0);
      expect((s.squash - 1) * (s.spread - 1)).toBeLessThanOrEqual(0);
    }
  });

  it("keeps the slosh small enough to be felt and not watched", () => {
    const cap = SLOSH_AMP_A + SLOSH_AMP_B;
    for (let t = 0; t < 16000; t += 61) {
      for (const phase of [0, MARK_SPEC.slosh.eyePhase]) {
        const s = sloshAt(t, phase);
        expect(Math.abs(s.squash - 1)).toBeLessThanOrEqual(cap + 1e-9);
        expect(Math.abs(s.spread - 1)).toBeLessThanOrEqual(cap * MARK_SPEC.slosh.coupling + 1e-9);
      }
    }
  });
});

/* ------------------------------------------------------------------------ *
 * The wordmark: the dot sits on the baseline
 * ------------------------------------------------------------------------ */

describe("it is set like the string W.W", () => {
  it("puts the full stop's FOOT exactly on the baseline", () => {
    /* The correction that mattered most. The first version centred the dot
       between the letters, which read as a floating nose instead of a period. */
    expect(MOUTH_CY + MOUTH_H / 2).toBeCloseTo(BASELINE, 10);
  });

  it("derives the baseline from the drawn ink, not from the control points", () => {
    /* The spine is stroked with round caps, so the letter's optical bottom is
       half a stroke below its valleys. A period aligns to ink. */
    expect(BASELINE).toBeCloseTo(EYE_BOT + STROKE / 2, 10);
    expect(BASELINE).toBeGreaterThan(EYE_BOT);
  });

  it("lands the resting letters' ink on that same line", () => {
    for (const cx of [EYE_CX_L, EYE_CX_R]) {
      expect(inkBounds(POSES.W, cx).maxY).toBeCloseTo(BASELINE, 10);
    }
  });

  it("keeps every other pose's foot on the line to within a hair", () => {
    /* The CONTROL points are exactly on `EYE_BOT` for every pose, which is
       asserted on its own above. What varies here is the drawn round cap,
       which hangs half a stroke below them, so a pose carrying a heavier
       `weight` sits a fraction lower and a lighter one a fraction higher. The
       deviation is bounded by half the stroke times the weight range, which is
       about four hundredths of a canvas unit: under a fifth of a CSS pixel at
       the largest size the mark is ever drawn, and symmetric, which is why
       this tolerance is two sided. */
    const maxDeviation =
      (STROKE / 2) * Math.max(...LETTERFORMS.map((n) => Math.abs(POSES[n].weight - 1)));
    expect(maxDeviation).toBeLessThan(0.05);
    for (const name of LETTERFORMS) {
      const { maxY } = inkBounds(POSES[name], EYE_CX_L);
      expect(maxY).toBeCloseTo(EYE_BOT + (STROKE * POSES[name].weight) / 2, 10);
      expect(Math.abs(maxY - BASELINE), `${name} foot drifted off the baseline`).toBeLessThanOrEqual(
        maxDeviation + 1e-9
      );
    }
  });

  it("sits the full stop exactly halfway between the two letters", () => {
    expect((EYE_CX_L + EYE_CX_R) / 2).toBeCloseTo(MOUTH_CX, 10);
  });

  it("does not let the dot overlap the letters", () => {
    for (const name of ALL) {
      expect(inkBounds(POSES[name], EYE_CX_L).maxX, `${name} reaches the dot`).toBeLessThan(
        MOUTH_CX - MOUTH_H
      );
    }
  });
});

/* ------------------------------------------------------------------------ *
 * The mouth
 * ------------------------------------------------------------------------ */

describe("the mouth is the anchor and does not move", () => {
  it("has exactly two channels, and neither of them can move the dot", () => {
    /* `smile` used to be here, fading in two accent pips either side of the
       dot as the drawn satisfied frames did. It was cut because at vector
       scale they detach and read as ears. See the note on MOUTH_POSES.

       `hollow` was ADDED on the owner's spec: the petted mark is `WoW`, so the
       mouth has to be able to open. This test was "exactly one channel" until
       then, and widening it is the honest change rather than deleting it -
       what the assertion is really protecting is that the mouth cannot MOVE,
       and that is still true of both channels. `scale` pivots on the baseline
       and `hollow` narrows the rect about its own centre; there is still no
       number in a MouthPose that could translate anything. */
    for (const name of ALL) {
      expect(Object.keys(MOUTH_POSES[name]).sort()).toEqual(["hollow", "scale"]);
    }
  });

  it("only opens the mouth for the two states that mean an open mouth", () => {
    /* Petting (`WoW`) and yawning. Everything else is a full stop, and a third
       state quietly gaining a hollow mouth is the kind of drift this catches. */
    const OPENS: PoseName[] = ["pet", "yawn"];
    for (const name of ALL) {
      if (OPENS.includes(name)) expect(MOUTH_POSES[name].hollow, `${name} should open`).toBe(1);
      else expect(MOUTH_POSES[name].hollow, `${name} opened its mouth`).toBe(0);
    }
  });

  it("opens into a circle of exactly the dot's own size", () => {
    /* The owner's spec is "o sized down to . size so its like a hollow .".
       So the open mouth must be a CIRCLE (width equal to height, radius half of
       it) and it must be the dot's height, not a larger o scaled down to look
       like one. Both ends are asserted so neither can drift. */
    const shut = mouthGeometry(0);
    expect(shut.width).toBeCloseTo(MOUTH_W, 10);
    expect(shut.fillOpacity).toBe(1);
    expect(shut.strokeOpacity).toBe(0);

    const open = mouthGeometry(1);
    /* The PATH is inset by one stroke width so the ring's OUTER edge lands on
       the dot's silhouette. Asserting the path width against the dot would be
       asserting that the mouth inflates by half a stroke all round, which is
       precisely what the inset exists to prevent. So the assertion is on the
       outer extent, which is what a person sees. */
    expect(open.width + open.strokeWidth).toBeCloseTo(MOUTH_H, 10);
    expect(open.height).toBeCloseTo(open.width, 10);
    expect(open.rx).toBeCloseTo(open.width / 2, 10);
    expect(open.fillOpacity).toBe(0);
    expect(open.strokeOpacity).toBe(1);
  });

  it("keeps the mouth centred on the dot at every point of the morph", () => {
    /* The one thing that must not happen while the mouth opens is the mouth
       sliding. The rect narrows, so its `x` has to move; the assertion is that
       its CENTRE does not. */
    for (let i = 0; i <= 20; i++) {
      const g = mouthGeometry(i / 20);
      expect(g.x + g.width / 2, `centre drifted at hollow ${i / 20}`).toBeCloseTo(MOUTH_CX, 10);
    }
  });

  it("clamps the morph, because it drives a radius and an opacity", () => {
    /* Unlike a proportion, `hollow` cannot be allowed to overshoot: past 1 the
       corner radius exceeds half the height and the fill opacity goes negative.
       `lerpMouth` clamps, and `mouthGeometry` clamps again at the point of use. */
    expect(lerpMouth(MOUTH_POSES.W, MOUTH_POSES.pet, 1.4).hollow).toBe(1);
    expect(lerpMouth(MOUTH_POSES.pet, MOUTH_POSES.W, 1.4).hollow).toBe(0);
    expect(mouthGeometry(2).rx).toBeCloseTo(mouthGeometry(1).rx, 10);
    expect(mouthGeometry(-1).fillOpacity).toBe(1);
  });

  it("is untouched by a blink", () => {
    expect(MOUTH_POSES.u).toEqual(MOUTH_POSES.W);
  });

  it("never scales far enough to stop reading as the same dot", () => {
    for (const name of ALL) {
      expect(MOUTH_POSES[name].scale).toBeGreaterThan(0.9);
      /* Inclusive at the top: the yawn sits exactly ON the ceiling, which is
         deliberate. It is the widest the mark is ever allowed to open, so
         nothing louder is left for a future state to reach for. */
      expect(MOUTH_POSES[name].scale).toBeLessThanOrEqual(1.15);
    }
  });
});

/* ------------------------------------------------------------------------ *
 * Completeness: the brain cannot resolve to something with no drawing
 * ------------------------------------------------------------------------ */

describe("every glyph the brain can resolve has a drawing", () => {
  it.each(EYE_GLYPHS)("%s resolves both letters to real poses", (glyph) => {
    {
      const [l, r] = eyePosesFor(glyph);
      expect(POSES[l]).toBeDefined();
      expect(POSES[r]).toBeDefined();
      const face = facePoseFor(glyph);
      expect(MOUTH_POSES[face]).toBeDefined();
      expect(MARK_SPEC.sloshScale[face]).toBeDefined();
    }
  });

  it("reaches every pose in the table, so none is dead weight", () => {
    expect(REACHABLE.slice().sort()).toEqual(ALL.slice().sort());
  });

  it("keeps every table the same size, so none can drift apart", () => {
    for (const table of [MOUTH_POSES, MARK_SPEC.sloshScale]) {
      expect(Object.keys(table).sort()).toEqual(ALL.slice().sort());
    }
  });

  it("makes both eyes agree except when the state is genuinely asymmetric", () => {
    for (const glyph of EYE_GLYPHS) {
      const [l, r] = eyePosesFor(glyph);
      if (glyph === ">" || glyph === "<") expect(l).not.toBe(r);
      else expect(l).toBe(r);
    }
    /* Thinking is the ONLY asymmetric state left. The wink used to be the other
       one and was removed on the owner's call, so this is now an exhaustive
       claim rather than a list with an exception. */
  });

  it("mirrors the two scan directions", () => {
    /* `>` and `<` must be each other's reflection, or the pulse limps. */
    const [rl, rr] = eyePosesFor(">" as EyeGlyph);
    const [ll, lr] = eyePosesFor("<" as EyeGlyph);
    expect(rl).toBe(lr);
    expect(rr).toBe(ll);
  });
});

/* ------------------------------------------------------------------------ *
 * Each expression means what frames.ts said it meant
 * ------------------------------------------------------------------------ */

describe("the expressions carry over from the drawn frames", () => {
  it("alert grows taller and tenser", () => {
    expect(POSES.O.squash).toBeGreaterThan(1);
    expect(POSES.O.spread).toBeLessThan(1);
  });

  it("satisfied compresses down into a squint and spreads", () => {
    expect(POSES["^"].squash).toBeLessThan(1);
    expect(POSES["^"].spread).toBeGreaterThan(1);
    /* Still recognisably a letter, not a puddle. */
    expect(POSES["^"].squash).toBeGreaterThan(0.4);
  });

  it("blinks to the lowercase w, not to a circle", () => {
    /* The blink WAS a morph to a circle in the accent. The owner rejected it -
       "seeing it change to an o and blue is too off putting" - and asked for
       `w.w`, the same shape the sleeping face holds.

       So the blink is a letterform again, and these are the two facts that
       follow: it is still the W at a proportion, and it never takes the accent,
       because `accentMix` is driven by `round` and `round` is zero. */
    expect(POSES.u.round).toBe(0);
    expect(accentMix(POSES.u.round)).toBe(0);
    expect(POSES.u).toEqual(POSES.w);
    for (const cx of [EYE_CX_L, EYE_CX_R]) {
      expect(eyePoints(POSES.u, cx)).toHaveLength(SPINE.length);
    }
  });

  it("keeps the blinking letter on the baseline like every other letterform", () => {
    /* The circle was the one shape allowed to cross the line, because it was
       centred ON the baseline and hung half below it. With the blink back to a
       letterform there is no sanctioned overhang left at all. */
    const b = inkBounds(POSES.u, EYE_CX_L);
    expect(b.maxY).toBeCloseTo(EYE_BOT + (STROKE * POSES.u.weight) / 2, 10);
    expect(b.maxY).toBeLessThan(BASELINE + 0.05);
  });

  it("gives that circle ADLaM Display's own ring proportions", () => {
    /* Measured from the self-hosted font: the lowercase o's hole is 41.18% of
       its outer width. Our stroke is fixed by the letterform, so matching that
       ratio is what fixes the radius. */
    const outer = 2 * CIRCLE_R + STROKE;
    const counter = 2 * CIRCLE_R - STROKE;
    expect(counter / outer).toBeCloseTo(ADLAM_O_COUNTER_RATIO, 9);
    expect(counter).toBeGreaterThan(0);
  });

  it("closes to something clearly smaller than the open letter", () => {
    /* A blink has to read as closing. The O's outer diameter is well under the
       open W's height, or the morph reads as a shape swap rather than a shut. */
    const open = inkBounds(POSES.W, EYE_CX_L);
    const outer = 2 * CIRCLE_R + STROKE;
    expect(outer).toBeLessThan((open.maxY - open.minY) * 0.75);
  });

  it("folds the letter inward in mirrored pairs rather than spinning it", () => {
    /* The morph maps the spine's `t` onto the circle so that mirror points on
       the W land on mirror points on the O. Without that the letter appears to
       rotate as it closes. Checked at the four places it is easiest to get
       wrong: the corners meet at the top, the valleys go to the sides, and the
       peak goes to the bottom. */
    const cx = EYE_CX_L;
    const top = circleAt(0, cx);
    const left = circleAt(0.25, cx);
    const bottom = circleAt(0.5, cx);
    const right = circleAt(0.75, cx);
    const wrap = circleAt(1, cx);
    expect(top[0]).toBeCloseTo(cx, 9);
    expect(top[1]).toBeCloseTo(CIRCLE_CY - CIRCLE_R, 9);
    expect(left[0]).toBeCloseTo(cx - CIRCLE_R, 9);
    expect(right[0]).toBeCloseTo(cx + CIRCLE_R, 9);
    expect(bottom[1]).toBeCloseTo(CIRCLE_CY + CIRCLE_R, 9);
    /* The two free ends of the open letter meet, which is what closes it. */
    expect(wrap[0]).toBeCloseTo(top[0], 9);
    expect(wrap[1]).toBeCloseTo(top[1], 9);
  });

  it("keeps the morph mirror symmetric at every stage", () => {
    for (const round of [0.15, 0.4, 0.75, 1]) {
      const pts = eyePoints({ ...POSES.W, round }, EYE_CX_L);
      for (let i = 0; i <= pts.length >> 1; i++) {
        const a = pts[i];
        const b = pts[pts.length - 1 - i];
        expect(a[0] - EYE_CX_L).toBeCloseTo(-(b[0] - EYE_CX_L), 6);
        expect(a[1]).toBeCloseTo(b[1], 6);
      }
    }
  });

  it("takes the accent as it closes, and only as it closes", () => {
    expect(accentMix(0)).toBe(0);
    expect(accentMix(1)).toBe(1);
    expect(accentMix(0.5)).toBeCloseTo(0.5, 9);
    /* The opening tween overshoots below zero; that must not drive colour. */
    expect(accentMix(-0.14)).toBe(0);
  });

  it("draws the resting letter from exactly four straight segments", () => {
    /* Five control points, four segments, in EVERY pose now. The morph
       sampler is only reached by a pose with `round` above zero, and since the
       blink stopped being a circle there is no such pose, so every letter the
       mark can draw is the same four strokes at some proportion. */
    expect(eyePoints(POSES.W, EYE_CX_L)).toHaveLength(5);
    expect(eyePoints(POSES.u, EYE_CX_L)).toHaveLength(5);
    expect(eyePath(POSES.W, EYE_CX_L).match(/L/g)).toHaveLength(4);
    expect(MORPH_SAMPLES).toBeGreaterThan(0);
  });

  it("thinking swells one letter and yields the other", () => {
    expect(POSES.scanBig.squash).toBeGreaterThan(1);
    expect(POSES.scanSmall.squash).toBeLessThan(1);
    /* Subtle: a query in flight is a considered pulse, not a pump. */
    expect(POSES.scanBig.squash).toBeLessThan(1.1);
  });

  it("has no asymmetric state left except thinking", () => {
    /* Both letters always agree,
       and thinking is the only state allowed to break it. */
    /* The wink is gone (owner's call), so what is asserted now is that nothing
       asymmetric survives it: every state puts BOTH letters in the same pose
       except thinking, which is the one genuine asymmetry left. */
    for (const g of EYE_GLYPHS) {
      const [l, r] = eyePosesFor(g);
      if (g === ">" || g === "<") expect(l).not.toBe(r);
      else expect(l).toBe(r);
    }
  });
});

/* ------------------------------------------------------------------------ *
 * Geometry stays on the canvas
 * ------------------------------------------------------------------------ */

describe("geometry", () => {
  it("draws five control points per letter, left to right", () => {
    const pts = spinePoints(POSES.W, EYE_CX_L);
    expect(pts).toHaveLength(SPINE.length);
    expect(pts).toHaveLength(5);
    const xs = pts.map((p) => p[0]);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it("rests at the full width of its slot", () => {
    const pts = spinePoints(POSES.W, EYE_CX_L);
    expect(pts[0][0]).toBeCloseTo(EYE_CX_L - EYE_W / 2, 10);
    expect(pts[4][0]).toBeCloseTo(EYE_CX_L + EYE_W / 2, 10);
    expect(pts[0][1]).toBeCloseTo(EYE_TOP, 10);
    expect(pts[1][1]).toBeCloseTo(pts[3][1], 10);
  });

  it("keeps every pose's ink on the canvas, bar a growing letter's overhang", () => {
    /* 0.7 rather than 0, because a letter that grows taller rises past the top
       of the canvas. The SVG is `overflow-visible`, so this is a design
       allowance rather than a clipping bug, which is why it wants a number
       holding it still. */
    const SLACK = 0.7;
    for (const name of LETTERFORMS) {
      for (const cx of [EYE_CX_L, EYE_CX_R]) {
        const b = inkBounds(POSES[name], cx);
        expect(b.minX).toBeGreaterThan(-SLACK);
        expect(b.maxX).toBeLessThan(CANVAS_W + SLACK);
        expect(b.minY).toBeGreaterThan(-SLACK);
        expect(b.maxY).toBeLessThan(CANVAS_H + SLACK);
      }
    }
  });

  it("no longer hangs any letter below the canvas", () => {
    /* This used to assert the OPPOSITE: the blink's circle was centred on the
       baseline and hung half of itself below the bottom of the canvas, and the
       overhang was pinned so it could not quietly grow. With the blink back to
       a letterform, every pose keeps its feet on the line and the overhang is
       gone entirely. The circle constants survive unused; see POSES.u. */
    for (const name of ALL) {
      for (const cx of [EYE_CX_L, EYE_CX_R]) {
        const b = inkBounds(POSES[name], cx);
        expect(b.maxY, `${name} hangs below the baseline`).toBeLessThan(BASELINE + 0.05);
        expect(b.minX).toBeGreaterThan(-0.7);
        expect(b.maxX).toBeLessThan(CANVAS_W + 0.7);
      }
    }
    expect(CIRCLE_R).toBeGreaterThan(0);
    expect(CIRCLE_CY).toBe(BASELINE);
  });

  it("still fits once the idle slosh is riding on top", () => {
    const SLACK = 0.8;
    const cap = SLOSH_AMP_A + SLOSH_AMP_B;
    for (const name of LETTERFORMS) {
      const damp = MARK_SPEC.sloshScale[name];
      const p = POSES[name];
      for (const sign of [-1, 1]) {
        const swollen = {
          squash: p.squash * (1 + sign * cap * damp),
          spread: p.spread * (1 - sign * cap * MARK_SPEC.slosh.coupling * damp),
          weight: p.weight,
          round: p.round,
        };
        for (const cx of [EYE_CX_L, EYE_CX_R]) {
          const b = inkBounds(swollen, cx);
          expect(b.minX).toBeGreaterThan(-SLACK);
          expect(b.maxX).toBeLessThan(CANVAS_W + SLACK);
          expect(b.minY).toBeGreaterThan(-SLACK);
          expect(b.maxY).toBeLessThan(CANVAS_H + SLACK);
        }
      }
    }
  });

  it("emits a five point path and nothing else", () => {
    const d = pathFor(POSES.W, EYE_CX_L);
    expect(d.startsWith("M")).toBe(true);
    expect(d.match(/L/g)).toHaveLength(4);
    expect(d).not.toContain("NaN");
    expect(d).not.toContain("undefined");
  });

  it("never emits NaN for any pose or any blend between two of them", () => {
    for (const a of ALL) {
      for (const b of ALL) {
        for (const t of [0, 0.5, 1, 1.08]) {
          expect(eyePath(lerpPose(POSES[a], POSES[b], t), EYE_CX_R)).not.toContain("NaN");
        }
      }
    }
  });

  it("keeps the feet planted through every blend, including an overshoot", () => {
    /* Interruptions blend two poses, and overshoot pushes past the target.
       The anchoring has to survive both or a cut-short blink pops off the
       baseline. */
    for (const a of LETTERFORMS) {
      for (const b of LETTERFORMS) {
        for (const t of [0, 0.37, 1, 1.12]) {
          const pts = spinePoints(lerpPose(POSES[a], POSES[b], t), EYE_CX_L);
          expect(pts[1][1]).toBeCloseTo(EYE_BOT, 10);
          expect(pts[3][1]).toBeCloseTo(EYE_BOT, 10);
        }
      }
    }
  });
});

/* ------------------------------------------------------------------------ *
 * Easing and timing: the case that this reads as alive
 * ------------------------------------------------------------------------ */

describe("easing", () => {
  const NAMES = ["linear", "inQuad", "outCubic", "inOutCubic", "inOutSine", "outBack"] as const;

  it.each(NAMES)("%s starts at 0 and ends at 1", (name) => {
    expect(ease(name, 0)).toBeCloseTo(0, 10);
    expect(ease(name, 1)).toBeCloseTo(1, 10);
  });

  it.each(NAMES)("%s clamps outside its own window", (name) => {
    expect(ease(name, -3)).toBeCloseTo(0, 10);
    expect(ease(name, 4)).toBeCloseTo(1, 10);
  });

  it("overshoots only on outBack, and settles back", () => {
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => ease("outBack", i / 100)));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.2);
    for (const name of ["inQuad", "outCubic", "inOutCubic", "inOutSine"] as const) {
      const p = Math.max(...Array.from({ length: 101 }, (_, i) => ease(name, i / 100)));
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe("timing reads as alive rather than mechanical", () => {
  it("shuts a blink faster than it opens it", () => {
    /* The single most load-bearing asymmetry in the whole animation: a lid
       falls under its own weight and is pulled back up. */
    expect(BLINK_CLOSE_MS).toBeLessThan(BLINK_OPEN_MS);
    expect(BLINK_OPEN_MS / BLINK_CLOSE_MS).toBeGreaterThan(1.5);
  });

  it("derives the shut hold from the brain's own blink hold", () => {
    expect(BLINK_SHUT_MS).toBe(Math.round(TIMING.blinkHold * 0.38));
    expect(BLINK_SHUT_MS).toBeLessThan(TIMING.blinkHold);
  });

  it("keeps a whole blink short enough to read as a blink", () => {
    expect(BLINK_CLOSE_MS + BLINK_SHUT_MS + BLINK_OPEN_MS).toBeLessThan(400);
  });

  it("overshoots on arrival and never on release", () => {
    for (const k of ["blinkOpen", "alertIn", "happyIn", "sleepOut", "petIn"] as const) {
      expect(TRANSITIONS[k].ease).toBe("outBack");
    }
    expect(TRANSITIONS.release.ease).toBe("outCubic");
    expect(TRANSITIONS.fallback.ease).toBe("outCubic");
    expect(TRANSITIONS.blinkClose.ease).toBe("inQuad");
  });

  it("routes each change of pose to its own tween", () => {
    expect(transitionNameFor("W", "u")).toBe("blinkClose");
    expect(transitionNameFor("u", "W")).toBe("blinkOpen");
    expect(transitionNameFor("W", "O")).toBe("alertIn");
    expect(transitionNameFor("W", "^")).toBe("happyIn");
    expect(transitionNameFor("W", "scanBig")).toBe("scan");
    expect(transitionNameFor("scanBig", "scanSmall")).toBe("scan");
    expect(transitionNameFor("O", "W")).toBe("release");
    /* Sleep and petting each own a pair of tweens. The blink's pair is asserted
       above; these are the two that were added with the new states. */
    expect(transitionNameFor("W", "w")).toBe("sleepIn");
    expect(transitionNameFor("w", "W")).toBe("sleepOut");
    expect(transitionNameFor("W", "pet")).toBe("petIn");
    expect(transitionNameFor("pet", "W")).toBe("petOut");
  });

  it("gives the two halves of a blink different durations", () => {
    expect(TRANSITIONS.blinkClose.ms).not.toBe(TRANSITIONS.blinkOpen.ms);
  });

  it("finishes a scan pulse inside the brain's own flip interval", () => {
    expect(TRANSITIONS.scan.ms).toBeLessThan(TIMING.scanFlip);
  });

  it("sloshes on two periods with no small common multiple", () => {
    const { periodA, periodB } = MARK_SPEC.slosh;
    expect(periodA).not.toBe(periodB);
    expect(periodB % periodA).not.toBe(0);
    expect(periodA % (periodB - periodA)).not.toBe(0);
  });

  it("damps the slosh hardest when the face is concentrating", () => {
    expect(MARK_SPEC.sloshScale.W).toBe(1);
    expect(MARK_SPEC.sloshScale.scanBig).toBeLessThan(MARK_SPEC.sloshScale.O);
    expect(MARK_SPEC.sloshScale.O).toBeLessThan(MARK_SPEC.sloshScale.W);
  });

  it("breathes within its stated amplitude and returns to rest", () => {
    expect(breathScale(0)).toBeCloseTo(1, 10);
    for (let t = 0; t < MARK_SPEC.breath.period * 2; t += 137) {
      expect(Math.abs(breathScale(t) - 1)).toBeLessThanOrEqual(MARK_SPEC.breath.amplitude + 1e-9);
    }
  });

});

/* ------------------------------------------------------------------------ *
 * The preview page cannot drift away from what the site renders
 * ------------------------------------------------------------------------ */


/* ------------------------------------------------------------------------ *
 * Nothing on the live path reaches the retired renderer
 * ------------------------------------------------------------------------ */

describe("the renderer's own rules, checked in its source", () => {
  it("exports the live renderer from the barrel and nothing retired", () => {
    /* Matched against real export statements with the comments stripped, so the
       barrel's own note about the retired rasteriser is not read as the thing
       it warns of.

       `frames.ts` and `FramePlayer.tsx` do not exist in this repository at all
       - they were the pixel-frame renderer the vector one replaced, and they
       did not travel here. The assertion is kept because it costs nothing and
       states the rule: whatever else this barrel grows, it does not grow a
       second renderer. */
    const barrel = readFileSync(new URL("../index.ts", import.meta.url), "utf8").replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      ""
    );
    expect(barrel).not.toMatch(/from\s+"\.\/frames"/);
    expect(barrel).not.toMatch(/from\s+"\.\/FramePlayer"/);
    expect(barrel).toMatch(/from\s+"\.\/pose"/);
    expect(barrel).toMatch(/from\s+"\.\/VectorMark"/);
  });

  it("routes spatial movement through the rig instead of ad-hoc component transforms", () => {
    const src = readFileSync(new URL("../VectorMark.tsx", import.meta.url), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(code).toContain("sampleRigClip");
    expect(code).toContain("lerpRigPose");
    expect(code).toContain("rigTransform");
    expect(code).toContain("rigRootRef");
    expect(code).toContain("eyeLGroupRef");
    expect(code).toContain("eyeRGroupRef");
    /* There is one renderer and one rAF. Spatial animation must not grow a
       competing CSS transform loop beside the SVG hierarchy. */
    expect(code).not.toContain("style.transform");
  });

  it("writes every field the mouth geometry hands it", () => {
    /*
     * THIS TEST EXISTS BECAUSE OF A SHIPPED BUG.
     *
     * `mouthGeometry` returns eight numbers describing the mouth's box. The
     * renderer wrote six of them: `y` and `height` were computed, returned, and
     * silently dropped. So while the ring narrowed from 2.15 to 1.505 wide it
     * kept its full 2.15 height, and the open mouth rendered as an oval taller
     * than it was wide. That is a ZERO, not an o, and the owner spotted it
     * immediately.
     *
     * Nothing caught it because every unit test was on the pure function, which
     * was correct, and the only thing wrong was the wiring. So the wiring is
     * what gets asserted: every key of the returned geometry must appear in a
     * `setAttribute` in the renderer. It is a source check rather than a
     * behavioural one, which is a weaker kind of test, and it is still the test
     * that would have caught this.
     */
    const src = readFileSync(new URL("../VectorMark.tsx", import.meta.url), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    const written = new Set([...code.matchAll(/setAttribute\("([a-z-]+)"/g)].map((m) => m[1]));

    /* SVG spells two of them with a hyphen. */
    const attrFor: Record<string, string> = { fillOpacity: "fill-opacity", strokeOpacity: "stroke-opacity", strokeWidth: "stroke-width" };
    for (const key of Object.keys(mouthGeometry(0))) {
      expect(written, `mouthGeometry.${key} is computed but never written`).toContain(attrFor[key] ?? key);
    }
  });

  it("still rests on the glyph the brain calls rest", () => {
    expect(eyePosesFor(REST)).toEqual(["W", "W"]);
  });
});
