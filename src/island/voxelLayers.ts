import * as THREE from "three";
import type { PlayerObject, BodyPart } from "skinview3d";

/**
 * 3D second skin layer.
 *
 * A modern Minecraft skin has two layers: the body itself, and a 4px "overlay"
 * carrying hats, jackets and sleeves. Renderers normally draw that overlay as a
 * slightly larger hollow box wearing the same texture - which means a crown is
 * a picture of a crown printed on a box, and from above you see a 1px rim and
 * straight through the transparent middle to the head underneath.
 *
 * This builds the overlay as GEOMETRY instead: every opaque texel becomes a
 * real box with real thickness, so the crown gets prongs with sides.
 *
 * ---------------------------------------------------------------------------
 * PROVENANCE - read this before touching it
 * ---------------------------------------------------------------------------
 *
 * The idea comes from tr7zw's "3D Skin Layers" Minecraft mod. Its source was
 * deliberately NOT consulted. That mod ships under the "tr7zw Protective
 * License", which grants no right to copy, modify or reuse its code, so
 * reading it and then writing something shaped like it would be a derivative
 * work even without copy-paste.
 *
 * What IS free to use is the idea, because copyright covers expression and not
 * process, and the Minecraft skin format itself is public and documented. So
 * everything below is written from the format: the UV block layout for each
 * body part, and the arithmetic to turn a texel into a box. Nothing here was
 * transcribed from anywhere.
 *
 * Credit is in NOTICE.md as inspiration, which is the honest description.
 *
 * ---------------------------------------------------------------------------
 * The layout, from the format
 * ---------------------------------------------------------------------------
 *
 * Every part's overlay occupies one 2D block, and within that block the six
 * faces are unwrapped in a fixed order. For a box `w` wide, `h` high and `d`
 * deep, with the block's origin at (U, V):
 *
 *     top    (U + d,         V)      w x d
 *     bottom (U + d + w,     V)      w x d
 *     right  (U,             V + d)  d x h
 *     front  (U + d,         V + d)  w x h
 *     left   (U + d + w,     V + d)  d x h
 *     back   (U + d + w + d, V + d)  w x h
 *
 * The horizontal run right-front-left-back is the box unrolled, which is what
 * fixes the direction each face's texels advance in: whichever edge of a face
 * touches its neighbour in the texture also touches it in space.
 */

/** How far a texel stands proud of the body, in skin units (1 texel = 1). */
const THICKNESS = 0.55;

/*
 * DILATION - why the overlay is bigger than the body it sits on, and why the
 * head is a special case.
 *
 * Minecraft does not draw the second layer at the body's own size. It draws it
 * on an expanded box, which is what lifts the top ROW of every side face above
 * the top of the head - exactly why a crown's prongs stand proud of the skull.
 *
 * THE HEAD IS EXPANDED TWICE AS FAR AS EVERYTHING ELSE. Vanilla dilates the
 * hat by 0.5 and the jacket, sleeves and trousers by 0.25. Using 0.5
 * everywhere is what made the sleeves read as too baggy and standing off the
 * arms: a 4-wide arm gaining a full unit is a 25% wider limb, where the same
 * unit on an 8-wide head is only 12.5%. Half of that on the limbs is the
 * proportion the game actually draws.
 *
 * Two consequences, and the second is easy to miss. The shell moves outward,
 * AND each texel gets bigger - eight texels now cover nine units, so each is
 * 1.125 rather than 1. Expanding the box without rescaling the grid gives the
 * right size and the wrong shape.
 */
const HEAD_DILATION = 0.5;
const LIMB_DILATION = 0.25;

/** Below this, a texel is a hole rather than a pixel. */
const ALPHA_CUTOFF = 128;

interface PartSpec {
  /** Overlay block origin in the 64x64 sheet. */
  u: number;
  v: number;
  /** Box size in texels. */
  w: number;
  h: number;
  d: number;
  /** How far the overlay shell stands off this part. See the note above. */
  dilation: number;
}

/*
 * Classic proportions. A slim ("Alex") skin narrows both arms to 3, which
 * shifts every UV to the right of the arm blocks; `slim` handles that below
 * rather than being a second table to keep in sync.
 */
const PARTS: Record<string, PartSpec> = {
  head: { u: 32, v: 0, w: 8, h: 8, d: 8, dilation: HEAD_DILATION },
  body: { u: 16, v: 32, w: 8, h: 12, d: 4, dilation: LIMB_DILATION },
  rightArm: { u: 40, v: 32, w: 4, h: 12, d: 4, dilation: LIMB_DILATION },
  leftArm: { u: 48, v: 48, w: 4, h: 12, d: 4, dilation: LIMB_DILATION },
  rightLeg: { u: 0, v: 32, w: 4, h: 12, d: 4, dilation: LIMB_DILATION },
  leftLeg: { u: 0, v: 48, w: 4, h: 12, d: 4, dilation: LIMB_DILATION },
};

