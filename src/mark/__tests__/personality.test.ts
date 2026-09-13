import { describe, expect, it } from "vitest";
import {
  PERSONALITY_CLIPS,
  WONDER_AMBIENT_DURATION_MS,
  WONDER_AMBIENT_STEPS,
  resolveWonderRigSelection,
  wonderAmbientAt,
} from "../personality";
import { RIG_PARTS, sampleRig } from "../rig";
import type { PersonalityClipName } from "../personality";
import type { WonderRigState } from "../rig";

const CLIP_NAMES = Object.keys(PERSONALITY_CLIPS) as PersonalityClipName[];

describe("Wonder's approved personality clips", () => {
  it("keeps every preview transform finite and inside Wonder's small canvas", () => {
    for (const name of CLIP_NAMES) {
      const clip = PERSONALITY_CLIPS[name];
      for (let i = 0; i <= 80; i++) {
        const pose = sampleRig(clip, (clip.duration * i) / 80);
        for (const part of RIG_PARTS) {
          const transform = pose[part];
          expect(Object.values(transform).every(Number.isFinite), `${name}.${part} is finite`).toBe(true);
          expect(Math.abs(transform.x), `${name}.${part}.x`).toBeLessThanOrEqual(0.2);
          expect(Math.abs(transform.y), `${name}.${part}.y`).toBeLessThanOrEqual(0.7);
          expect(Math.abs(transform.rotation), `${name}.${part}.rotation`).toBeLessThanOrEqual(1);
          expect(transform.scaleX, `${name}.${part}.scaleX`).toBeGreaterThan(0.94);
          expect(transform.scaleX, `${name}.${part}.scaleX`).toBeLessThan(1.14);
          expect(transform.scaleY, `${name}.${part}.scaleY`).toBeGreaterThan(0.94);
          expect(transform.scaleY, `${name}.${part}.scaleY`).toBeLessThan(1.14);
        }
      }
    }
  });

  it("loops every candidate without a hidden seam", () => {
    for (const name of CLIP_NAMES) {
      const clip = PERSONALITY_CLIPS[name];
      expect(sampleRig(clip, clip.duration)).toEqual(sampleRig(clip, 0));
    }
  });

  it("gives each candidate its own readable physical idea", () => {
    const curiousClip = PERSONALITY_CLIPS.curious;
    const perkClip = PERSONALITY_CLIPS.perk;
    const fidgetClip = PERSONALITY_CLIPS.fidget;
    const stretchClip = PERSONALITY_CLIPS.stretch;
    const curious = sampleRig(curiousClip, curiousClip.duration * 0.62);
    const perk = sampleRig(perkClip, perkClip.duration * 0.42);
    const fidgetLeft = sampleRig(fidgetClip, fidgetClip.duration * 0.2);
    const fidgetRight = sampleRig(fidgetClip, fidgetClip.duration * 0.4);
    const stretch = sampleRig(stretchClip, stretchClip.duration * 0.5);

    expect(curious.root.rotation).toBeGreaterThan(0.8);
    expect(curious.leftEye.y).not.toBeCloseTo(curious.rightEye.y, 4);
    expect(perk.root.y).toBeLessThan(-0.6);
    expect(perk.root.scaleY).toBeGreaterThan(1.04);
    expect(fidgetLeft.root.x).toBeLessThan(0);
    expect(fidgetRight.root.x).toBeGreaterThan(0);
    expect(stretch.root.scaleY).toBeGreaterThan(1.07);
    expect(stretch.root.scaleX).toBeLessThan(0.97);
  });

  it("keeps the approved ambient order and 14.9 second rhythm in one table", () => {
    expect(WONDER_AMBIENT_STEPS.map((step) => step.id)).toEqual([
      "attentive",
      "curious",
      "attentive",
      "fidget",
      "attentive",
      "perk",
      "attentive",
      "stretch",
    ]);
    expect(WONDER_AMBIENT_STEPS.map((step) => step.ms)).toEqual([1800, 2600, 1200, 2200, 1000, 1600, 1500, 3000]);
    expect(WONDER_AMBIENT_DURATION_MS).toBe(14_900);
    expect(wonderAmbientAt(1800).step.id).toBe("curious");
    expect(wonderAmbientAt(WONDER_AMBIENT_DURATION_MS).step.id).toBe("attentive");
  });

  it("lets every meaningful live state outrank ambient personality", () => {
    const idle: WonderRigState = {
      still: false,
      alert: false,
      sleeping: false,
      thinking: false,
      satisfied: false,
      petted: false,
      yawning: false,
    };

    expect(resolveWonderRigSelection(idle, 1801, true)).toBe(PERSONALITY_CLIPS.curious);
    expect(resolveWonderRigSelection({ ...idle, alert: true }, 1801, true)).toBe("attentive");
    expect(resolveWonderRigSelection({ ...idle, sleeping: true }, 1801, true)).toBe("sleeping");
    expect(resolveWonderRigSelection({ ...idle, thinking: true }, 1801, true)).toBe("thinking");
    expect(resolveWonderRigSelection({ ...idle, satisfied: true }, 1801, true)).toBe("satisfied");
    expect(resolveWonderRigSelection({ ...idle, yawning: true }, 1801, true)).toBe("yawning");
    expect(resolveWonderRigSelection({ ...idle, petted: true }, 1801, true)).toBe("petted");
    expect(resolveWonderRigSelection({ ...idle, still: true }, 1801, true)).toBe("still");
    expect(resolveWonderRigSelection(idle, 1801, false)).toBe("attentive");
  });
});
