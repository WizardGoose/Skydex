import { Field } from "./field.ts";
import { CELL_COUNT, colOf, rowOf } from "./grid.ts";
import type { Problem } from "./problem.ts";
import type { Rng } from "./rng.ts";

/**
 * Seeding. This is where the quality comes from, not the annealing.
 *
 * Two families of mutation need opposite treatment, and mixing them is the
 * mistake that made the earlier spike score zero on the multi-cell targets:
 *
 * FULL RING (requirement counts sum to exactly the ring size). Every ring cell
 * must be planted, so the block positions are FORCED onto a lattice of spacing
 * S+1 and the only freedom left is which crop goes in each ring cell. Seeding
 * lays that lattice down directly. A random cell-flip search will essentially
 * never assemble a complete 16-cell ring by luck, which is exactly why the
 * spike returned 0 for snoozling and noctilume.
 *
 * SLACK (requirements sum to less than the ring). Here the lattice is NOT
 * forced, and measurement says periodic patterns top out below the achievable
 * yield - 70 against a reachable 72 on the two-crop-cell targets, 45 against 52
 * on the four-crop-cell ones - because the plot boundary lets a non-periodic
 * layout do better than any tiling. So periodic masks are a starting point to
 * be polished, never the answer.
 */

/** Hill-climbs the crop choice on already-planted cells. Never plants or clears. */
export const repaint = (field: Field, cells: number[], passes: number): void => {
  const paletteSize = field.problem.palette.length;
  if (paletteSize <= 1) return;
  for (let pass = 0; pass < passes; pass++) {
    let improved = false;
    for (const cell of cells) {
      const current = field.cells[cell];
      if (current < 0) continue;
      let bestCrop = current;
      let bestScore = field.score();
      for (let crop = 0; crop < paletteSize; crop++) {
        if (crop === current) continue;
        field.set(cell, crop);
        const score = field.score();
        if (score > bestScore) {
          bestScore = score;
          bestCrop = crop;
        }
      }
      field.set(cell, bestCrop);
      if (bestCrop !== current) improved = true;
    }
    if (!improved) break;
  }
};

/** Plants `mask` cells (crop 0 to start), clears the rest, then repaints. */
const applyMask = (field: Field, problem: Problem, mask: Uint8Array, passes: number): void => {
  const planted: number[] = [];
  field.clear();
  for (const cell of problem.plantable) {
    if (!mask[cell]) continue;
    field.set(cell, 0);
    planted.push(cell);
  }
  repaint(field, planted, passes);
};

/**
 * Constructive lattice for a full-ring target.
 *
 * Blocks go at every (S+1)-spaced position from a given phase; everything that
 * is in some block's ring gets planted. Rings of neighbouring blocks overlap by
 * design - one row of crops serving two blocks is what makes the density
 * possible - so the composition is then assigned by "whichever block is
 * furthest from satisfied gets first claim on a shared cell".
 */
