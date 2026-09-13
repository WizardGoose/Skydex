import { frame } from "./rig";
import { resolveRigMode } from "./rig";
import type { RigClip, WonderRigMode, WonderRigState } from "./rig";

export type PersonalityClipName = "curious" | "perk" | "fidget" | "stretch";

/** Wizard-approved micro-actions shared by the live mark and its private review board. */
export const PERSONALITY_CLIPS: Record<PersonalityClipName, RigClip> = {
  curious: {
    duration: 2600,
    loop: true,
    keyframes: [
      frame(0),
      frame(
        0.28,
        {
          root: { x: 0.06, y: -0.2, rotation: 0.82, scaleX: 0.996, scaleY: 1.01 },
          leftEye: { x: -0.04, y: -0.04, rotation: 0.5, scaleY: 1.018 },
          rightEye: { x: 0.1, y: 0.035, rotation: 0.14, scaleY: 0.99 },
          mouth: { x: 0.07, y: 0.025 },
        },
        "outCubic"
      ),
      frame(0.62, {
        root: { x: 0.1, y: -0.28, rotation: 0.95, scaleX: 0.992, scaleY: 1.015 },
        leftEye: { x: -0.06, y: -0.065, rotation: 0.62, scaleY: 1.025 },
        rightEye: { x: 0.13, y: 0.05, rotation: 0.2, scaleY: 0.985 },
        mouth: { x: 0.1, y: 0.04, scaleX: 0.96, scaleY: 0.96 },
      }),
      frame(0.82, {
        root: { x: 0.035, y: -0.08, rotation: 0.3, scaleX: 1.004, scaleY: 0.998 },
        leftEye: { y: 0.015, rotation: 0.08 },
        rightEye: { x: 0.035, y: -0.015, rotation: -0.12 },
        mouth: { x: 0.025 },
      }),
      frame(1),
    ],
  },
  perk: {
    duration: 1600,
    loop: true,
    keyframes: [
      frame(0),
      frame(
        0.18,
        {
          root: { y: 0.14, scaleX: 1.025, scaleY: 0.975 },
          leftEye: { y: 0.035, rotation: -0.18 },
          rightEye: { y: 0.035, rotation: 0.18 },
          mouth: { y: 0.055, scaleX: 0.96, scaleY: 0.96 },
        },
        "inQuad"
      ),
      frame(
        0.42,
        {
          root: { y: -0.64, scaleX: 0.968, scaleY: 1.055 },
          leftEye: { x: -0.06, y: -0.12, rotation: -0.62, scaleY: 1.035 },
          rightEye: { x: 0.06, y: -0.12, rotation: 0.62, scaleY: 1.035 },
          mouth: { y: -0.16, scaleX: 1.08, scaleY: 1.08 },
        },
        "outCubic"
      ),
      frame(0.68, {
        root: { y: 0.09, scaleX: 1.018, scaleY: 0.985 },
        leftEye: { y: 0.025, rotation: 0.16 },
        rightEye: { y: 0.025, rotation: -0.16 },
        mouth: { y: 0.04, scaleX: 0.98, scaleY: 0.98 },
      }),
      frame(1, {}, "outCubic"),
    ],
  },
  fidget: {
    duration: 2200,
    loop: true,
    keyframes: [
      frame(0),
      frame(0.2, {
        root: { x: -0.16, y: -0.08, rotation: -0.72, scaleX: 1.012, scaleY: 0.995 },
        leftEye: { x: -0.07, y: 0.03, rotation: -0.38 },
        rightEye: { x: 0.02, y: -0.04, rotation: -0.12 },
        mouth: { x: -0.06, y: 0.02 },
      }),
      frame(0.4, {
        root: { x: 0.18, y: -0.18, rotation: 0.78, scaleX: 0.99, scaleY: 1.012 },
        leftEye: { x: -0.02, y: -0.045, rotation: 0.14 },
        rightEye: { x: 0.08, y: 0.025, rotation: 0.42 },
        mouth: { x: 0.065, y: -0.035 },
      }),
      frame(0.58, {
        root: { x: -0.09, y: -0.06, rotation: -0.4, scaleX: 1.006, scaleY: 0.998 },
        leftEye: { x: -0.035, y: 0.02, rotation: -0.18 },
        rightEye: { x: 0.015, y: -0.025, rotation: -0.08 },
        mouth: { x: -0.03, y: 0.015 },
      }),
      frame(0.78, {
        root: { x: 0.05, y: -0.12, rotation: 0.22, scaleX: 0.998, scaleY: 1.005 },
        leftEye: { y: -0.02, rotation: 0.08 },
        rightEye: { x: 0.025, y: 0.01, rotation: 0.14 },
        mouth: { x: 0.02, y: -0.02 },
      }),
      frame(1),
    ],
  },
  stretch: {
    duration: 3000,
    loop: true,
    keyframes: [
      frame(0),
      frame(
        0.2,
        {
          root: { y: 0.18, scaleX: 1.035, scaleY: 0.97 },
          leftEye: { y: 0.05, rotation: 0.2 },
          rightEye: { y: 0.05, rotation: -0.2 },
          mouth: { y: 0.06, scaleX: 0.945, scaleY: 0.945 },
        },
        "inOutCubic"
      ),
      frame(
        0.5,
        {
          root: { y: -0.64, rotation: -0.18, scaleX: 0.952, scaleY: 1.085 },
          leftEye: { x: -0.08, y: -0.14, rotation: -0.82, scaleY: 1.05 },
          rightEye: { x: 0.08, y: -0.1, rotation: 0.72, scaleY: 1.04 },
          mouth: { y: -0.18, scaleX: 1.08, scaleY: 1.12 },
        },
        "outCubic"
      ),
      frame(0.72, {
        root: { y: -0.3, rotation: 0.16, scaleX: 0.98, scaleY: 1.035 },
        leftEye: { x: -0.035, y: -0.07, rotation: -0.3 },
        rightEye: { x: 0.035, y: -0.055, rotation: 0.26 },
        mouth: { y: -0.08, scaleX: 1.035, scaleY: 1.05 },
      }),
      frame(1, {}, "outBack"),
    ],
  },
};

