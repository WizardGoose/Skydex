import { describe, expect, it } from "vitest";
import {
  BLUSH,
  BLUSH_PEAK_OPACITY,
  UNDERSCORE_W,
  ZZZ_COUNT,
  ZZZ_PEAK_OPACITY,
  ZZZ_VIEWPORT,
  blushCentres,
  underscoreSpan,
  zzzAt,
} from "../adornments";
import {
  MARK_WAKE_PADDING_PX,
  PET_TRAVEL_PX,
  PET_WINDOW_MS,
  TIMING,
  WAKE_PADDING_PX,
  YAWN_CHANCE,
  YAWN_CLOSE_MS,
  YAWN_OPEN_MS,
  YAWN_TOTAL_MS,
  blinkDuration,
  nearField,
  petTravel,
  resolveEye,
  shouldYawn,
} from "../face";
import type { FaceState } from "../face";
import {
  BASELINE,
  BLINK_CLOSE_MS,
  BLINK_OPEN_MS,
  BLINK_TOTAL_BASE,
  EYE_CX_L,
  EYE_CX_R,
  MOUTH_CX,
  MOUTH_POSES,
  POSES,
  eyePosesFor,
  facePoseFor,
  mouthGeometry,
  YAWN_STRETCH_PEAK,
  yawnStretch,
} from "../pose";

/**
 * The three states the owner specified, tested along the SAME chain the
 * renderer walks.
 *
 * The loop does exactly this, in this order: resolve a glyph, turn it into pose
 * names, look those up, and derive the mouth and the adornments from them. Every
 * link is a pure function, so the whole decision can be asserted without a DOM
 * and without a frame ever being painted.
 *
 * What this does NOT cover, stated honestly rather than left to be discovered:
 * the last step, where the renderer writes those derived numbers onto SVG
 * attributes. That is about thirty lines of `setAttribute` and it needs a DOM
 * to observe. Everything that DECIDES anything is here.
 */

const BASE: FaceState = {
  still: false,
  satisfied: false,
  thinking: false,
  scan: 1,
  blink: false,
  alert: false,
  sleeping: false,
  glance: 0,
  petted: false,
  yawning: false,
};

const at = (over: Partial<FaceState>): FaceState => ({ ...BASE, ...over });

/** The renderer's own chain, in one place, so the tests cannot drift from it. */
const chain = (s: FaceState) => {
  const glyph = resolveEye(s);
  const [nameL, nameR] = eyePosesFor(glyph, s.petted, s.yawning);
  const face = facePoseFor(glyph, s.petted, s.yawning);
  return { glyph, nameL, nameR, face, mouth: mouthGeometry(MOUTH_POSES[face].hollow) };
};

describe("the attentive region", () => {
  const rect = { left: 100, top: 200, right: 300, bottom: 240 };

  it("uses a tight region around the search field", () => {
    expect(nearField(rect, rect.left - WAKE_PADDING_PX, 220)).toBe(true);
    expect(nearField(rect, rect.right + WAKE_PADDING_PX, 220)).toBe(true);
    expect(nearField(rect, rect.left - WAKE_PADDING_PX - 0.01, 220)).toBe(false);
    expect(nearField(rect, 200, rect.bottom + WAKE_PADDING_PX + 0.01)).toBe(false);
  });

  it("gives little Wonder a larger but still local hover target", () => {
    expect(MARK_WAKE_PADDING_PX).toBeGreaterThan(WAKE_PADDING_PX);
    expect(MARK_WAKE_PADDING_PX).toBeLessThan(70);
    expect(nearField(rect, rect.left - MARK_WAKE_PADDING_PX, 220, MARK_WAKE_PADDING_PX)).toBe(true);
    expect(nearField(rect, rect.left - MARK_WAKE_PADDING_PX - 1, 220, MARK_WAKE_PADDING_PX)).toBe(false);
  });
});

