import React from "react";
import type { ShardWithDirectInfo } from "../types/types";
import { ItemTooltip } from "../ui/ItemTooltip";
import type { ShardProgressEntry } from "./progressionModel";
import { shardTooltipContent } from "./shardTooltipContent";
import { ShardAcquisitionGuide } from "./ShardAcquisitionGuide";
import { acquisitionEstimateSections, useHuntingEstimate } from "./huntingEstimateContext";

export const ShardTooltip: React.FC<{
  shard?: ShardWithDirectInfo | null;
  progress?: ShardProgressEntry;
  children: React.ReactElement;
  interactive?: boolean;
  wrapperClassName?: string;
}> = ({ shard, progress, children, interactive = false, wrapperClassName = "block min-w-0" }) => {
  const estimate = useHuntingEstimate(shard?.key);
  if (!shard) return children;
  const content = shardTooltipContent(shard, progress);
  return (
    <ItemTooltip
      {...content}
      sections={content.sections?.map(section => section.title === "Acquisition"
        ? { ...section, lines: [<ShardAcquisitionGuide key="acquisition" shardKey={shard.key} />] } : section)}
      skyDexSections={acquisitionEstimateSections(estimate)}
      icon={<img src={`${import.meta.env.BASE_URL}shardIcons/${shard.key}.png`} alt="" width={34} height={34} />}
      interactive={interactive}
      wrapperClassName={wrapperClassName}
      ariaLabel={`${shard.name} Shard details`}
    >
      {children}
    </ItemTooltip>
  );
};
