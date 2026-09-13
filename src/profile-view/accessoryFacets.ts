import {
  ACQUISITION_ORDER,
  type AccessoryAcquisitionCategory,
  type AccessoryReadinessKind,
} from "../accessories";
import { collapseNonStackingAccessories } from "../accessories/ui/equivalence";
import type { AccessoryView } from "../accessories/ui/types";

export type AccessoryProgressFilter = "missing" | "upgrades" | "owned";

export const ACCESSORY_READINESS_FILTERS: readonly {
  kind: AccessoryReadinessKind;
  label: string;
}[] = [
  { kind: "materialsUnknown", label: "Recipe known" },
  { kind: "nextUpgrade", label: "Upgrade from owned item" },
  { kind: "collectionLocked", label: "Collection locked" },
  { kind: "progressionLocked", label: "Progression locked" },
  { kind: "currencyUnknown", label: "Shop route" },
  { kind: "timeWindow", label: "Timed or event route" },
  { kind: "rngUnknown", label: "RNG route" },
  { kind: "routeKnown", label: "Known route" },
  { kind: "unavailable", label: "Unobtainable" },
  { kind: "unknown", label: "Needs review" },
  { kind: "owned", label: "Owned" },
];

export const matchesAccessoryProgressFilter = (
  entry: AccessoryView,
  progress: AccessoryProgressFilter,
): boolean => {
  if (progress === "owned") return entry.status === "owned";
  if (progress === "upgrades") return entry.status !== "owned" && entry.ownedPrerequisite !== null;
  return entry.status !== "owned" && entry.ownedPrerequisite === null;
};

export const accessoryFacetIsDisabled = (count: number, selected: boolean): boolean => (
  count === 0 && !selected
);

export const accessoryFacetMatchCounts = (
  entries: readonly AccessoryView[],
  routeFilters: readonly AccessoryAcquisitionCategory[],
  readinessFilters: readonly AccessoryReadinessKind[],
): {
  routeCounts: ReadonlyMap<AccessoryAcquisitionCategory, number>;
  readinessCounts: ReadonlyMap<AccessoryReadinessKind, number>;
} => {
  const routeCounts = new Map<AccessoryAcquisitionCategory, number>();
  const readinessCounts = new Map<AccessoryReadinessKind, number>();
  const matchesRoutes = (entry: AccessoryView): boolean => (
    routeFilters.length === 0 || routeFilters.includes(entry.acquisition.category)
  );
  const matchesReadiness = (entry: AccessoryView): boolean => (
    readinessFilters.length === 0 || readinessFilters.includes(entry.readiness.kind)
  );

  for (const category of ACQUISITION_ORDER) {
    routeCounts.set(category, collapseNonStackingAccessories(entries.filter((entry) => (
      entry.acquisition.category === category && matchesReadiness(entry)
    ))).length);
  }
  for (const { kind } of ACCESSORY_READINESS_FILTERS) {
    readinessCounts.set(kind, collapseNonStackingAccessories(entries.filter((entry) => (
      entry.readiness.kind === kind && matchesRoutes(entry)
    ))).length);
  }

  return { routeCounts, readinessCounts };
};