describe("asleep: w.w with a zzz", () => {
  it("drops the letters into the lowercase pose", () => {
    const { glyph, nameL, nameR, face } = chain(at({ sleeping: true }));
    expect(glyph).toBe("w");
    expect([nameL, nameR]).toEqual(["w", "w"]);
    expect(face).toBe("w");
  });

  it("is genuinely shorter than the awake mark, which is what lowercase means", () => {
    expect(POSES.w.squash).toBeLessThan(POSES.W.squash);
    /* And it must not be shorter than the SQUINT, or the two states become the
       same drawing and a settled search would look like a nap. */
    expect(POSES.w.squash).toBeGreaterThan(POSES["^"].squash);
  });

  it("keeps its feet on the line despite the lighter stroke", () => {
    /* The letters' feet are welded to the baseline by the pose model; what a
       lighter weight moves is the drawn round cap. The invariant the suite
       holds is that no pose deviates by more than 0.05 canvas units, which caps
       how light the sleeping stroke may be. */
    expect(Math.abs(POSES.w.weight - 1)).toBeLessThan(0.0485);
  });

  it("keeps its mouth shut and roughly the same dot", () => {
    const { mouth } = chain(at({ sleeping: true }));
    expect(MOUTH_POSES.w.hollow).toBe(0);
    expect(mouth.strokeOpacity).toBe(0);
    expect(MOUTH_POSES.w.scale).toBeGreaterThan(0.9);
  });

  it("runs three z's off one clock, evenly spaced and never all at once", () => {
    /* Sampled across a whole cycle. The claim is that the z's are staggered:
       at any moment they are at different points of their arc, which is what
       makes it read as a stream rather than as a flashing group. */
    const seen = new Set<string>();
    for (let t = 0; t < TIMING.zzzGap * ZZZ_COUNT; t += 40) {
      const ys = Array.from({ length: ZZZ_COUNT }, (_, i) => zzzAt(t, i)).map((z) => z.y.toFixed(3));
      seen.add(ys.join("|"));
      expect(new Set(ys).size, `two z's coincided at ${t}ms`).toBe(ZZZ_COUNT);
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  it("never lets a z be visible with a stale position", () => {
    /* A z past the end of its life has meaningless coordinates, so the flag and
       the opacity have to agree. A renderer trusting the numbers alone would
       park invisible glyphs at the top of the arc. */
    for (let t = 0; t < 12000; t += 17) {
      for (let i = 0; i < ZZZ_COUNT; i++) {
        const z = zzzAt(t, i);
        if (!z.visible) expect(z.opacity).toBe(0);
        expect(z.opacity).toBeGreaterThanOrEqual(0);
        expect(z.opacity).toBeLessThanOrEqual(ZZZ_PEAK_OPACITY + 1e-9);
      }
    }
  });

  it("sends every z upward and outward, never down", () => {
    for (let i = 0; i < ZZZ_COUNT; i++) {
      const early = zzzAt(i * TIMING.zzzGap + 50, i);
      const late = zzzAt(i * TIMING.zzzGap + 1200, i);
      expect(late.y).toBeLessThan(early.y); /* y grows downward */
      expect(late.x).toBeGreaterThan(early.x);
      expect(late.scale).toBeGreaterThan(early.scale);
    }
  });

  it("keeps the whole sleeping glyph arc inside its paint viewport", () => {
    for (let t = 0; t < TIMING.zzzGap * ZZZ_COUNT; t += 17) {
      for (let index = 0; index < ZZZ_COUNT; index++) {
        const z = zzzAt(t, index);
        if (!z.visible) continue;
        // A full em on every side also covers differences in mobile font metrics.
        const extent = 3.1 * z.scale;
        expect(z.x - extent).toBeGreaterThanOrEqual(ZZZ_VIEWPORT.x);
        expect(z.x + extent).toBeLessThanOrEqual(ZZZ_VIEWPORT.x + ZZZ_VIEWPORT.width);
        expect(z.y - extent).toBeGreaterThanOrEqual(ZZZ_VIEWPORT.y);
        expect(z.y + extent).toBeLessThanOrEqual(ZZZ_VIEWPORT.y + ZZZ_VIEWPORT.height);
      }
    }
  });
});

describe("petted: WoW, blush and two rules", () => {
  it("opens the mouth and leaves the letters as letters", () => {
    const { glyph, nameL, nameR, face, mouth } = chain(at({ petted: true }));
    expect(glyph).toBe("W");
    expect([nameL, nameR]).toEqual(["pet", "pet"]);
    expect(face).toBe("pet");
    expect(mouth.fillOpacity).toBe(0);
    expect(mouth.strokeOpacity).toBe(1);
  });

  it("opens into a hollow dot, not a bigger o", () => {
    const shut = mouthGeometry(0);
    const open = mouthGeometry(1);

    /* The test that matters: the two shapes occupy the SAME footprint. An SVG
       stroke straddles its path, so a ring drawn on the dot's own circle would
       be a stroke-width wider than the dot and the mouth would visibly inflate
       the instant it opened. The ring's path is inset by exactly one stroke so
       its outer edge lands on the dot's silhouette. */
    expect(open.width + open.strokeWidth).toBeCloseTo(shut.width, 10);
    expect(open.height + open.strokeWidth).toBeCloseTo(shut.height, 10);

    /* And both ends are circles, because the dot is a circle now rather than
       the rounded dash it inherited from the pixel mark. */
    expect(shut.width).toBeCloseTo(shut.height, 10);
    expect(shut.rx).toBeCloseTo(shut.width / 2, 10);
    expect(open.width).toBeCloseTo(open.height, 10);
    expect(open.rx).toBeCloseTo(open.width / 2, 10);
  });

  it("puts both letters in the pet pose", () => {
    expect(eyePosesFor("W", true)).toEqual(["pet", "pet"]);
    expect(facePoseFor("W", true)).toBe("pet");
  });

  it("grows both rules from their own letter's centre", () => {
    for (const [i, cx] of [EYE_CX_L, EYE_CX_R].entries()) {
      const none = underscoreSpan(cx, 0);
      expect(none.x1).toBeCloseTo(cx, 10);
      expect(none.x2).toBeCloseTo(cx, 10);

      const full = underscoreSpan(cx, 1);
      expect(full.x2 - full.x1).toBeCloseTo(UNDERSCORE_W, 10);
      expect((full.x1 + full.x2) / 2, `rule ${i} is not centred on its letter`).toBeCloseTo(cx, 10);
    }
  });

  it("grows the rules monotonically and clamps them", () => {
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const s = underscoreSpan(EYE_CX_L, i / 20);
      const w = s.x2 - s.x1;
      expect(w).toBeGreaterThanOrEqual(prev);
      prev = w;
    }
    expect(underscoreSpan(EYE_CX_L, 3).x2 - underscoreSpan(EYE_CX_L, 3).x1).toBeCloseTo(UNDERSCORE_W, 10);
    expect(underscoreSpan(EYE_CX_L, -2).x2 - underscoreSpan(EYE_CX_L, -2).x1).toBe(0);
  });

  it("puts one blush under each eye, symmetric about the mouth", () => {
    const [[lx], [rx]] = blushCentres();
    const mid = (EYE_CX_L + EYE_CX_R) / 2;
    expect(mid - lx).toBeCloseTo(rx - mid, 10);
    /* Outboard of the eyes, not crowded toward the middle, or the pair reads as
       a cluster with the mouth rather than as two cheeks. */
    expect(lx).toBeLessThan(EYE_CX_L);
    expect(rx).toBeGreaterThan(EYE_CX_R);
  });

  it("keeps the blush a flush rather than a shape", () => {
    expect(BLUSH_PEAK_OPACITY).toBeLessThan(0.5);
  });

  it("offers blushes that cannot be mistaken for a rarity tier", () => {
    /* The site colours rarity, and those colours are DATA. A blush landing on
       one would read as a tier leaking onto the logo. Mythic is #fa80d5 and
       special is #ff6b6b; every candidate must be clear of both. */
    const RARITY = { mythic: "#fa80d5", special: "#ff6b6b" };
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const dist = (a: string, b: string) =>
      Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));

    for (const [name, hex] of Object.entries(BLUSH)) {
      for (const [tier, thex] of Object.entries(RARITY)) {
        expect(dist(hex, thex), `blush ${name} sits on rarity ${tier}`).toBeGreaterThan(40);
      }
    }
  });

  it("offers three candidates that are actually different from each other", () => {
    /* Three swatches that look the same are one swatch shown three times, and
       the whole point of the set is to give the owner a real choice. */
    const names = Object.keys(BLUSH) as (keyof typeof BLUSH)[];
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const dist = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));

    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        expect(dist(BLUSH[names[i]], BLUSH[names[j]]), `${names[i]} and ${names[j]} are the same colour`).toBeGreaterThan(30);
      }
    }
  });
});

