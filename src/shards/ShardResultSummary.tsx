import { useEffect, type ReactNode } from "react";
import type { Shard } from "../types/types";
import { SHARD_DESCRIPTIONS } from "../constants";
import { getRarityColor } from "../utilities";
import { ShardGameText } from "./ShardGameTextView";
import { shardDescriptionGameText, shardTypeGameText } from "./shardGameTextModel";
import { requestSkillIcons, useSkillIcons } from "../island/skillIcons";
import { ItemIcon } from "../ui/ItemIcon";
import { Info } from "lucide-react";
import { FOCUS } from "../ui/kit";
import { UtilityInfo } from "../profile-view/UtilityMetric";
import { ShardAcquisitionGuide } from "./ShardAcquisitionGuide";

export function ShardCategory({ type, iconOnly = false }: { type: string; iconOnly?: boolean }) {
  const { icons } = useSkillIcons();
  useEffect(() => requestSkillIcons(), []);
  const icon = icons?.[type.trim().toLowerCase()];
  if (iconOnly && !icon) return <span className="sr-only">{type}</span>;
  return <span className="shards-result-category" title={iconOnly ? type : undefined}>
    {icon && <ItemIcon name={icon} id={icon} size={iconOnly ? 16 : 20} fallback="blank" />}
    {iconOnly ? <span className="sr-only">{type}</span> : <ShardGameText text={shardTypeGameText(type)} />}
  </span>;
}

export function ShardResultSummary({ shardKey, shard, picture, children, calculation, showName = true }: {
  shardKey: string; shard: Shard; picture: ReactNode; children?: ReactNode; calculation?: ReactNode; showName?: boolean;
}) {
  const attribute = (SHARD_DESCRIPTIONS as Record<string, { title?: string; description?: string }>)[shardKey];
  return <section className="shards-result-summary" aria-label={`${shard.name} shard details`}>
    <div className="shards-result-identity">
      {picture}
      {showName && <div><strong className={getRarityColor(shard.rarity)}>{shard.name} <ShardCategory type={shard.type} iconOnly /></strong></div>}
    </div>
    {children}
    <div className="shards-result-attribute">
      {attribute?.title && <strong>{attribute.title}</strong>}
      <UtilityInfo activation="click" title={`${shard.name} sources`} info={{}} className="shards-calculator-sources"
        details={<ShardAcquisitionGuide shardKey={shardKey} />}>
        <button type="button" className={FOCUS}><Info size={13} aria-hidden /></button>
      </UtilityInfo>
      {attribute?.description && <p><ShardGameText text={shardDescriptionGameText(shardKey, attribute.description) ?? attribute.description} /></p>}
      {calculation}
    </div>
  </section>;
}