const latticeSeed = (
  problem: Problem,
  targetIndex: number,
  phaseRow: number,
  phaseCol: number
): Int16Array | null => {
  const target = problem.targets[targetIndex];
  const step = target.size + 1;
  const byPosition = new Map<number, number>();
  for (const ai of problem.anchorsByTarget[targetIndex]) {
    const anchor = problem.anchors[ai];
    byPosition.set(anchor.row * 16 + anchor.col, ai);
  }

  const chosen: number[] = [];
  for (let row = phaseRow; row < 10; row += step) {
    for (let col = phaseCol; col < 10; col += step) {
      const ai = byPosition.get(row * 16 + col);
      if (ai !== undefined) chosen.push(ai);
    }
  }
  if (chosen.length === 0) return null;

  const blockCells = new Set<number>();
  for (const ai of chosen) for (const cell of problem.anchors[ai].block) blockCells.add(cell);

  // A block whose ring was stolen by another block's cells can never be legal.
  const usable = chosen.filter((ai) => problem.anchors[ai].ring.every((cell) => !blockCells.has(cell)));
  if (usable.length === 0) return null;

  // A lattice seed may be built around crops pinned by an earlier finite
  // target. Start from that immutable baseline instead of an empty field;
  // otherwise the seed scores replacement crops at those coordinates while
  // the response still reports the original locks.
  const assignment = Int16Array.from(problem.baseline);
  const deficit = usable.map((ai) =>
    problem.targets[problem.anchors[ai].targetIndex].requirements.map((req) => req.count)
  );
  for (let i = 0; i < usable.length; i++) {
    const anchor = problem.anchors[usable[i]];
    const anchorTarget = problem.targets[anchor.targetIndex];
    for (const cell of anchor.ring) {
      const cropIndex = assignment[cell];
      if (cropIndex < 0) continue;
      const slot = anchorTarget.reqSlotOfCrop[cropIndex];
      if (slot >= 0 && deficit[i][slot] > 0) deficit[i][slot]--;
    }
  }

  // Round-robin over blocks by remaining need, so shared ring cells are handed
  // to whoever needs them most rather than to whoever was visited first.
  for (;;) {
    let pick = -1;
    let pickDeficit = 0;
    for (let i = 0; i < usable.length; i++) {
      const remaining = deficit[i].reduce((sum, value) => sum + value, 0);
      if (remaining > pickDeficit) {
        pickDeficit = remaining;
        pick = i;
      }
    }
    if (pick < 0) break;

    const anchor = problem.anchors[usable[pick]];
    const free = anchor.ring.filter((cell) => assignment[cell] < 0 && problem.plantableMask[cell]);
    if (free.length === 0) {
      deficit[pick].fill(0);
      continue;
    }
    // Largest remaining requirement first: the scarce crop is hardest to place later.
    let slot = 0;
    for (let s = 1; s < deficit[pick].length; s++) if (deficit[pick][s] > deficit[pick][slot]) slot = s;
    if (deficit[pick][slot] <= 0) {
      deficit[pick].fill(0);
      continue;
    }
    const cropIndex = target.requirements[slot].cropIndex;
    assignment[free[0]] = cropIndex;
    deficit[pick][slot]--;

    // A cell shared with another block also pays down that block's need.
    for (let i = 0; i < usable.length; i++) {
      if (i === pick) continue;
      const other = problem.anchors[usable[i]];
      if (!other.ring.includes(free[0])) continue;
      const otherTarget = problem.targets[other.targetIndex];
      const otherSlot = otherTarget.reqSlotOfCrop[cropIndex];
      if (otherSlot >= 0 && deficit[i][otherSlot] > 0) deficit[i][otherSlot]--;
    }
  }

  // Fill whatever the constructive pass left over; repaint will sort it out.
  for (const ai of usable) {
    for (const cell of problem.anchors[ai].ring) {
      if (assignment[cell] < 0 && problem.plantableMask[cell]) assignment[cell] = target.requirements[0].cropIndex;
    }
  }
  for (const cell of blockCells) assignment[cell] = -1;
  return assignment;
};

/** Cheap geometric proxy: how many 1x1 blocks could possibly be legal on this mask. */
const maskPotential = (problem: Problem, mask: Uint8Array, reqSum: number): number => {
  let total = 0;
  for (const ai of problem.anchors) {
    if (ai.size !== 1) continue;
    const cell = ai.block[0];
    if (mask[cell]) continue;
    let planted = 0;
    for (const neighbour of ai.ring) if (mask[neighbour]) planted++;
    if (planted >= reqSum) total++;
  }
  return total;
};

const periodicMask = (problem: Problem, pr: number, pc: number, bits: number): Uint8Array => {
  const mask = new Uint8Array(CELL_COUNT);
  for (const cell of problem.plantable) {
    const bit = (rowOf(cell) % pr) * pc + (colOf(cell) % pc);
    if ((bits >> bit) & 1) mask[cell] = 1;
  }
  return mask;
};