describe("the pet gesture", () => {
  it("ignores a single crossing", () => {
    /* One pass over the mark on the way to the search field. Well under the
       threshold, so the mark does not blush at people who did not touch it. */
    let travel = 0;
    for (let i = 0; i < 6; i++) travel = petTravel(travel, 16, 8);
    expect(travel).toBeLessThan(PET_TRAVEL_PX);
  });

  it("trips on a genuine stroke", () => {
    let travel = 0;
    for (let i = 0; i < 20; i++) travel = petTravel(travel, 16, 12);
    expect(travel).toBeGreaterThanOrEqual(PET_TRAVEL_PX);
  });

  it("forgets travel that is not continuous", () => {
    /* The accumulator must not be a lifetime odometer. Nudging the mark once a
       second forever should never trip it. */
    let travel = 0;
    for (let i = 0; i < 200; i++) travel = petTravel(travel, 1000, 20);
    expect(travel).toBeLessThan(PET_TRAVEL_PX);
  });

  it("decays to nothing over the window, and never below it", () => {
    expect(petTravel(PET_TRAVEL_PX, PET_WINDOW_MS, 0)).toBeCloseTo(0, 10);
    expect(petTravel(10, PET_WINDOW_MS * 5, 0)).toBe(0);
    expect(petTravel(0, 0, -50)).toBe(0);
  });
});

