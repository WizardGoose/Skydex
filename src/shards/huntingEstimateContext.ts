import { createContext, useContext } from "react";
import type { AcquisitionEstimate } from "./huntingModel";
import type { ItemTooltipSection } from "../ui/itemTooltipModel";

export const HuntingEstimateContext = createContext<Readonly<Record<string, AcquisitionEstimate>>>({});
export const useHuntingEstimate = (key?: string) => useContext(HuntingEstimateContext)[key ?? ""];

export const acquisitionEstimateSections = (estimate?: AcquisitionEstimate): ItemTooltipSection[] => !estimate || estimate.quality === "unavailable" && !estimate.alternatives.length ? [] : [
  {
    title: estimate.quality === "unavailable" ? "Direct acquisition" : `${estimate.method} · ${estimate.quality === "override" ? "Custom rate" : "Estimate"}`,
    collapsible: true,
    lines: [
      estimate.rate ? `~${Math.round(estimate.rate).toLocaleString()} shards / hour for planning` : "Timing unknown with captured gear",
      ...estimate.assumptions,
    ],
  },
  ...(estimate.alternatives.length ? [{
    title: "Other methods",
    collapsible: true,
    lines: estimate.alternatives.map((option) => `${option.method}: ${option.rate === null ? "timing unknown" : `~${Math.round(option.rate).toLocaleString()} shards / hour`}`),
  }] : []),
];
