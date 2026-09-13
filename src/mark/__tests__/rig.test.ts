import { describe, expect, it } from "vitest";
import {
  RIG_CLIPS,
  RIG_PARTS,
  lerpRigPose,
  resolveRigMode,
  rigTransform,
  sampleRigClip,
} from "../rig";
import { YAWN_TOTAL_MS } from "../face";
import type { WonderRigMode, WonderRigState } from "../rig";

const BASE: WonderRigState = {
  still: false,
  alert: false,
  sleeping: false,
  thinking: false,
  satisfied: false,
  petted: false,
  yawning: false,
};

const at = (over: Partial<WonderRigState>): WonderRigState => ({ ...BASE, ...over });

describe("Wonder's rig hierarchy", () => {
  it("owns one root and one independent bone for every visible face part", () => {
    expect(RIG_PARTS).toEqual(["root", "leftEye", "rightEye", "mouth"]);
    for (const mode of Object.keys(RIG_CLIPS) as WonderRigMode[]) {
      const pose = sampleRigClip(mode, 0);
      expect(Object.keys(pose)).toEqual(RIG_PARTS);
    }
  });

  it("keeps every authored transform finite and inside Wonder's small canvas", () => {
    for (const mode of Object.keys(RIG_CLIPS) as WonderRigMode[]) {
      const clip = RIG_CLIPS[mode];
      for (let i = 0; i <= 80; i++) {
        const pose = sampleRigClip(mode, (clip.duration * i) / 80);
        for (const part of RIG_PARTS) {
          const transform = pose[part];
          expect(Object.values(transform).every(Number.isFinite), `${mode}.${part} is finite`).toBe(true);
          expect(Math.abs(transform.x), `${mode}.${part}.x`).toBeLessThanOrEqual(0.2);
          expect(Math.abs(transform.y), `${mode}.${part}.y`).toBeLessThanOrEqual(0.7);
          expect(Math.abs(transform.rotation), `${mode}.${part}.rotation`).toBeLessThanOrEqual(1);
          expect(transform.scaleX, `${mode}.${part}.scaleX`).toBeGreaterThan(0.94);
          expect(transform.scaleX, `${mode}.${part}.scaleX`).toBeLessThan(1.14);
          expect(transform.scaleY, `${mode}.${part}.scaleY`).toBeGreaterThan(0.94);
          expect(transform.scaleY, `${mode}.${part}.scaleY`).toBeLessThan(1.14);
        }
      }
    }
  });

  it("cross-fades every bone rather than snapping only the root", () => {
    const sleeping = sampleRigClip("sleeping", 0);
    const attentive = sampleRigClip("attentive", RIG_CLIPS.attentive.duration * 0.48);
    const halfway = lerpRigPose(sleeping, attentive, 0.5);

    for (const part of RIG_PARTS) {
      expect(halfway[part].y).toBeCloseTo((sleeping[part].y + attentive[part].y) / 2, 10);
      expect(halfway[part].rotation).toBeCloseTo(
        (sleeping[part].rotation + attentive[part].rotation) / 2,
        10
      );
    }
  });

  it("emits one complete pivoted SVG transform with no invalid values", () => {
    const transform = rigTransform(sampleRigClip("attentive", 900).leftEye, 6.1, 11.2);
    expect(transform).toContain("translate(6.1 11.2)");
    expect(transform).toContain("rotate(");
    expect(transform).toContain("scale(");
    expect(transform).not.toContain("NaN");
    expect(transform).not.toContain("undefined");
  });
});

describe("Wonder's authored motion", () => {
  it("floats while attentive with delayed motion between the two W's", () => {
    const start = sampleRigClip("attentive", 0);
    const high = sampleRigClip("attentive", RIG_CLIPS.attentive.duration * 0.48);
    expect(high.root.y).toBeLessThan(start.root.y - 0.3);
    expect(high.leftEye.y).not.toBeCloseTo(high.rightEye.y, 4);
    expect(high.leftEye.rotation).not.toBeCloseTo(high.rightEye.rotation, 4);
  });

  it("breathes more slowly and quietly while sleeping", () => {
    const low = sampleRigClip("sleeping", 0);
    const inhale = sampleRigClip("sleeping", RIG_CLIPS.sleeping.duration / 2);
    expect(inhale.root.scaleY).toBeGreaterThan(low.root.scaleY + 0.01);
    expect(Math.abs(inhale.root.y - low.root.y)).toBeGreaterThan(0.1);
    expect(RIG_CLIPS.sleeping.duration).toBeGreaterThan(RIG_CLIPS.attentive.duration);
  });

  it("gives a settled search result one small anticipation-and-landing bounce", () => {
    const lift = sampleRigClip("satisfied", RIG_CLIPS.satisfied.duration * 0.3);
    const land = sampleRigClip("satisfied", RIG_CLIPS.satisfied.duration * 0.62);
    const rest = sampleRigClip("satisfied", RIG_CLIPS.satisfied.duration);
    expect(lift.root.y).toBeLessThan(-0.5);
    expect(land.root.y).toBeGreaterThan(0);
    expect(rest.root.y).toBe(0);
    expect(rest.root.scaleX).toBe(1);
    expect(rest.root.scaleY).toBe(1);
  });

  it("has seamless ambient loops", () => {
    for (const mode of ["attentive", "sleeping", "thinking", "petted"] as const) {
      expect(sampleRigClip(mode, RIG_CLIPS[mode].duration)).toEqual(sampleRigClip(mode, 0));
    }
  });

  it("keeps the yawn rig locked to the face's authored timing", () => {
    expect(RIG_CLIPS.yawning.duration).toBe(YAWN_TOTAL_MS);
  });
});

describe("rig state priority", () => {
  it("is asleep only when nothing that deserves attention is active", () => {
    expect(resolveRigMode(at({ sleeping: true }))).toBe("sleeping");
    expect(resolveRigMode(at({ sleeping: true, alert: true }))).toBe("attentive");
  });

  it("lets meaningful reactions outrank ambient attention", () => {
    expect(resolveRigMode(at({ alert: true, thinking: true }))).toBe("thinking");
    expect(resolveRigMode(at({ thinking: true, satisfied: true }))).toBe("satisfied");
    expect(resolveRigMode(at({ satisfied: true, yawning: true }))).toBe("yawning");
    expect(resolveRigMode(at({ yawning: true, petted: true }))).toBe("petted");
  });

  it("turns the entire rig off for reduced motion", () => {
    expect(resolveRigMode(at({ still: true, petted: true, yawning: true }))).toBe("still");
    expect(sampleRigClip("still", 0)).toEqual(sampleRigClip("still", 1000));
  });
});
