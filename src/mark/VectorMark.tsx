import React, { useCallback, useEffect, useRef, useState } from "react";
import { SITE_NAME } from "../ui/brand";
import {
  MARK_WAKE_PADDING_PX,
  PET_TRAVEL_PX,
  TIMING,
  YAWN_DELAY_MS,
  YAWN_TOTAL_MS,
  blinkDuration,
  blinkGap,
  nearField,
  petTravel,
  resolveEye,
  shouldYawn,
} from "./face";
import type { FaceOptions, FaceState } from "./face";
import {
  BLUSH,
  BLUSH_DEFAULT,
  BLUSH_PEAK_OPACITY,
  BLUSH_RX,
  BLUSH_RY,
  UNDERSCORE_STROKE,
  UNDERSCORE_Y,
  ZZZ_COUNT,
  blushCentres,
  underscoreSpans,
  zzzAt,
  ZZZ_VIEWPORT,
} from "./adornments";
import type { BlushName } from "./adornments";
import {
  BASELINE,
  BLINK_CLOSE_MS,
  BLINK_SHUT_MS,
  BLINK_TOTAL_BASE,
  CANVAS_H,
  CANVAS_W,
  EYE_CX_L,
  EYE_CX_R,
  EYE_LAG_MS,
  MOUTH_CX,
  MOUTH_POSES,
  POSES,
  REST_POSE,
  SLOSH_EYE_PHASE,
  SLOSH_SCALE,
  STROKE,
  accentMix,
  ease,
  eyePath,
  eyePosesFor,
  facePoseFor,
  lerpMouth,
  lerpPose,
  mouthGeometry,
  sloshAt,
  transitionFor,
  yawnStretch,
} from "./pose";
import type { EaseName, MouthPose, Pose, PoseName } from "./pose";
import {
  RIG_TRANSITION_MS,
  lerpRigPose,
  rigTransform,
  sampleRig,
  sampleRigClip,
} from "./rig";
import type { RigClip, WonderRigMode, WonderRigPose } from "./rig";
import { resolveWonderRigSelection, wonderAmbientEligible } from "./personality";

/**
 * The mark: the wordmark `W.W`, alive.
 *
 * This replaces `FramePlayer.tsx`, which flipped between the 26 rasterised
 * frames in `frames.ts`. Both of those files are still in the tree and still
 * tested; nothing on the live path imports either of them.
 *
 * WHAT IS THE SAME
 * ----------------
 * The brain. `face.ts` still decides what the mark is feeling: this component
 * assembles a `FaceState` from its props and its own timers and calls
 * `resolveEye`, exactly as the original glyph-swap `Mark` did. The priority
 * ordering, the blink gap distribution, the scan flip and the satisfied hold
 * are still that file's, and this component re-implements none of them.
 * `FramePlayer` had drifted here: it had grown its own `resolveMode` restating
 * the same priority in different words, and one of the two was always going to
 * be edited without the other.
 *
 * WHAT IS DIFFERENT
 * -----------------
 * The renderer has two cooperating layers. `pose.ts` deforms the two W paths
 * into expressions. `rig.ts` is a real four-part hierarchy: root, left eye,
 * right eye and mouth. Its reusable clips add floating, breathing, anticipation
 * and follow-through without baking those motions into the letter geometry.
 * This is Wonder rather than a static wordmark now, so spatial movement is part
 * of the character instead of an accidental transform scattered through JSX.
 *
 * ARCHITECTURE
 * ------------
 * One `requestAnimationFrame` loop owns the whole picture, and React renders
 * once. The flags driving the face live in refs, not state, so a blink does not
 * re-render the landing page; the loop reads those refs, resolves the pose
 * through `face.ts`, notices when a resolved pose or rig clip has changed,
 * starts a tween from the exact current shape, and writes the complete rig to
 * the SVG nodes.
 *
 * Starting the tween FROM THE CURRENT INTERPOLATED POSE rather than from the
 * previous pose's resting values is what makes interruptions look right: a
 * blink cut short by the field being focused grows out of whatever half-squashed
 * shape it was in, instead of snapping shut and animating from there.
 */

/* ------------------------------------------------------------------------ *
 * Reduced motion
 * ------------------------------------------------------------------------ */

const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return reduced;
};

/* ------------------------------------------------------------------------ *
 * Tween bookkeeping
 * ------------------------------------------------------------------------ */

/**
 * One channel in flight: where it started, where it is going, and the curve
 * between. `from` is a VALUE and `to` is a NAME, because the destination is a
 * table lookup that must stay current while the origin is a snapshot of a
 * moment that has already passed.
 */