describe("the states cannot collide", () => {
  it("gives every pinned state of the lab a distinct drawing", () => {
    /* The lab shows seven tiles. If two of them resolved to the same poses AND
       the same mouth, one of them would be decoration on a page whose whole
       job is telling them apart. */
    const cases: [string, FaceState][] = [
      ["sleeping", at({ sleeping: true })],
      ["rest", at({})],
      ["alert", at({ alert: true })],
      ["petted", at({ petted: true })],
      ["blink", at({ blink: true })],
      ["thinking", at({ thinking: true })],
      ["satisfied", at({ satisfied: true })],
      ];

    const seen = new Map<string, string>();
    for (const [name, state] of cases) {
      const c = chain(state);
      const key = `${c.nameL}|${c.nameR}|${c.face}`;
      /* `rest` and `alert` are the ONE permitted collision, and only on the
         default setting: the owner's spec says an attentive mark is `W.W`, so
         focus and rest genuinely are the same drawing until `wideEyedFocus` is
         turned on. That is a stated design decision, not a clash. */
      const prior = seen.get(key);
      if (prior) expect([prior, name].sort()).toEqual(["alert", "rest"]);
      seen.set(key, name);
    }
  });

  it("separates rest from focus the moment the wide-eyed option is on", () => {
    expect(resolveEye(at({ alert: true }), { wideEyedFocus: true })).toBe("O");
    expect(resolveEye(at({}), { wideEyedFocus: true })).toBe("W");
  });
});

