import { SHARD_DESCRIPTIONS } from "../constants";
import type { ShardWithDirectInfo } from "../types/types";
import type { ItemTooltipContentProps } from "../ui/ItemTooltip";
import { acquisitionFor } from "./acquisition";
import { shardAttributeCap, type ShardProgressEntry } from "./progressionModel";
import { shardAcquisitionGameText, shardDescriptionGameText, shardTypeGameText } from "./shardGameTextModel";

const descriptions = SHARD_DESCRIPTIONS as Record<string, { title?: string; description?: string }>;

/** Shard lore and actual holdings, independent of the quantity pictured in a route. */
export function shardTooltipContent(shard: ShardWithDirectInfo, progress?: ShardProgressEntry): ItemTooltipContentProps {
  const attribute = descriptions[shard.key];
  const description = attribute?.description ?? "Attribute details unavailable";
  const cap = progress?.cap ?? shardAttributeCap(shard.rarity);
  const fused = progress?.fused;
  const loose = progress?.loose;
  const acquisition = acquisitionFor(shard.key);

  return {
    id: shard.internal_id ?? shard.key,
    name: `${shard.name} Shard`,
    tier: shard.rarity,
    wikiName: `${shard.name} Shard`,
    sections: [
      {
        title: attribute?.title?.trim() || shard.name,
        tone: "bonus",
        lines: [shardDescriptionGameText(shard.key, description) ?? description, shardTypeGameText(shard.type || "Unknown type")],
      },
      { lines: [
        `${fused == null ? "Fused progress unknown" : `${Math.min(fused, cap).toLocaleString()} / ${cap.toLocaleString()} fused`} · ${loose == null ? "Storage unknown" : `${loose.toLocaleString()} in storage`}`,
      ] },
      { title: "Acquisition", collapsible: true, lines: acquisition.length
        ? acquisition.map((line) => shardAcquisitionGameText(shard.key, line) ?? line)
        : ["Acquisition details unavailable"],
      },
    ],
  };
}