interface Tween<V> {
  from: V;
  to: PoseName;
  start: number;
  ms: number;
  easeName: EaseName;
  back: number;
  value: V;
}

/**
 * `scale` stretches or shrinks the tween's duration without touching its curve.
 *
 * It exists for one caller: the blink, whose whole length is drawn fresh each
 * time between 250ms and 350ms. Scaling the tween rather than storing a second
 * transitions table is what keeps every blink the same SHAPE - the open stays
 * roughly twice the close - while no two are the same length.
 */
const startTween = <V,>(
  prev: Tween<V> | null,
  from: V,
  to: PoseName,
  now: number,
  lag: number,
  scale = 1
): Tween<V> => {
  const t = transitionFor(prev ? prev.to : REST_POSE, to);
  return {
    from,
    to,
    start: now + lag,
    ms: t.ms * scale,
    easeName: t.ease,
    back: t.back ?? 1.7,
    value: from,
  };
};

const advance = <V,>(tw: Tween<V>, now: number, target: V, blend: (a: V, b: V, t: number) => V): V => {
  const raw = tw.ms <= 0 ? 1 : (now - tw.start) / tw.ms;
  tw.value = blend(tw.from, target, ease(tw.easeName, raw, tw.back));
  return tw.value;
};

/* ------------------------------------------------------------------------ *
 * The component
 * ------------------------------------------------------------------------ */

/**
 * Which of the two mouths the owner asked to compare.
 *
 *   accent  the mouth is Index blue, as it has always been. The dot is the one
 *           piece of colour in the mark and it is what your eye lands on.
 *   ink     the mouth is the same white as the letters. The mark becomes
 *           monochrome and reads as one object rather than as a face with a
 *           coloured feature.
 *
 * Both are wired end to end - the blink's colour beat reads whichever is set,
 * so choosing `ink` does not leave a blue flash behind on every blink.
 */
export type MouthTone = "accent" | "ink";

/**
 * A state the lab can pin so a frame can be looked at without waiting for a
 * timer to produce it. `null` means the mark runs itself, which is what every
 * real page passes.
 *
 * This exists because three of the states are, by design, hard to catch: sleep
 * needs the pointer to stay away from the field, the yawn fires on one wake in
 * five, and petting needs a pointer on the mark. A design review cannot be
 * conducted by waiting.
 */
export type ForcedState =
  | "rest"
  | "sleeping"
  | "alert"
  | "thinking"
  | "satisfied"
  | "blink"
  | "petted"
  | "yawn";

interface VectorMarkProps {
  /** The search field has focus. */
  alert: boolean;
  /** A query is in flight. */
  thinking: boolean;
  /** Which mouth to draw. Defaults to the accent the mark has always worn. */
  mouthTone?: MouthTone;
  /** Which blush to wear when petted. */
  blush?: BlushName;
  /** Focus opens the eyes wide, the way it used to. Off by default. */
  wideEyedFocus?: boolean;
  /** Pin a state instead of running the timers. Lab only. */
  force?: ForcedState | null;
  /** Pin only the spatial rig while leaving the chosen face state intact. Lab only. */
  forceRigMode?: WonderRigMode | null;
  /** Play an isolated authored clip without registering it as live behaviour. Lab only. */
  forceRigClip?: RigClip | null;
  /** Search or other nearby interaction surface that should wake Wonder. */
  attentionTargetRef?: React.RefObject<HTMLElement | null>;
  /** Run the approved low-priority personality rhythm while Wonder is idly awake. */
  ambient?: boolean;
  /** Rendered width. The page's default is the responsive class. */
  className?: string;
}