describe("the life added after the fact", () => {
  it("draws every blink from the range the owner asked for", () => {
    /* 250 to 350, ends included. Sampled across the unit interval rather than
       at the two ends alone, because the failure this guards against is an
       off-by-one in the interpolation that only shows up in the middle. */
    for (let i = 0; i <= 100; i++) {
      const ms = blinkDuration(i / 100);
      expect(ms).toBeGreaterThanOrEqual(TIMING.blinkTotalMin);
      expect(ms).toBeLessThanOrEqual(TIMING.blinkTotalMax);
    }
    expect(blinkDuration(0)).toBe(250);
    expect(blinkDuration(1)).toBe(350);
  });

  it("keeps the blink's shape while changing its length", () => {
    /* The three phases scale together, so the ratio between them is constant.
       That is what stops a long blink from becoming a different gesture: the
       eye always shuts faster than it opens, at every duration. */
    const shape = BLINK_OPEN_MS / BLINK_CLOSE_MS;
    for (const r of [0, 0.5, 1]) {
      const scale = blinkDuration(r) / BLINK_TOTAL_BASE;
      expect((BLINK_OPEN_MS * scale) / (BLINK_CLOSE_MS * scale)).toBeCloseTo(shape, 10);
    }
    expect(BLINK_OPEN_MS).toBeGreaterThan(BLINK_CLOSE_MS);
  });

  it("keeps the old fixed duration inside the new range", () => {
    /* The blink was a flat 276ms. If the range had missed it, every blink on
       the site would have changed speed as well as becoming irregular, which is
       not what was asked for. */
    expect(BLINK_TOTAL_BASE).toBeGreaterThanOrEqual(TIMING.blinkTotalMin);
    expect(BLINK_TOTAL_BASE).toBeLessThanOrEqual(TIMING.blinkTotalMax);
  });

  it("yawns rarely, and only ever on waking", () => {
    expect(shouldYawn(0)).toBe(true);
    expect(shouldYawn(YAWN_CHANCE - 1e-9)).toBe(true);
    expect(shouldYawn(YAWN_CHANCE)).toBe(false);
    expect(shouldYawn(0.99)).toBe(false);
    /* Rare enough to be an event, common enough to be found. */
    expect(YAWN_CHANCE).toBeLessThan(0.34);
    expect(YAWN_CHANCE).toBeGreaterThan(0.05);
  });

  it("gives the yawn a shape that cannot be mistaken for the squint", () => {
    /* Both shut the eyes. What separates them is how hard, and the mouth: a
       yawn is the only state that screws the eyes tighter than sleep AND opens
       the mouth. If these ever converge the mark has two states that look the
       same and mean different things. */
    expect(POSES.yawn.squash).toBeLessThan(POSES["^"].squash);
    expect(POSES.yawn.squash).toBeLessThan(POSES.w.squash);
    expect(MOUTH_POSES.yawn.hollow).toBe(1);
    expect(MOUTH_POSES["^"].hollow).toBe(0);
  });

  it("takes long enough to read as involuntary", () => {
    /* A yawn is a slow shape. Anything under about half a second reads as a
       flinch, and the whole point of the state is that it is not one. */
    expect(YAWN_TOTAL_MS).toBeGreaterThan(900);
    expect(YAWN_OPEN_MS).toBeGreaterThan(TIMING.petIn);
    expect(YAWN_CLOSE_MS).toBeGreaterThan(YAWN_OPEN_MS);
  });

});