type Face = "top" | "bottom" | "right" | "front" | "left" | "back";

/** Where a face's texels live in the sheet, relative to the block origin. */
const faceRegion = (p: PartSpec, face: Face) => {
  switch (face) {
    case "top":
      return { x: p.u + p.d, y: p.v, cols: p.w, rows: p.d };
    case "bottom":
      return { x: p.u + p.d + p.w, y: p.v, cols: p.w, rows: p.d };
    case "right":
      return { x: p.u, y: p.v + p.d, cols: p.d, rows: p.h };
    case "front":
      return { x: p.u + p.d, y: p.v + p.d, cols: p.w, rows: p.h };
    case "left":
      return { x: p.u + p.d + p.w, y: p.v + p.d, cols: p.d, rows: p.h };
    case "back":
      return { x: p.u + p.d + p.w + p.d, y: p.v + p.d, cols: p.w, rows: p.h };
  }
};

/**
 * Where texel (i, j) of a face sits in the part's own space, and which way the
 * voxel is stretched.
 *
 * The part's box is centred on its origin, so it spans -w/2..+w/2 and so on.
 * `i` runs left to right across the face as the texture draws it and `j` runs
 * top to bottom; the mapping below is what turns that into the right corner of
 * the right face.
 */
const place = (p: PartSpec, face: Face, i: number, j: number) => {
  /* Base half-extents: where the body's own surface is, and where the inner
     face of every overlay voxel therefore sits. */
  const bw = p.w / 2;
  const bh = p.h / 2;
  const bd = p.d / 2;

  /* Dilated half-extents and texel sizes: where the overlay's grid lives. */
  const e = p.dilation;
  const hw = bw + e;
  const hh = bh + e;
  const hd = bd + e;
  const sx = (p.w + 2 * e) / p.w;
  const sy = (p.h + 2 * e) / p.h;
  const sz = (p.d + 2 * e) / p.d;

  const off = THICKNESS / 2 + EPSILON;

  switch (face) {
    case "front":
      return { pos: [-hw + (i + 0.5) * sx, hh - (j + 0.5) * sy, bd + off], scale: [sx, sy, THICKNESS] };
    case "back":
      return { pos: [hw - (i + 0.5) * sx, hh - (j + 0.5) * sy, -bd - off], scale: [sx, sy, THICKNESS] };
    case "right":
      return { pos: [-bw - off, hh - (j + 0.5) * sy, -hd + (i + 0.5) * sz], scale: [THICKNESS, sy, sz] };
    case "left":
      return { pos: [bw + off, hh - (j + 0.5) * sy, hd - (i + 0.5) * sz], scale: [THICKNESS, sy, sz] };
    case "top":
      return { pos: [-hw + (i + 0.5) * sx, bh + off, -hd + (j + 0.5) * sz], scale: [sx, THICKNESS, sz] };
    case "bottom":
      return { pos: [-hw + (i + 0.5) * sx, -bh - off, hd - (j + 0.5) * sz], scale: [sx, THICKNESS, sz] };
  }
};

const FACES: Face[] = ["top", "bottom", "right", "front", "left", "back"];

/*
 * FACES THAT ARE STRUCTURALLY OCCLUDED, and must not be built.
 *
 * The head's underside is the neck. Nothing can ever see it - the torso is
 * directly beneath - so whatever a skin author draws there is invisible in
 * game and they may not know it is there at all. This skin has 16 opaque
 * texels in that region.
 *
 * Drawing them is what produced the slab hanging under the chin. It is worse
 * than it sounds because of dilation: the head's overlay is a 9-deep box while
 * the torso is only 4 deep, so a face that vanilla tucks inside the body
 * protrudes two and a half units in front of the chest and the same again
 * behind. Hidden geometry stops being hidden the moment it is inflated past
 * the thing that was hiding it.
 *
 * This is a cull of geometry no view can reach, not an edit of the skin.
 */
const OCCLUDED: Partial<Record<string, Face[]>> = {
  head: ["bottom"],
};

/*
 * Z-FIGHTING.
 *
 * Each voxel's inner face lands exactly on the body's own surface, which is
 * two coplanar polygons at identical depth - the depth buffer then picks a
 * winner per pixel per frame and the surface shimmers as the model turns.
 *
 * EPSILON separates the two surfaces in world space. Do not also apply a
 * camera-facing polygon offset to these boxes: it biases every face, including
 * the inward and corner faces, and can pull those faces through the visible
 * jacket surface as the model turns.
 */
const EPSILON = 0.06;

/** Read the sheet once into a flat RGBA array. */
const readSheet = (img: HTMLImageElement): { data: Uint8ClampedArray; width: number } => {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, 0, 0);
  return { data: ctx.getImageData(0, 0, img.width, img.height).data, width: img.width };
};

