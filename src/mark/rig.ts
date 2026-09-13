import { ease, lerp } from "./pose";
import type { EaseName } from "./pose";
import { YAWN_TOTAL_MS } from "./face";

/**
 * The spatial rig for Wonder's W.W face.
 *
 * `pose.ts` owns the shape of each W. This file owns where the character's
 * parts are in relation to one another. Keeping those jobs separate lets the
 * letters squash and morph without baking every animation into a new path,
 * while the rig supplies the lift, overlap and follow-through that make those
 * shapes feel like one small character.
 */

export const RIG_PARTS = ["root", "leftEye", "rightEye", "mouth"] as const;
export type RigPart = (typeof RIG_PARTS)[number];

export interface RigTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export type WonderRigPose = Record<RigPart, RigTransform>;

export type WonderRigMode =
  | "still"
  | "attentive"
  | "sleeping"
  | "thinking"
  | "satisfied"
  | "petted"
  | "yawning";

export interface WonderRigState {
  still: boolean;
  alert: boolean;
  sleeping: boolean;
  thinking: boolean;
  satisfied: boolean;
  petted: boolean;
  yawning: boolean;
}

export interface RigKeyframe {
  /** Normalised position in the clip, from 0 to 1. */
  at: number;
  pose: WonderRigPose;
  /** Curve used to arrive at this keyframe. */
  ease: EaseName;
}

export interface RigClip {
  duration: number;
  loop: boolean;
  keyframes: readonly RigKeyframe[];
}

/** Cross-fade between clips instead of snapping the hierarchy to a new pose. */
export const RIG_TRANSITION_MS = 240;

export type RigPoseSeed = Partial<Record<RigPart, Partial<RigTransform>>>;

export const IDENTITY_TRANSFORM: RigTransform = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
};

const node = (over: Partial<RigTransform> = {}): RigTransform => ({ ...IDENTITY_TRANSFORM, ...over });

export const rigPose = (over: RigPoseSeed = {}): WonderRigPose => ({
  root: node(over.root),
  leftEye: node(over.leftEye),
  rightEye: node(over.rightEye),
  mouth: node(over.mouth),
});

export const frame = (at: number, over: RigPoseSeed = {}, curve: EaseName = "inOutSine"): RigKeyframe => ({
  at,
  pose: rigPose(over),
  ease: curve,
});

const ATTENTIVE_START: RigPoseSeed = {
  root: { y: 0.12, rotation: -0.24, scaleX: 0.997, scaleY: 1.003 },
  leftEye: { y: 0.045, rotation: -0.34 },
  rightEye: { y: -0.03, rotation: 0.28 },
  mouth: { y: 0.03 },
};

const SLEEP_START: RigPoseSeed = {
  root: { y: 0.14, rotation: -0.12, scaleX: 1.006, scaleY: 0.994 },
  leftEye: { y: 0.025, rotation: -0.12 },
  rightEye: { y: 0.045, rotation: 0.12 },
  mouth: { y: 0.04, scaleX: 0.985, scaleY: 0.985 },
};

/**
 * Reusable clips rather than state-specific arithmetic in the renderer.
 * Every loop begins and ends on the same pose, so switching clips never has a
 * hidden seam and future expressions can be added without another animation
 * loop growing inside the React component.
 */
