/*
 * The shape of the calculator form's state.
 *
 * This is hand-authored rather than derived from a runtime schema. The schema
 * it replaced was never executed against any input: nothing in the app called
 * `.parse` or `.safeParse` on it, so its per-field bounds and messages were
 * documentation wearing a validator's clothes. What the app actually consumed
 * was the inferred type, at roughly fifty sites.
 *
 * Deriving that type still cost a validator library in the runtime graph, and
 * `tsconfig.app.json` sets `verbatimModuleSyntax`, so a single consumer writing
 * `import { type CalculationFormData }` instead of `import type { ... }` was
 * enough to keep the whole module - and the library behind it - in the bundle.
 * Declaring the interface directly removes that failure mode: a type has no
 * runtime footprint to leak.
 *
 * The bounds the old schema described, kept here because they are still the
 * intended ranges even though nothing enforces them: `quantity` is at least 1,
 * `hunterFortune` and `craftPenalty` are non-negative, every `*Level` field is
 * 0 to 10 inclusive, and `kuudraTimeSeconds` is at least 1 when set. If these
 * ever need enforcing, the place to do it is the input components that already
 * clamp them, not a schema nothing calls.
 */
export interface CalculationFormData {
  shard: string;
  quantity: number;
  hunterFortune: number;
  hunterFortuneSource?: "profile" | "override";
  excludeChameleon: boolean;
  frogBonus: boolean;
  newtLevel: number;
  salamanderLevel: number;
  lizardKingLevel: number;
  leviathanLevel: number;
  pythonLevel: number;
  kingCobraLevel: number;
  seaSerpentLevel: number;
  tiamatLevel: number;
  crocodileLevel: number;
  kuudraTier: "none" | "t1" | "t2" | "t3" | "t4" | "t5";
  kuudraTierSource?: "profile" | "override";
  moneyPerHour: number | null;
  customKuudraTime: boolean;
  kuudraTimeSeconds: number | null;
  noWoodenBait: boolean;
  ironManView: boolean;
  instantBuyPrices: boolean;
  useHeldShards?: boolean;
  craftPenalty: number;
  materialsOnly: boolean;
  selectedShardKeys?: string[] | undefined;
  /*
   * Deliberately `any[]`. The old schema declared this as an array of `any`
   * too, so every one of its ~50 consumers is written against that looseness;
   * narrowing it to `unknown[]` here would surface as type errors in call sites
   * this change has no business touching. Tightening it is its own task.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shardQuantities?: any[] | undefined;
}
