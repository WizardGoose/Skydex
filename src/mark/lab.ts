import type { ForcedState } from "./VectorMark";
import { YAWN_TOTAL_MS } from "./face";
import { WONDER_AMBIENT_STEPS } from "./personality";
import type { PersonalityClipName } from "./personality";
import { RIG_CLIPS } from "./rig";
import type { WonderRigMode } from "./rig";

export interface MotionStep {
  force: ForcedState;
  ms: number;
  rig?: WonderRigMode;
  personality?: PersonalityClipName;
}

export interface WonderLabPreview {
  id: string;
  title: string;
  note: string;
  group: "current" | "personality";
  steps: readonly MotionStep[];
}

const one = (force: ForcedState): readonly MotionStep[] => [{ force, ms: 1 }];

const ambientSteps: readonly MotionStep[] = WONDER_AMBIENT_STEPS.map((step) => ({
  force: step.face,
  ms: step.ms,
  ...(step.rig ? { rig: step.rig } : {}),
  ...(step.personality ? { personality: step.personality } : {}),
}));

/** The exact review set shown by the private development-only motion board. */
export const WONDER_LAB_PREVIEWS: readonly WonderLabPreview[] = [
  {
    id: "sleep",
    title: "Sleep",
    note: `w.w · ${(RIG_CLIPS.sleeping.duration / 1000).toFixed(1)} s breath + drifting z's`,
    group: "current",
    steps: one("sleeping"),
  },
  {
    id: "attentive",
    title: "Attentive",
    note: `W.W · ${(RIG_CLIPS.attentive.duration / 1000).toFixed(1)} s float`,
    group: "current",
    steps: one("alert"),
  },
  {
    id: "thinking",
    title: "Thinking",
    note: `<.< / >.> · ${(RIG_CLIPS.thinking.duration / 1000).toFixed(1)} s work loop`,
    group: "current",
    steps: one("thinking"),
  },
  {
    id: "petted",
    title: "Petted",
    note: `WoW · ${(RIG_CLIPS.petted.duration / 1000).toFixed(1)} s sway`,
    group: "current",
    steps: one("petted"),
  },
  {
    id: "blink",
    title: "Blink",
    note: "W.W → w.w → W.W · repeated",
    group: "current",
    steps: [
      { force: "rest", ms: 1500 },
      { force: "blink", ms: 240 },
    ],
  },
  {
    id: "result",
    title: "Result",
    note: "W.W → ^.^ · lift and landing",
    group: "current",
    steps: [
      { force: "alert", ms: 1700 },
      { force: "satisfied", ms: 600 },
    ],
  },
  {
    id: "yawn",
    title: "Yawn",
    note: "w.w → ^o^ → W.W · full sequence",
    group: "current",
    steps: [
      { force: "sleeping", ms: 1200 },
      { force: "yawn", ms: YAWN_TOTAL_MS },
      { force: "alert", ms: 900 },
    ],
  },
  {
    id: "wake",
    title: "Wake / doze",
    note: "w.w ↔ W.W · transition check",
    group: "current",
    steps: [
      { force: "sleeping", ms: 1900 },
      { force: "alert", ms: 2200 },
    ],
  },
  {
    id: "curious",
    title: "Curious",
    note: "W.W · one side leads the question",
    group: "personality",
    steps: [{ force: "rest", personality: "curious", ms: 1 }],
  },
  {
    id: "perk",
    title: "Perk up",
    note: "W.W · quick anticipation and spring",
    group: "personality",
    steps: [{ force: "alert", personality: "perk", ms: 1 }],
  },
  {
    id: "fidget",
    title: "Fidget",
    note: "W.W · uneven two-beat shuffle",
    group: "personality",
    steps: [{ force: "rest", personality: "fidget", ms: 1 }],
  },
  {
    id: "stretch",
    title: "Stretch",
    note: "W.W · squash, reach, exhale",
    group: "personality",
    steps: [{ force: "rest", personality: "stretch", ms: 1 }],
  },
  {
    id: "ambient",
    title: "Ambient mix",
    note: "Approved rhythm · action, pause, action",
    group: "personality",
    steps: ambientSteps,
  },
] as const;
