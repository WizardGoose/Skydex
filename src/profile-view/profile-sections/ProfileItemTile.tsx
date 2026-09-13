import React from "react";
import { Check } from "lucide-react";
import { ItemIcon } from "../../ui/ItemIcon";
import { ItemTooltip, type ItemTooltipContentProps } from "../../ui/ItemTooltip";
import { rarityTileClass } from "../../ui/kit";
import "./profile-item-tiles.css";

export interface ProfileItemTileProps extends Omit<ItemTooltipContentProps, "icon"> {
  iconId?: string | null;
  /** Image lookup name when the visible item/family name is not its texture title. */
  iconName?: string | null;
  /** Safe generic texture used only if the exact icon name cannot resolve. */
  iconFallbackName?: string | null;
  /** False for identities such as pets, where a generic head would be wrong. */
  allowSemanticFallback?: boolean;
  /** Prefer exact wiki artwork over pack/resource material models. */
  preferWikiIdentity?: boolean;
  /** Render animated wiki artwork as a still thumbnail on dense surfaces. */
  freezeAnimatedMedia?: boolean;
  /** Null deliberately prevents a raw item id from outranking an exact wiki identity. */
  hypixelId?: string | null;
  iconSrc?: string | null;
  /** Identity render used only after all exact wiki image candidates fail. */
  iconTerminalSrc?: string | null;
  /** Preserve the shared tile while allowing a larger workflow to scale its art. */
  iconSize?: number;
  /** Preserve captured skins or domain artwork inside the canonical tile. */
  iconElement?: React.ReactNode;
  active?: boolean;
  /** Short visual count; the tooltip and accessible label still retain the exact quantity. */
  countLabel?: string | null;
  cornerLabel?: string | number | null;
  ariaLabel?: string;
  selected?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}

/** A dense rarity cell for item-heavy Profile overviews. */
export const ProfileItemTile: React.FC<ProfileItemTileProps> = ({
  iconId,
  iconName = null,
  iconFallbackName = null,
  allowSemanticFallback = true,
  preferWikiIdentity = false,
  freezeAnimatedMedia = false,
  hypixelId,
  iconSrc = null,
  iconTerminalSrc = null,
  iconSize = 34,
  iconElement,
  active = false,
  countLabel = null,
  cornerLabel = null,
  ariaLabel,
  selected = false,
  onClick,
  ...tooltip
}) => {
  const icon = iconElement ?? (
    <ItemIcon
      name={iconName ?? tooltip.wikiName ?? tooltip.name}
      id={iconId ?? tooltip.id ?? tooltip.name}
      hypixelId={hypixelId === null ? undefined : hypixelId ?? tooltip.id ?? undefined}
      src={iconSrc ?? undefined}
      terminalSrc={iconTerminalSrc ?? undefined}
      fallbackName={iconFallbackName ?? undefined}
      allowSemanticFallback={allowSemanticFallback}
      preferWikiIdentity={preferWikiIdentity}
      freezeAnimatedMedia={freezeAnimatedMedia}
      size={iconSize}
      fallback="blank"
    />
  );
  const count = typeof tooltip.count === "number" && tooltip.count > 1 ? tooltip.count : null;
  const label = ariaLabel ?? [tooltip.name, tooltip.tier, active ? "active" : null].filter(Boolean).join(", ");

  return (
    <ItemTooltip
      {...tooltip}
      id={hypixelId ?? tooltip.id}
      icon={icon}
      ariaLabel={label}
      wrapperClassName="profile-item-tile-wrap"
      interactive={Boolean(onClick)}
    >
      <button
        type="button"
        className={`profile-item-tile ${rarityTileClass(tooltip.tier)} ${active ? "is-active" : ""} ${selected ? "is-selected" : ""}`}
        data-profile-item-tier={tooltip.tier?.toLowerCase() ?? "unknown"}
        aria-pressed={onClick ? selected : undefined}
        onClick={onClick}
      >
        <span className="profile-item-tile-icon" aria-hidden>{icon}</span>
        {count !== null && <strong className="profile-item-tile-count profile-item-overlay-text profile-number">{countLabel ?? count.toLocaleString()}</strong>}
        {cornerLabel !== null && cornerLabel !== "" && <span className="profile-item-tile-corner profile-item-overlay-text profile-number">{cornerLabel}</span>}
        {active && <span className="profile-item-tile-active" title="Active"><Check aria-hidden /></span>}
      </button>
    </ItemTooltip>
  );
};

export default ProfileItemTile;