/**
 * Where the part's BOX actually sits, in the part's own coordinates.
 *
 * A BodyPart is pivoted at its JOINT so rotating it swings the limb correctly
 * - the head turns about the neck, an arm about the shoulder - and the box is
 * offset from that pivot to where the limb really is. Voxels placed at the
 * part's origin therefore land half a box away: the crown sat across the eyes,
 * and the sleeves floated up beside the head.
 *
 * The first fix read `innerLayer.position` directly. That was right for the
 * head and wrong for the arms, because an arm nests the mesh inside a further
 * group and the offset is spread across two transforms rather than sitting on
 * one. Measuring the rendered bounding box and converting its centre back into
 * the part's own space is indifferent to how many groups deep the mesh is, so
 * it is right for every part and stays right if the library re-nests anything.
 */
const anchorOf = (part: BodyPart): THREE.Vector3 => {
  const inner = part.innerLayer as unknown as THREE.Object3D;
  const centre = new THREE.Box3().setFromObject(inner).getCenter(new THREE.Vector3());
  return (part as unknown as THREE.Object3D).worldToLocal(centre);
};

/**
 * Replace one part's flat overlay with voxels.
 *
 * Returns the mesh so the caller can dispose it; returns null when the overlay
 * is entirely transparent, which is the common case for legs and the honest
 * answer for a skin that has no second layer there.
 */
const voxelisePart = (
  name: string,
  part: BodyPart,
  spec: PartSpec,
  sheet: { data: Uint8ClampedArray; width: number },
  slimOffset: number
): THREE.InstancedMesh | null => {
  const anchor = anchorOf(part);
  const p = { ...spec, u: spec.u + slimOffset, w: spec.w - (slimOffset ? 1 : 0) };

  /* First pass: count, so the InstancedMesh is sized exactly. */
  const cells: { pos: number[]; scale: number[]; colour: number[] }[] = [];

  const skip = OCCLUDED[name] ?? [];

  for (const face of FACES) {
    if (skip.includes(face)) continue;
    const region = faceRegion(p, face);
    for (let j = 0; j < region.rows; j++) {
      for (let i = 0; i < region.cols; i++) {
        const px = ((region.y + j) * sheet.width + (region.x + i)) * 4;
        if (sheet.data[px + 3] < ALPHA_CUTOFF) continue;
        const at = place(p, face, i, j)!;
        cells.push({
          pos: [at.pos[0] + anchor.x, at.pos[1] + anchor.y, at.pos[2] + anchor.z],
          scale: at.scale,
          colour: [sheet.data[px] / 255, sheet.data[px + 1] / 255, sheet.data[px + 2] / 255],
        });
      }
    }
  }

  if (cells.length === 0) return null;

  /*
   * Lighting has to match the body exactly or the overlay reads as a separate
   * object stuck on top, so the material is CLONED from the part's own inner
   * layer rather than invented. Only the texture comes off - colour arrives
   * per instance instead.
   */
  const inner = part.innerLayer as unknown as THREE.Mesh;
  const source = (Array.isArray(inner.material) ? inner.material[0] : inner.material) as THREE.MeshStandardMaterial;
  const material = source.clone();
  material.map = null;
  material.transparent = false;
  material.alphaTest = 0;
  material.depthTest = true;
  material.depthWrite = true;
  material.needsUpdate = true;

  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, cells.length);
  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();

  cells.forEach((cell, index) => {
    matrix.compose(
      new THREE.Vector3(cell.pos[0], cell.pos[1], cell.pos[2]),
      new THREE.Quaternion(),
      new THREE.Vector3(cell.scale[0], cell.scale[1], cell.scale[2])
    );
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, colour.setRGB(cell.colour[0], cell.colour[1], cell.colour[2]));
  });

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.name = "voxel-overlay";

  return mesh;
};

/**
 * Swap every flat overlay on a player for voxel geometry.
 *
 * Call after the skin has loaded. Returns a disposer, because an InstancedMesh
 * holds a geometry and a material that the scene will not free on its own.
 */
export const applyVoxelLayers = (player: PlayerObject, img: HTMLImageElement): (() => void) => {
  const sheet = readSheet(img);
  /* Bounding boxes are read below, so every matrix has to be current first. */
  (player as unknown as THREE.Object3D).updateMatrixWorld(true);
  /* A slim skin's arms are 3 wide, which slides their blocks one texel right
     and narrows them by one. Nothing else on the model changes. */
  const slim = player.skin.modelType === "slim";
  const added: THREE.InstancedMesh[] = [];

  for (const [name, spec] of Object.entries(PARTS)) {
    const part = (player.skin as unknown as Record<string, BodyPart>)[name];
    if (!part) continue;

    const isArm = name === "rightArm" || name === "leftArm";
    const mesh = voxelisePart(name, part, spec, sheet, slim && isArm ? 1 : 0);
    if (!mesh) continue;

    part.outerLayer.visible = false;
    part.add(mesh);
    added.push(mesh);
  }

  return () => {
    for (const mesh of added) {
      mesh.parent?.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  };
};