describe("the yawn actually moves, and moves like a mouth", () => {
  it("is a dot-sized o at both ends, exactly like the petted mouth", () => {
    /* The owner's instruction: "make yawn just be the wow again o the size of
       .". So the yawn's POSE is identical to petting, and everything that makes
       it a yawn is motion on top of that. */
    expect(MOUTH_POSES.yawn).toEqual(MOUTH_POSES.pet);
    expect(yawnStretch(0)).toBe(1);
    expect(yawnStretch(1)).toBe(1);
  });

  it("opens, eases off, and closes, in that order", () => {
    /* The three beats. Sampled rather than asserted at the boundaries, because
       what matters is the SHAPE of the curve and not where its segments meet. */
    /* Sampled, so it lands just under the true peak; 4 places is well inside
       what a sample grid of 200 can resolve and still pins the value. */
    const peak = Math.max(...Array.from({ length: 201 }, (_, i) => yawnStretch(i / 200)));
    expect(peak).toBeCloseTo(YAWN_STRETCH_PEAK, 4);
    expect(peak).toBeLessThanOrEqual(YAWN_STRETCH_PEAK + 1e-9);

    const at = (t: number) => yawnStretch(t);
    expect(at(0.05)).toBeLessThan(at(0.2));
    expect(at(0.2)).toBeLessThan(at(0.34));
    /* The sag: past the peak it comes down, and stays down. */
    expect(at(0.5)).toBeLessThan(peak);
    expect(at(0.9)).toBeLessThan(at(0.5));
  });

  it("never reverses direction more than twice, so it cannot read as a shake", () => {
    /* THE ASSERTION THE OWNER ASKED FOR IN WORDS: "dont make it unrealistic, or
       just shaking". A shake is many direction changes; a yawn is exactly two -
       up to the peak, down through the sag and the close. Counting turning
       points is the mechanical version of that sentence. */
    let turns = 0;
    let prev = yawnStretch(0.001) - yawnStretch(0);
    for (let i = 2; i <= 400; i++) {
      const d = yawnStretch(i / 400) - yawnStretch((i - 1) / 400);
      if (Math.abs(d) > 1e-9 && Math.sign(d) !== Math.sign(prev) && Math.abs(prev) > 1e-9) turns++;
      if (Math.abs(d) > 1e-9) prev = d;
    }
    expect(turns).toBeLessThanOrEqual(2);
  });

  it("has no corners in it, which is what stops it looking mechanical", () => {
    /* A piecewise curve joined badly reads as a snap at the seam. Sampling the
       second difference catches a discontinuity in slope that eyeballing the
       values would not. */
    const step = 1 / 600;
    let maxJerk = 0;
    for (let i = 2; i <= 600; i++) {
      const a = yawnStretch((i - 2) * step);
      const b = yawnStretch((i - 1) * step);
      const c = yawnStretch(i * step);
      maxJerk = Math.max(maxJerk, Math.abs(c - 2 * b + a));
    }
    expect(maxJerk).toBeLessThan(0.002);
  });

  it("lengthens the opening and narrows it at the same time", () => {
    /* A mouth opening is a deformation, not a vertical scale. If the width did
       not come in, the yawn would read as the dot being stretched. */
    const rest = mouthGeometry(1, 1);
    const wide = mouthGeometry(1, YAWN_STRETCH_PEAK);
    expect(wide.height).toBeGreaterThan(rest.height);
    expect(wide.width).toBeLessThan(rest.width);
    /* And it stays an ellipse rather than a stadium: both radii track their own
       axis, which is why `ry` exists at all. */
    expect(wide.rx).toBeCloseTo(wide.width / 2, 10);
    expect(wide.ry).toBeCloseTo(wide.height / 2, 10);
    expect(wide.ry).toBeGreaterThan(wide.rx);
  });

  it("keeps the mouth's foot on the baseline at every point of the yawn", () => {
    /* The mark's oldest rule, and the yawn is the first thing that could
       plausibly have broken it: the opening grows, and if it grew about its own
       centre it would drop through the line the period sits on. It grows
       upward instead. */
    for (let i = 0; i <= 40; i++) {
      const g = mouthGeometry(1, yawnStretch(i / 40));
      const outerFoot = g.y + g.height + g.strokeWidth / 2;
      expect(outerFoot, `foot moved at t=${i / 40}`).toBeCloseTo(BASELINE, 9);
    }
    /* And the solid dot, at every hollow, for the same reason. */
    for (let i = 0; i <= 10; i++) {
      const g = mouthGeometry(i / 10);
      expect(g.y + g.height + (g.strokeWidth / 2) * (i / 10)).toBeCloseTo(BASELINE, 9);
    }
  });

  it("keeps the mouth centred on the mark's own axis throughout", () => {
    for (let i = 0; i <= 40; i++) {
      const g = mouthGeometry(1, yawnStretch(i / 40));
      expect(g.x + g.width / 2).toBeCloseTo(MOUTH_CX, 10);
    }
  });

  it("stays inside the canvas even at full stretch", () => {
    /* The opening grows upward, so the thing to check is that it does not climb
       into the letters or off the top of the box. */
    const g = mouthGeometry(1, YAWN_STRETCH_PEAK);
    expect(g.y - g.strokeWidth / 2).toBeGreaterThan(0);
  });
});