export const RIG_CLIPS: Record<WonderRigMode, RigClip> = {
  still: {
    duration: 1,
    loop: false,
    keyframes: [frame(0), frame(1)],
  },
  attentive: {
    duration: 3600,
    loop: true,
    keyframes: [
      frame(0, ATTENTIVE_START),
      frame(0.48, {
        root: { y: -0.58, rotation: 0.34, scaleX: 1.009, scaleY: 0.997 },
        leftEye: { y: -0.11, rotation: 0.62 },
        rightEye: { y: 0.055, rotation: -0.5 },
        mouth: { y: -0.12 },
      }),
      frame(1, ATTENTIVE_START),
    ],
  },
  sleeping: {
    duration: 5200,
    loop: true,
    keyframes: [
      frame(0, SLEEP_START),
      frame(0.5, {
        root: { y: -0.02, rotation: 0.1, scaleX: 0.995, scaleY: 1.012 },
        leftEye: { y: -0.025, rotation: 0.12 },
        rightEye: { y: -0.045, rotation: -0.12 },
        mouth: { y: -0.035, scaleX: 1.015, scaleY: 1.015 },
      }),
      frame(1, SLEEP_START),
    ],
  },
  thinking: {
    duration: 900,
    loop: true,
    keyframes: [
      frame(0, {
        root: { y: -0.12, rotation: -0.32 },
        leftEye: { x: -0.06, y: 0.04, rotation: -0.4 },
        rightEye: { x: 0.04, y: -0.05, rotation: 0.28 },
        mouth: { x: -0.025, y: 0.03 },
      }),
      frame(0.5, {
        root: { y: -0.28, rotation: 0.32 },
        leftEye: { x: -0.04, y: -0.05, rotation: 0.28 },
        rightEye: { x: 0.06, y: 0.04, rotation: -0.4 },
        mouth: { x: 0.025, y: -0.035 },
      }),
      frame(1, {
        root: { y: -0.12, rotation: -0.32 },
        leftEye: { x: -0.06, y: 0.04, rotation: -0.4 },
        rightEye: { x: 0.04, y: -0.05, rotation: 0.28 },
        mouth: { x: -0.025, y: 0.03 },
      }),
    ],
  },
  satisfied: {
    duration: 520,
    loop: false,
    keyframes: [
      frame(0),
      frame(
        0.3,
        {
          root: { y: -0.58, scaleX: 0.975, scaleY: 1.035 },
          leftEye: { y: -0.08, rotation: -0.45 },
          rightEye: { y: -0.08, rotation: 0.45 },
          mouth: { y: -0.12, scaleX: 1.04, scaleY: 1.04 },
        },
        "outCubic"
      ),
      frame(
        0.62,
        {
          root: { y: 0.1, scaleX: 1.018, scaleY: 0.985 },
          leftEye: { y: 0.03 },
          rightEye: { y: 0.03 },
          mouth: { y: 0.05 },
        },
        "inQuad"
      ),
      frame(1, {}, "outBack"),
    ],
  },
  petted: {
    duration: 1100,
    loop: true,
    keyframes: [
      frame(0, {
        root: { y: -0.08, rotation: -0.7, scaleX: 1.012, scaleY: 0.995 },
        leftEye: { y: 0.02, rotation: -0.3 },
        rightEye: { y: -0.04, rotation: -0.12 },
        mouth: { x: -0.04, y: -0.02 },
      }),
      frame(0.5, {
        root: { y: -0.18, rotation: 0.7, scaleX: 0.996, scaleY: 1.012 },
        leftEye: { y: -0.04, rotation: 0.12 },
        rightEye: { y: 0.02, rotation: 0.3 },
        mouth: { x: 0.04, y: -0.06 },
      }),
      frame(1, {
        root: { y: -0.08, rotation: -0.7, scaleX: 1.012, scaleY: 0.995 },
        leftEye: { y: 0.02, rotation: -0.3 },
        rightEye: { y: -0.04, rotation: -0.12 },
        mouth: { x: -0.04, y: -0.02 },
      }),
    ],
  },
  yawning: {
    duration: YAWN_TOTAL_MS,
    loop: false,
    keyframes: [
      frame(0, SLEEP_START),
      frame(
        0.34,
        {
          root: { y: -0.46, scaleX: 0.97, scaleY: 1.045 },
          leftEye: { y: -0.08, rotation: -0.35 },
          rightEye: { y: -0.08, rotation: 0.35 },
          mouth: { y: -0.16, scaleX: 1.06, scaleY: 1.12 },
        },
        "outCubic"
      ),
      frame(
        0.72,
        {
          root: { y: 0.16, scaleX: 1.02, scaleY: 0.975 },
          leftEye: { y: 0.04 },
          rightEye: { y: 0.04 },
          mouth: { y: 0.08, scaleX: 0.98, scaleY: 0.96 },
        },
        "inOutCubic"
      ),
      frame(1, {}, "outBack"),
    ],
  },
};

export const resolveRigMode = (state: WonderRigState): WonderRigMode => {
  if (state.still) return "still";
  if (state.petted) return "petted";
  if (state.yawning) return "yawning";
  if (state.satisfied) return "satisfied";
  if (state.thinking) return "thinking";
  if (state.sleeping && !state.alert) return "sleeping";
  return "attentive";
};

export const lerpRigTransform = (a: RigTransform, b: RigTransform, t: number): RigTransform => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  rotation: lerp(a.rotation, b.rotation, t),
  scaleX: lerp(a.scaleX, b.scaleX, t),
  scaleY: lerp(a.scaleY, b.scaleY, t),
});

export const lerpRigPose = (a: WonderRigPose, b: WonderRigPose, t: number): WonderRigPose => ({
  root: lerpRigTransform(a.root, b.root, t),
  leftEye: lerpRigTransform(a.leftEye, b.leftEye, t),
  rightEye: lerpRigTransform(a.rightEye, b.rightEye, t),
  mouth: lerpRigTransform(a.mouth, b.mouth, t),
});

export const sampleRig = (clip: RigClip, elapsedMs: number): WonderRigPose => {
  const bounded = clip.loop
    ? ((elapsedMs % clip.duration) + clip.duration) % clip.duration
    : Math.min(clip.duration, Math.max(0, elapsedMs));
  const at = clip.duration <= 0 ? 1 : bounded / clip.duration;
  const frames = clip.keyframes;

  let right = frames.findIndex((candidate) => candidate.at >= at);
  if (right < 0) right = frames.length - 1;
  if (right === 0) return frames[0].pose;

  const a = frames[right - 1];
  const b = frames[right];
  const width = b.at - a.at;
  const local = width <= 0 ? 1 : (at - a.at) / width;
  return lerpRigPose(a.pose, b.pose, ease(b.ease, local));
};

export const sampleRigClip = (mode: WonderRigMode, elapsedMs: number): WonderRigPose =>
  sampleRig(RIG_CLIPS[mode], elapsedMs);

const trim = (value: number): string => {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
};

/** An SVG transform around a named rig node's pivot. */
export const rigTransform = (transform: RigTransform, pivotX: number, pivotY: number): string =>
  `translate(${trim(transform.x)} ${trim(transform.y)}) translate(${trim(pivotX)} ${trim(pivotY)}) ` +
  `rotate(${trim(transform.rotation)}) scale(${trim(transform.scaleX)} ${trim(transform.scaleY)}) ` +
  `translate(${trim(-pivotX)} ${trim(-pivotY)})`;