export interface WonderAmbientStep {
  id: "attentive" | PersonalityClipName;
  /** The face pinned by the review board. Live use keeps the real face state. */
  face: "rest" | "alert";
  ms: number;
  rig?: "attentive";
  personality?: PersonalityClipName;
}

/**
 * The exact quiet/action rhythm Wizard approved on the Wonder motion board.
 * It lives beside the clips now that the sequence is production behaviour;
 * the board maps this table back into forced preview states instead of keeping
 * a second copy that could drift.
 */
export const WONDER_AMBIENT_STEPS: readonly WonderAmbientStep[] = [
  { id: "attentive", face: "alert", rig: "attentive", ms: 1800 },
  { id: "curious", face: "rest", personality: "curious", ms: PERSONALITY_CLIPS.curious.duration },
  { id: "attentive", face: "alert", rig: "attentive", ms: 1200 },
  { id: "fidget", face: "rest", personality: "fidget", ms: PERSONALITY_CLIPS.fidget.duration },
  { id: "attentive", face: "alert", rig: "attentive", ms: 1000 },
  { id: "perk", face: "alert", personality: "perk", ms: PERSONALITY_CLIPS.perk.duration },
  { id: "attentive", face: "alert", rig: "attentive", ms: 1500 },
  { id: "stretch", face: "rest", personality: "stretch", ms: PERSONALITY_CLIPS.stretch.duration },
];

export const WONDER_AMBIENT_DURATION_MS = WONDER_AMBIENT_STEPS.reduce((total, step) => total + step.ms, 0);

export interface WonderAmbientMoment {
  step: WonderAmbientStep;
  elapsedMs: number;
  selection: WonderRigMode | RigClip;
}

/** Resolve one point in the approved loop, including negative test clocks. */
export const wonderAmbientAt = (elapsedMs: number): WonderAmbientMoment => {
  const bounded = ((elapsedMs % WONDER_AMBIENT_DURATION_MS) + WONDER_AMBIENT_DURATION_MS) % WONDER_AMBIENT_DURATION_MS;
  let cursor = 0;

  for (const step of WONDER_AMBIENT_STEPS) {
    const end = cursor + step.ms;
    if (bounded < end) {
      return {
        step,
        elapsedMs: bounded - cursor,
        selection: step.personality ? PERSONALITY_CLIPS[step.personality] : step.rig ?? "attentive",
      };
    }
    cursor = end;
  }

  // The modulo above makes this unreachable; the return keeps the function
  // total if the table is ever emptied during development.
  const step = WONDER_AMBIENT_STEPS[0];
  return { step, elapsedMs: 0, selection: "attentive" };
};

/**
 * Ambient personality belongs only to an awake, unfocused idle beat. Every
 * meaningful reaction keeps the existing rig priority, and focused search
 * remains a steady attentive state rather than moving under the user's eyes.
 */
export const wonderAmbientEligible = (state: WonderRigState): boolean =>
  resolveRigMode(state) === "attentive" && !state.alert;

export const resolveWonderRigSelection = (
  state: WonderRigState,
  ambientElapsedMs: number,
  ambientEnabled: boolean
): WonderRigMode | RigClip => {
  const mode = resolveRigMode(state);
  if (!ambientEnabled || !wonderAmbientEligible(state)) return mode;
  return wonderAmbientAt(ambientElapsedMs).selection;
};
