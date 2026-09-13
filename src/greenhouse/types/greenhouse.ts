export interface CropDefinition {
  id: string; // The key used in API and for images
  name: string; // Display name
  size: number;
  priority: number;
  ground: string; // PRIMARY ground type (farmland, sand, soul_sand, mycelium, netherrack, end_stone)
  /**
   * Every ground the wiki lists, first entry === `ground`. Optional and only
   * present on multi-surface rows (today: Lonelily, Farmland + Dirt). Texture
   * lookups keep drawing `ground`; labels should read `grounds ?? [ground]`.
   */
  grounds?: string[];
  growth_stages: number | null;
  positive_buffs: string[];
  negative_buffs: string[];
  isMutation?: boolean;
}

export interface MutationRequirement {
  crop: string; // This is the crop ID
  count: number;
}

export interface MutationDefinition {
  id: string; // The key used in API and for images
  name: string; // Display name
  size: number;
  /** PRIMARY growth surface (the first the wiki lists). See `CropDefinition.grounds`. */
  ground: string;
  /** Every growth surface the wiki lists. Absent on single-surface mutations. */
  grounds?: string[];
  requirements: MutationRequirement[];
  special?: string; // Special spawn conditions
  rarity: string;
  growth_stages: number;
  /**
   * Days before a fully grown mutation rots into a Dead Plant. 0 means never.
   *
   * Present on all 40 mutations in the bundled dataset; optional here because
   * only Noctilume's value is corroborated by a patch note, and the time model
   * treats a missing value as "no decay clock" rather than inventing one.
   */
  decay?: number;
  positive_buffs: string[];
  negative_buffs: string[];
  drops: Record<string, number>;
}

export interface MutationGoal {
  mutation: string;
  maximize: boolean;
  count: number | null;
}

// Lock object for pre-placed crops/mutations
export interface LockDefinition {
  name: string; // Crop/mutation ID
  size: number;
  position: [number, number];
}

export interface SolveRequest {
  cells: [number, number][];
  targets: MutationGoal[];
  priorities?: Record<string, number>;
  locks?: LockDefinition[];
  /** Strip support crops that do not contribute to any reported mutation. */
  removeUnusedCrops?: boolean;
}

// Unified placement/mutation format - uses position/size
export interface CropPlacement {
  crop: string;
  position: [number, number];
  size: number;
  locked?: boolean;
}

export interface MutationResult {
  mutation: string;
  position: [number, number];
  size: number;
}

export interface SolveResponse {
  status: string;
  total_cells_used?: number;
  placements: CropPlacement[];
  mutations: MutationResult[];
  cache_hit?: string;
  solver_approach?: string;
}

export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface JobProgress {
  phase: string;
  percentage: number | null;
  solutions_found: number;
  best_objective: number | null;
  best_bound: number | null;
  current_activity: string;
  elapsed_seconds: number;
  // Live preview of current best solution
  preview_placements: CropPlacement[] | null;
  preview_mutations: MutationResult[] | null;
  preview_cells_used: number | null;
}

export interface JobSubmitRequest {
  type: "greenhouse" | "greenhouse_expansion";
  params: Record<string, unknown>;
}

export interface JobSubmitResponse {
  job_id: string;
  status: string;
  message: string;
}

export interface JobStatusResponse {
  id: string;
  status: JobStatus;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  progress: JobProgress | null;
  queue_position: number | null;
  result: SolveResponse | null;
  error: string | null;
}

export interface ExpansionRequest {
  unlocked_cells: [number, number][];
  locked_cells: [number, number][];
}

export interface ExpansionStep {
  order: number;
  cell: [number, number];
  gloomgourd_potential: number;
  gloomgourd_gain: number;
}

export interface ExpansionResponse {
  steps: ExpansionStep[];
  total_steps: number;
  final_gloomgourd_count: number;
}

export type CellState = "locked" | "unlocked";

export interface GridCell {
  row: number;
  col: number;
  state: CellState;
}

export interface SelectedMutation {
  id: string; // The mutation ID (key), used for API calls
  name: string; // Display name for UI
  mode: "maximize" | "target";
  targetCount: number;
}

export interface SolverState {
  isLoading: boolean;
  error: string | null;
  result: SolveResponse | null;
}

export interface ExpansionState {
  isLoading: boolean;
  error: string | null;
  steps: ExpansionStep[];
  showOverlay: boolean;
}

export interface LockedPlacement {
  id: string; // Unique ID for React keys and tracking
  crop: string; // Crop/mutation ID (e.g., "pumpkin", "gloomgourd")
  position: [number, number];
  size: number;
  ground: string; // Ground type for rendering texture
}

// Filter categories for crop/mutation list
export type CropFilterCategory =
  | "all"
  | "crops"
  | "mutations"
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary";

// Selected crop for placement mode
export interface SelectedCropForPlacement {
  id: string;
  name: string;
  size: number;
  ground: string;
}

// Get crop image path (uses crop ID, not display name)
/**
 * Both of these used to return a root-absolute path, which worked in dev and
 * broke everywhere else.
 *
 * `import.meta.env.BASE_URL` keeps asset references correct from the canonical
 * root deployment and if the host layout changes in a future release.
 *
 * `import.meta.env.BASE_URL` always carries its trailing slash, so it is
 * concatenated directly. This matches the convention the shard icons already
 * use everywhere else in the app.
 */
export function getCropImagePath(cropId: string): string {
  return `${import.meta.env.BASE_URL}greenhouse/crops/${cropId}.png`;
}

// Get ground texture image path
export function getGroundImagePath(groundType: string): string {
  return `${import.meta.env.BASE_URL}greenhouse/ground/${groundType}.png`;
}