const linearMask = (problem: Problem, modulus: number, a: number, b: number, set: number): Uint8Array => {
  const mask = new Uint8Array(CELL_COUNT);
  for (const cell of problem.plantable) {
    const residue = (a * rowOf(cell) + b * colOf(cell)) % modulus;
    if ((set >> residue) & 1) mask[cell] = 1;
  }
  return mask;
};

/**
 * Scans two families of periodic mask and keeps the most promising.
 *
 * Ranked by geometry alone (does each empty cell have enough planted
 * neighbours) because that is independent of which crop goes where and costs a
 * single pass. Colour is decided afterwards, only for the survivors.
 */
const maskSeeds = (problem: Problem, keep: number): Uint8Array[] => {
  const target = problem.targets.find((t) => t.size === 1 && !t.zeroAdjacent);
  if (!target) return [];
  const reqSum = target.reqSum;

  const scored: { score: number; mask: Uint8Array; rank: number }[] = [];
  let rank = 0;
  const consider = (mask: Uint8Array): void => {
    const score = maskPotential(problem, mask, reqSum);
    scored.push({ score, mask, rank: rank++ });
  };

  for (let pr = 1; pr <= 6; pr++) {
    for (let pc = 1; pc <= 6; pc++) {
      if (pr * pc > 12) continue;
      const combinations = 1 << (pr * pc);
      for (let bits = 1; bits < combinations - 1; bits++) consider(periodicMask(problem, pr, pc, bits));
    }
  }
  for (let modulus = 2; modulus <= 8; modulus++) {
    for (let a = 0; a < modulus; a++) {
      for (let b = 0; b < modulus; b++) {
        for (let set = 1; set < (1 << modulus) - 1; set++) {
          consider(linearMask(problem, modulus, a, b, set));
        }
      }
    }
  }

  scored.sort((x, y) => y.score - x.score || x.rank - y.rank);
  const out: Uint8Array[] = [];
  const seen = new Set<string>();
  for (const entry of scored) {
    if (out.length >= keep) break;
    const key = entry.mask.join("");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry.mask);
  }
  return out;
};

export interface SeedOptions {
  /** How many periodic masks survive ranking and get a colour pass. */
  maskKeep: number;
  /** Random-density restarts. */
  randomSeeds: number;
  /** Repaint passes per seed. */
  paintPasses: number;
}

/** Produces candidate crop fields, best first is NOT guaranteed - the caller scores them. */
export const buildSeeds = (problem: Problem, rng: Rng, options: SeedOptions): Int16Array[] => {
  const field = new Field(problem);
  const seeds: Int16Array[] = [];

  // An empty plot. The only seed lonelily ever needs, and a sane baseline.
  field.clear();
  seeds.push(field.snapshot());

  // Forced lattices, every phase, for each full-ring target.
  problem.targets.forEach((target, ti) => {
    if (!target.fullRing) return;
    const step = target.size + 1;
    for (let phaseRow = 0; phaseRow < step; phaseRow++) {
      for (let phaseCol = 0; phaseCol < step; phaseCol++) {
        const assignment = latticeSeed(problem, ti, phaseRow, phaseCol);
        if (!assignment) continue;
        field.load(assignment);
        const planted = problem.plantable.filter((cell) => field.cells[cell] >= 0);
        repaint(field, planted, options.paintPasses);
        seeds.push(field.snapshot());
      }
    }
  });

  // Periodic masks for the slack family.
  for (const mask of maskSeeds(problem, options.maskKeep)) {
    applyMask(field, problem, mask, options.paintPasses);
    seeds.push(field.snapshot());
  }

  // Random restarts across a density sweep, so the annealer has starting points
  // the structured families cannot reach.
  for (let i = 0; i < options.randomSeeds; i++) {
    const density = 0.2 + (0.5 * ((i % 7) + 1)) / 8;
    const mask = new Uint8Array(CELL_COUNT);
    for (const cell of problem.plantable) if (rng.next() < density) mask[cell] = 1;
    applyMask(field, problem, mask, 1);
    seeds.push(field.snapshot());
  }

  return seeds;
};
