/**
 * What anything outside the mark may reach for.
 *
 * `frames.ts` and `FramePlayer.tsx` used to sit beside these: the retired
 * pixel-frame renderer, kept in the tree behind their own tests and deliberately
 * absent from this barrel so nothing could put 27KB of frame data back into the
 * module graph. They did not travel to this bench. The vector renderer replaced
 * them long before the work extracted here, and carrying a dead rasteriser into
 * a folder whose whole purpose is the live mark would be carrying the one thing
 * this folder is not about.
 */

export {
  EYE_GLYPHS,
  EYE_WIDTH_EM,
  GLYPH_METRICS,
  MOUTH,
  NUDGE_EM,
  REST,
  TIMING,
  blinkGap,
  faceString,
  nudgeEm,
  resolveEye,
} from "./face";
export type { EyeGlyph, FaceState } from "./face";

export {
  BASELINE,
  CANVAS_H,
  CANVAS_W,
  FOOT,
  MARK_ACCENT,
  MARK_SPEC,
  MARK_WHITE,
  MOUTH_POSES,
  POSES,
  REST_POSE,
  SPINE,
  breathScale,
  ease,
  eyePosesFor,
  facePoseFor,
  inkBounds,
  lerpPose,
  pathFor,
  satisfiedBumpScale,
  sloshAt,
  spinePoints,
  transitionFor,
  yawnStretch,
} from "./pose";
export type { EaseName, MouthPose, Pose, PoseName } from "./pose";

export {
  BLUSH,
  BLUSH_DEFAULT,
  BLUSH_PEAK_OPACITY,
  ZZZ_COUNT,
  blushCentres,
  underscoreSpan,
  underscoreSpans,
  zzzAt,
} from "./adornments";
export type { BlushName, Zzz } from "./adornments";

export {
  RIG_CLIPS,
  RIG_PARTS,
  RIG_TRANSITION_MS,
  lerpRigPose,
  resolveRigMode,
  rigTransform,
  sampleRigClip,
} from "./rig";
export type { RigClip, RigPart, RigTransform, WonderRigMode, WonderRigPose, WonderRigState } from "./rig";

export { VectorMark } from "./VectorMark";
export type { ForcedState, MouthTone } from "./VectorMark";