export const VectorMark: React.FC<VectorMarkProps> = ({
  alert,
  thinking,
  mouthTone = "accent",
  blush = BLUSH_DEFAULT,
  wideEyedFocus = false,
  force = null,
  forceRigMode = null,
  forceRigClip = null,
  attentionTargetRef,
  ambient = false,
  className = "w-[76px] overflow-visible sm:w-[104px] md:w-[136px] aspect-[35/12]",
}) => {
  const still = useReducedMotion();

  const rigRootRef = useRef<SVGGElement | null>(null);
  const eyeLGroupRef = useRef<SVGGElement | null>(null);
  const eyeRGroupRef = useRef<SVGGElement | null>(null);
  const eyeLRef = useRef<SVGPathElement | null>(null);
  const eyeRRef = useRef<SVGPathElement | null>(null);
  const mouthRef = useRef<SVGGElement | null>(null);
  const mouthRectRef = useRef<SVGRectElement | null>(null);
  const blushRef = useRef<SVGGElement | null>(null);
  const ruleLRef = useRef<SVGLineElement | null>(null);
  const ruleRRef = useRef<SVGLineElement | null>(null);
  const zzzRefs = useRef<(SVGTextElement | null)[]>([]);
  /* The hit area for petting. The `<svg>` itself, because the letters are thin
     strokes and requiring the pointer to land ON a stroke would make the mark
     almost impossible to pet on purpose and completely impossible by accident,
     which is where the discovery comes from. */
  const svgRef = useRef<SVGSVGElement | null>(null);

  /* Live mirrors of the props. The loop reads these every frame rather than
     closing over a render's values, which is what lets the whole animation run
     without React re-rendering at all. */
  const alertRef = useRef(alert);
  const thinkingRef = useRef(thinking);
  const forceRef = useRef(force);
  const forceRigModeRef = useRef(forceRigMode);
  const forceRigClipRef = useRef(forceRigClip);
  const ambientRef = useRef(ambient);
  const optsRef = useRef<FaceOptions>({ wideEyedFocus });
  alertRef.current = alert;
  thinkingRef.current = thinking;
  forceRef.current = force;
  forceRigModeRef.current = forceRigMode;
  forceRigClipRef.current = forceRigClip;
  ambientRef.current = ambient;
  optsRef.current = { wideEyedFocus };

  /* The rest of the `FaceState`, owned by this component's timers. */
  const blinkRef = useRef(false);
  const satisfiedRef = useRef(false);
  const scanRef = useRef(1);
  const sleepingRef = useRef(true);
  const proximityRef = useRef(false);
  const dozeTimerRef = useRef<number | null>(null);
  const glanceRef = useRef(0);
  const pettedUntilRef = useRef(0); /* timestamp the pet releases, or 0 */
  const yawnUntilRef = useRef(0); /* timestamp the yawn ends, or 0 */
  const yawnFromRef = useRef(0); /* timestamp the yawn starts, or 0 */
  /* How much longer or shorter THIS blink is than the base. Read by the loop
     when it starts a blink tween, so one drawn duration governs the close, the
     hold and the open together. */
  const blinkScaleRef = useRef(1);

  /* ---- attention and sleep ----------------------------------------------- *
   *
   * Wonder is asleep by default. Only a focused search field, a pointer at the
   * supplied search surface, or a pointer near Wonder wakes him. General page
   * activity does not. That keeps `w.w` as his real resting state instead of a
   * rare timeout somebody has to wait around to discover.
   */
  const clearDoze = useCallback(() => {
    if (dozeTimerRef.current !== null) window.clearTimeout(dozeTimerRef.current);
    dozeTimerRef.current = null;
  }, []);

  const wake = useCallback(() => {
    clearDoze();
    if (sleepingRef.current && shouldYawn(Math.random())) {
      const now = performance.now();
      yawnFromRef.current = now + YAWN_DELAY_MS;
      yawnUntilRef.current = yawnFromRef.current + YAWN_TOTAL_MS;
    }
    sleepingRef.current = false;
  }, [clearDoze]);

  const scheduleDoze = useCallback(() => {
    clearDoze();
    if (alertRef.current || proximityRef.current) return;
    dozeTimerRef.current = window.setTimeout(() => {
      if (!alertRef.current && !proximityRef.current) {
        sleepingRef.current = true;
        glanceRef.current = 0;
      }
      dozeTimerRef.current = null;
    }, TIMING.sleepAfter);
  }, [clearDoze]);

  useEffect(() => {
    if (still) return;

    const onMove = (e: PointerEvent) => {
      /* Read both rectangles live. Search results can change the target's
         height, and a cached rectangle would leave an invisible wake zone. */
      const markRect = svgRef.current?.getBoundingClientRect() ?? null;
      const targetRect = attentionTargetRef?.current?.getBoundingClientRect() ?? null;
      const nearby =
        nearField(markRect, e.clientX, e.clientY, MARK_WAKE_PADDING_PX) ||
        nearField(targetRect, e.clientX, e.clientY);

      if (nearby) {
        proximityRef.current = true;
        wake();

        /* When the pointer is beside Wonder, the two W's pass their weight in
           that direction. The dead zone keeps a pointer directly on him from
           producing a nervous left-right twitch. */
        if (markRect) {
          const dx = e.clientX - (markRect.left + markRect.width / 2);
          const threshold = Math.max(markRect.width * 0.42, 34);
          glanceRef.current = dx > threshold ? 1 : dx < -threshold ? -1 : 0;
        }
        return;
      }

      if (proximityRef.current) {
        proximityRef.current = false;
        glanceRef.current = 0;
        scheduleDoze();
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true, capture: true });
    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true });
      clearDoze();
      proximityRef.current = false;
    };
  }, [attentionTargetRef, clearDoze, scheduleDoze, still, wake]);

  /* Keyboard focus must wake Wonder even if no pointer ever moved. Once focus
     leaves, the same short doze delay applies unless the pointer is still near. */
  useEffect(() => {
    if (still) return;
    if (alert) wake();
    else if (!proximityRef.current) scheduleDoze();
  }, [alert, scheduleDoze, still, wake]);

  /* ---- petting: the stroke detector -------------------------------------- *
   *
   * Travel is accumulated with `petTravel` from `face.ts`, which decays what
   * came before by how long ago it happened. So crossing the mark once on the
   * way to the search box adds a little and it drains away; rubbing back and
   * forth adds faster than it drains and trips the threshold. The arithmetic is
   * in `face.ts` rather than here so it can be tested without a pointer.
   *
   * Movement is measured in CSS pixels off the pointer event rather than in
   * canvas units, because the gesture is a physical one: the same wrist
   * movement should pet the mark whether it is rendered at 76px or 136px wide.
   *
   * Leaving the mark drains the accumulator immediately. Without that, a
   * visitor who nudged it three times over a minute while reaching for
   * something else would eventually trip it from outside the element.
   */
  useEffect(() => {
    if (still) return;
    const el = svgRef.current;
    if (!el) return;

    let travel = 0;
    let lastAt = 0;
    let lastX = 0;
    let lastY = 0;
    let has = false;

    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (!has) {
        has = true;
        lastAt = now;
        lastX = e.clientX;
        lastY = e.clientY;
        return;
      }
      const d = Math.hypot(e.clientX - lastX, e.clientY - lastY);
      travel = petTravel(travel, now - lastAt, d);
      lastAt = now;
      lastX = e.clientX;
      lastY = e.clientY;

      if (travel >= PET_TRAVEL_PX) pettedUntilRef.current = now + TIMING.petHold;
    };

    const onLeave = () => {
      travel = 0;
      has = false;
    };

    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      pettedUntilRef.current = 0;
    };
  }, [still]);

  useEffect(() => {
    if (still) return;

    /* Blink. The gap is redrawn every time from `face.ts`'s range, because a
       blink on a fixed interval stops reading as a blink within about three
       repetitions. Suppressed while thinking or satisfied for the reason
       `face.ts` gives: those states are short and busy, and a blink cutting
       into one reads as a dropped frame. */
    let blinkTimer = 0;
    let blinkRelease = 0;

    /**
     * Run one blink, at a duration drawn fresh for it.
     *
     * `blinkScaleRef` is set BEFORE the flag, so the loop's first frame with
     * `blink` true already reads the right scale and the close never starts at
     * the base duration and gets corrected a frame later.
     */
    const fireBlink = () => {
      blinkScaleRef.current = blinkDuration(Math.random()) / BLINK_TOTAL_BASE;
      blinkRef.current = true;
      blinkRelease = window.setTimeout(
        () => {
          blinkRef.current = false;
        },
        (BLINK_CLOSE_MS + BLINK_SHUT_MS) * blinkScaleRef.current
      );
    };

    const scheduleBlink = () => {
      blinkTimer = window.setTimeout(() => {
        /* Sleeping joins thinking and satisfied on the suppression list, for a
           different reason than either: a sleeping face has no business
           blinking, and `face.ts` deliberately does NOT encode that in the
           priority order because reversing blink and sleep there would have
           disturbed a documented rule that exists for its own reasons. This is
           where "asleep does not blink" actually lives. */
        if (!thinkingRef.current && !satisfiedRef.current && !sleepingRef.current) {
          fireBlink();
        }
        scheduleBlink();
      }, blinkGap(Math.random()));
    };
    scheduleBlink();

    /* The scan. `face.ts` models thinking as a sign that flips; `eyePosesFor`
       turns each sign into which of the two letters is the swollen one, so the
       mark passes a slow pulse back and forth while it works. */
    const scanTimer = window.setInterval(() => {
      if (thinkingRef.current) scanRef.current = -scanRef.current;
    }, TIMING.scanFlip);


    return () => {
      window.clearTimeout(blinkTimer);
      window.clearTimeout(blinkRelease);
      window.clearInterval(scanTimer);
      blinkRef.current = false;
    };
  }, [still]);

  /* Satisfied: the falling edge of `thinking`, held for `TIMING.satisfiedHold`.
     Carried over unchanged from the glyph era, and still the only flag derived
     from a transition rather than from a prop directly. */
  const wasThinkingRef = useRef(false);
  useEffect(() => {
    const settled = wasThinkingRef.current && !thinking;
    wasThinkingRef.current = thinking;
    if (still || !settled) return;

    satisfiedRef.current = true;
    const id = window.setTimeout(() => {
      satisfiedRef.current = false;
    }, TIMING.satisfiedHold);
    return () => window.clearTimeout(id);
  }, [thinking, still]);

  /* ---- the one loop --------------------------------------------------- */
  useEffect(() => {
    if (still) return;

    const now0 = performance.now();
    let raf = 0;

    let twL: Tween<Pose> = startTween<Pose>(null, POSES[REST_POSE], REST_POSE, now0, 0);
    let twR: Tween<Pose> = startTween<Pose>(null, POSES[REST_POSE], REST_POSE, now0, 0);
    let twM: Tween<MouthPose> = startTween<MouthPose>(null, MOUTH_POSES[REST_POSE], REST_POSE, now0, 0);

    let rigSelection: WonderRigMode | RigClip = "sleeping";
    let rigModeStarted = now0;
    let rigBlendStarted = now0;
    let rigFrom: WonderRigPose = sampleRigClip("sleeping", 0);
    let rigPose: WonderRigPose = rigFrom;
    /* The ambient clock advances only while personality is eligible. Search,
       sleep and reactions pause it, so returning to idle resumes the approved
       rhythm instead of jumping to a random action after time spent away. */
    let ambientElapsed = 0;

    /* The two ends of the blink's colour shift, read from the RESOLVED theme
       rather than from hex constants, so retinting `src/index.css` retints the
       blink too. Read lazily on the first frame, because computed style is not
       reliably settled at effect time. */
    let restRgb: [number, number, number] | null = null;
    let accentRgb: [number, number, number] | null = null;
    const parseRgb = (s: string): [number, number, number] | null => {
      const m = s.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
      return m ? [+m[1], +m[2], +m[3]] : null;
    };
    const readColours = () => {
      if (restRgb && accentRgb) return;
      const eye = eyeLRef.current;
      const dot = mouthRef.current?.querySelector("rect");
      if (eye) restRgb = parseRgb(getComputedStyle(eye).stroke);
      if (dot) accentRgb = parseRgb(getComputedStyle(dot).fill);
    };
    const mixRgb = (a: number[], b: number[], t: number) =>
      `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)} ${Math.round(a[1] + (b[1] - a[1]) * t)} ${Math.round(
        a[2] + (b[2] - a[2]) * t
      )})`;

    /** Draw one letter. Geometry only: no transform is set, ever. */
    const paint = (
      el: SVGPathElement | null,
      pose: Pose,
      cx: number,
      elapsed: number,
      phase: number,
      damp: number
    ) => {
      if (!el) return;
      /* The slosh multiplies the tweened proportions rather than being added
         to a position, so idle life and expression share one channel and can
         never fight each other for the same pixel. It does not touch `round`:
         a wobble in WHICH SHAPE the letter is would not read as life. */
      const s = sloshAt(elapsed, phase);
      const shaped: Pose = {
        squash: pose.squash * (1 + (s.squash - 1) * damp),
        spread: pose.spread * (1 + (s.spread - 1) * damp),
        weight: pose.weight,
        round: pose.round,
      };
      el.setAttribute("d", eyePath(shaped, cx));
      el.setAttribute("stroke-width", String(STROKE * shaped.weight));

      /* As the letter closes into the O it takes on the accent the mouth dot
         wears, so a blink is a colour beat as well as a shape one. The
         attribute is REMOVED rather than set back to white when the blink
         ends, handing the colour back to the `stroke-white` utility so the
         resting mark stays governed by the theme token. */
      const mix = accentMix(shaped.round);
      if (mix <= 0) {
        if (el.hasAttribute("stroke")) el.removeAttribute("stroke");
      } else if (restRgb && accentRgb) {
        el.setAttribute("stroke", mixRgb(restRgb, accentRgb, mix));
      }
    };

    /**
     * Ramp a scalar toward a target at a fixed rate.
     *
     * The adornments need their own progress, separate from the pose tweens,
     * because they are not poses: a blush has no squash and a zzz has no
     * spread. Deriving their progress from the letters' proportions was tried
     * and is wrong for a concrete reason - `POSES["^"].squash` is 0.6 and
     * `POSES.w.squash` is 0.62, so a satisfied face and a sleeping one are
     * nearly identical on that channel, and the zzz would have appeared every
     * time a search settled.
     *
     * Linear rather than eased. These are opacities and lengths fading in and
     * out over a couple of hundred milliseconds; an ease on top of a fade is a
     * refinement nobody can see.
     */
    let prevNow = now0;
    const approach = (current: number, target: number, dt: number, ms: number): number => {
      if (ms <= 0) return target;
      const step = dt / ms;
      return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
    };

    /* 0 awake, 1 asleep. Drives the zzz only; the letters get there through the
       pose tween like every other state. */
    let sleepT = 0;
    /* 0 untouched, 1 petted. Drives the blush and the underscores. */
    let petT = 0;

    const tick = (now: number) => {
      readColours();
      const dt = Math.min(64, now - prevNow); /* clamped so a backgrounded tab does not jump */
      prevNow = now;

      const forced = forceRef.current;
      const petted = forced ? forced === "petted" : pettedUntilRef.current > now;
      const yawning = forced
        ? forced === "yawn"
        : yawnFromRef.current > 0 && now >= yawnFromRef.current && now < yawnUntilRef.current;

      /* The brain. Everything the mark feels, resolved by `face.ts`.
         A forced state replaces the live flags wholesale rather than being
         OR-ed into them, so the lab shows exactly one thing at a time and never
         a blink laid over a pin. */
      const state: FaceState = forced
        ? {
            still: false,
            satisfied: forced === "satisfied",
            thinking: forced === "thinking",
            scan: scanRef.current,
            blink: forced === "blink",
            alert: forced === "alert",
            sleeping: forced === "sleeping",
            glance: 0,
            petted: forced === "petted",
            yawning: forced === "yawn",
          }
        : {
            still: false,
            satisfied: satisfiedRef.current,
            thinking: thinkingRef.current,
            scan: scanRef.current,
            blink: blinkRef.current,
            alert: alertRef.current,
            sleeping: sleepingRef.current,
            glance: glanceRef.current,
            petted,
            yawning,
          };

      const ambientEligible =
        forceRef.current === null &&
        forceRigClipRef.current === null &&
        forceRigModeRef.current === null &&
        ambientRef.current &&
        wonderAmbientEligible(state);
      if (ambientEligible) ambientElapsed += dt;

      const nextRigSelection =
        forceRigClipRef.current ??
        forceRigModeRef.current ??
        resolveWonderRigSelection(state, ambientElapsed, ambientRef.current && forceRef.current === null);
      if (nextRigSelection !== rigSelection) {
        rigFrom = rigPose;
        rigSelection = nextRigSelection;
        rigModeStarted = now;
        rigBlendStarted = now;
      }
      const rigTarget =
        typeof rigSelection === "string"
          ? sampleRigClip(rigSelection, now - rigModeStarted)
          : sampleRig(rigSelection, now - rigModeStarted);
      const rigBlend = ease("inOutCubic", (now - rigBlendStarted) / RIG_TRANSITION_MS);
      rigPose = lerpRigPose(rigFrom, rigTarget, rigBlend);

      const glyph = resolveEye(state, optsRef.current);
      const [nameL, nameR] = eyePosesFor(glyph, state.petted, state.yawning);
      const nameFace = facePoseFor(glyph, state.petted, state.yawning);

      sleepT = approach(sleepT, glyph === "w" ? 1 : 0, dt, glyph === "w" ? TIMING.sleepIn : TIMING.sleepOut);
      petT = approach(petT, state.petted ? 1 : 0, dt, state.petted ? TIMING.petIn : TIMING.petOut);

      /* One letter lags the other by `EYE_LAG_MS`. Too small to see, too large
         to be missed: two letters deforming on precisely the same frame are one
         animation played twice. */
      /* A blink's duration is drawn per blink, so any tween INTO or OUT OF the
         blink pose carries this frame's scale. Everything else runs at 1. */
      const bs = (a: PoseName, b: PoseName) => (a === "u" || b === "u" ? blinkScaleRef.current : 1);
      if (nameL !== twL.to) twL = startTween(twL, twL.value, nameL, now, 0, bs(twL.to, nameL));
      if (nameR !== twR.to) twR = startTween(twR, twR.value, nameR, now, EYE_LAG_MS, bs(twR.to, nameR));
      if (nameFace !== twM.to) twM = startTween(twM, twM.value, nameFace, now, 0, bs(twM.to, nameFace));

      const poseL = advance(twL, now, POSES[nameL], lerpPose);
      const poseR = advance(twR, now, POSES[nameR], lerpPose);
      const mouth = advance(twM, now, MOUTH_POSES[nameFace], lerpMouth);

      const elapsed = now - now0;
      const damp = SLOSH_SCALE[nameFace];
      paint(eyeLRef.current, poseL, EYE_CX_L, elapsed, 0, damp);
      paint(eyeRRef.current, poseR, EYE_CX_R, elapsed, SLOSH_EYE_PHASE, damp);

      /* Paint the hierarchy after the shape paths. Root motion carries the
         complete face; the eye and mouth nodes then add their small delayed
         reactions in local space. Every spatial animation passes through the
         same rig transform instead of competing CSS and SVG transforms. */
      rigRootRef.current?.setAttribute("transform", rigTransform(rigPose.root, MOUTH_CX, BASELINE));
      eyeLGroupRef.current?.setAttribute("transform", rigTransform(rigPose.leftEye, EYE_CX_L, BASELINE));
      eyeRGroupRef.current?.setAttribute("transform", rigTransform(rigPose.rightEye, EYE_CX_R, BASELINE));

      /* The expression scale and the mouth bone share one pivot. Combining
         them before writing the attribute keeps the dot attached while Wonder
         floats, yawns or bounces. */
      const m = mouthRef.current;
      if (m) {
        const mouthRig = {
          ...rigPose.mouth,
          scaleX: rigPose.mouth.scaleX * mouth.scale,
          scaleY: rigPose.mouth.scaleY * mouth.scale,
        };
        m.setAttribute("transform", rigTransform(mouthRig, MOUTH_CX, BASELINE));
      }

      /* The mouth OPENS. One rect, one channel: `mouthGeometry` turns `hollow`
         into a width, a corner radius and the two opacities that trade the
         solid fill for an outline. At 0 it is the full stop the mark has always
         had; at 1 it is a hollow o at exactly the dot's own size. Nothing here
         moves the mouth or grows it - `x` is recomputed only because the rect
         narrows about its own centre. */
      /* Where we are through the yawn, 0 to 1. Taken from the two timestamps
         rather than from a ramp, because the yawn's shape is a CURVE over its
         own duration and not a fade between two states: it has to know it is a
         third of the way in, not merely that it is happening. */
      const yawnT =
        forced === "yawn"
          ? Math.min(1, Math.max(0, (now - rigModeStarted) / YAWN_TOTAL_MS))
          : yawning && yawnUntilRef.current > yawnFromRef.current
            ? (now - yawnFromRef.current) / (yawnUntilRef.current - yawnFromRef.current)
            : 0;

      const rect = mouthRectRef.current;
      if (rect) {
        const g = mouthGeometry(mouth.hollow, yawnStretch(yawnT));
        /* ALL FOUR box attributes, every frame.
           This wrote `x` and `width` and not `y` and `height`, so the rect kept
           its full 2.15 height while the width narrowed to 1.505: a ring taller
           than it is wide, which is a ZERO and not an o. `mouthGeometry` had
           been returning the right numbers the whole time and two of them were
           being thrown away. */
        rect.setAttribute("x", String(g.x));
        rect.setAttribute("y", String(g.y));
        rect.setAttribute("width", String(g.width));
        rect.setAttribute("height", String(g.height));
        rect.setAttribute("rx", String(g.rx));
        rect.setAttribute("ry", String(g.ry));
        rect.setAttribute("fill-opacity", String(g.fillOpacity));
        rect.setAttribute("stroke-opacity", String(g.strokeOpacity));
        rect.setAttribute("stroke-width", String(g.strokeWidth));
      }

      /* ---- the adornments -------------------------------------------- */

      /* Blush and rules share `petT`, so they arrive and leave together. Two
         separate ramps would let one linger behind the other, and the pair is
         one gesture. */
      const blushEl = blushRef.current;
      if (blushEl) blushEl.setAttribute("opacity", String(BLUSH_PEAK_OPACITY * petT));

      const spans = underscoreSpans(petT);
      for (const [i, ref] of [ruleLRef, ruleRRef].entries()) {
        const line = ref.current;
        if (!line) continue;
        line.setAttribute("x1", String(spans[i].x1));
        line.setAttribute("x2", String(spans[i].x2));
        line.setAttribute("opacity", String(petT));
      }

      /* The zzz. Each z runs its own arc off one shared clock, and the whole
         group is multiplied by `sleepT` so waking takes them with it rather
         than leaving one hanging in the air. */
      for (let i = 0; i < ZZZ_COUNT; i++) {
        const el = zzzRefs.current[i];
        if (!el) continue;
        const z = zzzAt(elapsed, i);
        const o = z.visible ? z.opacity * sleepT : 0;
        el.setAttribute("opacity", String(o));
        /* Skip the transform entirely when it cannot be seen. Three text nodes
           being re-laid-out every frame for an invisible result is the kind of
           cost that only shows up on the machines least able to afford it. */
        if (o > 0.001) {
          /* The text sits at the origin and the transform carries both its
             position and its growth, so one attribute does the work of three
             and the scale is automatically about the z's own anchor. */
          el.setAttribute("transform", `translate(${z.x} ${z.y}) scale(${z.scale})`);
        }
      }

      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [still]);

  /* Under reduced motion the mark is drawn once, at rest, and no timer and no
     frame loop is ever started. `face.ts` short-circuits every other flag to
     `REST` in that case, so this is the same wordmark the brain would resolve;
     it just never asks again. */
  /* Indexed by `REST_POSE`, not by `face.ts`'s `REST`. They are both "W", but
     `REST` is typed `EyeGlyph`, which includes the two scan directions that
     have no pose of their own, so indexing the pose table with it is a type
     error rather than a lucky lookup. */
  const restL = eyePath(POSES[REST_POSE], EYE_CX_L);
  const restR = eyePath(POSES[REST_POSE], EYE_CX_R);

  return (
    <h1
      /* The site's name is announced, never an expression: a screen reader must
         not say anything different depending on what the mark happens to be
         doing when it reaches this element. */
      aria-label={SITE_NAME}
      className="ws-mark select-none pb-2"
    >
      <div aria-hidden="true" style={{ display: "inline-block", position: "relative" }}>
        <svg ref={svgRef} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`} aria-hidden="true" className={className}>
          <g ref={rigRootRef}>
            {/* BLUSH FIRST, so it sits behind the letters. A blush is under the
                skin; drawn over the strokes it would read as a highlighter pen.
                Starts at zero opacity and is only ever raised by the loop. */}
            <g ref={blushRef} opacity={0} fill={BLUSH[blush]}>
              {blushCentres().map(([cx, cy]) => (
                <ellipse key={cx} cx={cx} cy={cy} rx={BLUSH_RX} ry={BLUSH_RY} />
              ))}
            </g>

            {/* Each W has its own bone. The path supplies expression geometry;
                the containing group supplies local follow-through. */}
            <g className="fill-none stroke-white" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
              <g ref={eyeLGroupRef}>
                <path ref={eyeLRef} d={restL} />
              </g>
              <g ref={eyeRGroupRef}>
                <path ref={eyeRRef} d={restR} />
              </g>
            </g>

            {/* The mouth is the fourth rig node. Its expression morph and its
                local motion are composed onto this one group every frame. */}
            <g ref={mouthRef}>
              <rect
                ref={mouthRectRef}
                className={mouthTone === "accent" ? "fill-emerald-500 stroke-emerald-500" : "fill-white stroke-white"}
                x={mouthGeometry(0).x}
                y={mouthGeometry(0).y}
                width={mouthGeometry(0).width}
                height={mouthGeometry(0).height}
                rx={mouthGeometry(0).rx}
                fillOpacity={1}
                strokeOpacity={0}
                strokeWidth={mouthGeometry(0).strokeWidth}
              />
            </g>

            {/* The underscores share the root because they are an expression
                emitted by Wonder, not independent floating scenery. */}
            <g stroke={BLUSH[blush]} strokeWidth={UNDERSCORE_STROKE} strokeLinecap="round">
              <line ref={ruleLRef} x1={EYE_CX_L} x2={EYE_CX_L} y1={UNDERSCORE_Y} y2={UNDERSCORE_Y} opacity={0} />
              <line ref={ruleRRef} x1={EYE_CX_R} x2={EYE_CX_R} y1={UNDERSCORE_Y} y2={UNDERSCORE_Y} opacity={0} />
            </g>
          </g>
        </svg>
        {/* Keep the floating glyphs inside an actual viewport, not SVG overflow
            that mobile WebKit can clip when an ancestor has a drop shadow.
            The face and its pointer target keep their original 35 by 12 box. */}
        <svg
          aria-hidden="true"
          viewBox={`${ZZZ_VIEWPORT.x} ${ZZZ_VIEWPORT.y} ${ZZZ_VIEWPORT.width} ${ZZZ_VIEWPORT.height}`}
          style={{
            position: "absolute",
            pointerEvents: "none",
            left: 0,
            top: `${ZZZ_VIEWPORT.y / CANVAS_H * 100}%`,
            width: `${ZZZ_VIEWPORT.width / CANVAS_W * 100}%`,
            height: `${ZZZ_VIEWPORT.height / CANVAS_H * 100}%`,
            overflow: "visible",
          }}
        >
          {/* The zzz. Three text nodes at the origin, positioned entirely by
              their transform. They inherit the mark's own face from `.ws-mark`
              on the heading, so the z's are set in the same typeface as the
              letters they are drifting off. */}
          <g className="fill-white">
            {Array.from({ length: ZZZ_COUNT }, (_, i) => (
              <text
                key={i}
                ref={(el) => {
                  zzzRefs.current[i] = el;
                }}
                x={0}
                y={0}
                fontSize={3.1}
                opacity={0}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                z
              </text>
            ))}
          </g>
        </svg>
      </div>
    </h1>
  );
};

export default VectorMark;
