/**
 * The accessories data contract, as this UI consumes it.
 *
 * These are re-exported from the data layer's barrel (`src/accessories`), which
 * is the single source of truth. The re-export exists so that every file in
 * `accessories/ui` imports its types from one place: if the contract moves or
 * gains a field, exactly one import path changes rather than seven.
 */
export type {
  SourceCategory,
  AccessoryStatus,
  AccessoryView,
  AccessoryRungSummary,
  AccessoriesSnapshot,
  AccessoryAcquisition,
  AccessoryAcquisitionCategory,
  AccessoryReadiness,
  CheckedRequirement,
  FoldedRung,
  MagicalPowerFigure,
  RequirementState,
  RequirementKind,
} from "..";
