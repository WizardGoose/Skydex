import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownWideNarrow, Check } from "lucide-react";
import { resourceTierFor } from "../../items/itemResource";
import type { ProfileStatusView } from "../../profile/profileStatus";
import {
  type ProfileSectionState,
  resolveProfileSectionState,
} from "../../profile/riftMuseumDungeons";
import {
  type GardenCommissionRow,
  type GardenBarnSkinRow,
  type GardenCropRow,
  type GardenPreviewModel,
  type GardenVisitorRow,
  type ProfileWorldValueRow,
  gardenBarnSkinView,
} from "../../profile/profileWorlds";
import { compactProfileNumber } from "./profilePbcFormatting";
import ProfileItemTile from "./ProfileItemTile";
import { ProfileIdentityTrigger } from "./ProfileIdentityTrigger";
import { ItemIcon } from "../../ui/ItemIcon";
import { ItemTooltip, ItemTooltipInlineItem } from "../../ui/ItemTooltip";
import { rarityTileClass } from "../../ui/kit";
import {
  ProfilePbcDisclosure,
  ProfilePbcEmpty,
  ProfilePbcHeader,
  ProfilePbcLoading,
  ProfilePbcStatusLine,
  ProfilePbcUnavailable,
} from "./ProfilePbcShared";
import "./rift-museum-dungeons.css";
import "./profile-worlds.css";

export interface GardenPreviewProps {
  status: ProfileStatusView;
  model: GardenPreviewModel | null;
  error?: string | null;
}

const StatePanel: React.FC<{
  state: Exclude<ProfileSectionState, "partial" | "populated" | "empty">;
  status: ProfileStatusView;
  error?: string | null;
}> = ({ state, status, error = null }) => {
  if (state === "loading") return <ProfilePbcLoading rows={5} />;
  if (state === "private" || state === "unavailable") {
    return <ProfilePbcUnavailable status={status} noun="Garden" error={error} />;
  }
  return <ProfilePbcEmpty>The Garden has not been opened on this profile.</ProfilePbcEmpty>;
};

const RequestItems: React.FC<{ rows: readonly GardenCommissionRow["requirements"][number][] }> = ({ rows }) => (
  <span className="profile-world-request-items">
    {rows.map((requirement) => {
      const tier = resourceTierFor(requirement.itemId);
      const icon = (
        <ItemIcon
          name={requirement.label}
          id={requirement.itemId}
          hypixelId={requirement.itemId}
          size={23}
          fallback="blank"
        />
      );
      const amount = requirement.amount === null ? "Amount unavailable" : `×${requirement.amount.toLocaleString()}`;
      return (
        <ItemTooltip
          id={requirement.itemId}
          name={requirement.label}
          wikiName={requirement.label}
          icon={icon}
          tier={tier}
          tierIsDisplayed={Boolean(tier)}
          count={requirement.amount ?? undefined}
          sections={[{ title: "Visitor request", lines: [amount] }]}
          ariaLabel={`${requirement.label}, ${requirement.amount === null ? "amount unavailable" : `${requirement.amount.toLocaleString()} requested`}`}
          wrapperClassName="profile-world-request-item-wrap"
          interactive
          key={requirement.key}
        >
          <button
            type="button"
            className={`profile-world-request-item ${rarityTileClass(tier)}`}
            data-profile-item-tier={tier?.toLowerCase().replace(/_/g, "-") ?? "unknown"}
          >
            <span className="profile-world-request-item-icon" aria-hidden>{icon}</span>
            <span className="profile-world-request-item-copy">
              <strong>{requirement.label}</strong>
              <small className="profile-number">{amount}</small>
            </span>
          </button>
        </ItemTooltip>
      );
    })}
  </span>
);

const requestTooltipLines = (rows: readonly GardenCommissionRow["requirements"][number][]) => rows.map((requirement) => (
  <ItemTooltipInlineItem
    id={requirement.itemId}
    name={requirement.label}
    tier={resourceTierFor(requirement.itemId)}
    count={requirement.amount}
    key={requirement.key}
  />
));

const CommissionCard: React.FC<{ row: GardenCommissionRow }> = ({ row }) => {
  const icon = <ItemIcon name={row.iconName} id={row.iconName} fallbackName="Villager" size={36} />;
  return (
    <article className="profile-world-commission-card" data-profile-item-tier={row.tier ?? "unknown"}>
      <ProfileIdentityTrigger
        id={null}
        name={row.label}
        wikiName={row.label}
        icon={icon}
        tier={row.tier}
        tierIsDisplayed={Boolean(row.tier)}
        metadata={[
          { label: "Status", value: row.status ?? "Unavailable" },
          { label: "Requested items", value: row.requirements.length.toLocaleString(), mono: true },
        ]}
        sections={row.requirements.length > 0 ? [{ title: "Current request", tone: "bonus", lines: requestTooltipLines(row.requirements) }] : []}
        provenance="Garden visitor"
        ariaLabel={`${row.label}, active Garden visitor`}
        wrapperClassName="profile-world-commission-identity-trigger"
        buttonClassName="profile-world-commission-identity"
      >
        <span className="profile-world-commission-portrait" aria-hidden>{icon}</span>
        <span className="profile-world-commission-copy">
          <strong>{row.label}</strong>
          <small className="profile-world-commission-status">{row.status ?? "Status unavailable"}</small>
        </span>
      </ProfileIdentityTrigger>
      <div className="profile-world-commission-request">
        {row.requirements.length === 0
          ? <small>Requirements unavailable</small>
          : <RequestItems rows={row.requirements} />}
      </div>
    </article>
  );
};

const BarnSkinIdentity: React.FC<{
  skin: GardenBarnSkinRow | string;
  state: "Selected" | "Unlocked";
}> = ({ skin: rawSkin, state }) => {
  const skin = gardenBarnSkinView(rawSkin);
  const tier = skin.tier ?? resourceTierFor(skin.itemId);
  const icon = (
    <ItemIcon
      name={skin.iconName}
      id={skin.itemId}
      hypixelId={skin.itemId}
      fallbackName="Dark Oak Planks"
      size={state === "Selected" ? 28 : 23}
      fallback="blank"
    />
  );
  return (
    <div
      className={`profile-world-garden-skin-identity profile-world-garden-skin-identity--${state.toLowerCase()}`}
      data-profile-item-tier={tier ?? "unknown"}
    >
      <ProfileIdentityTrigger
        id={null}
        name={skin.label}
        wikiName={skin.wikiName}
        icon={icon}
        tier={tier}
        tierIsDisplayed={Boolean(tier)}
        metadata={[{ label: "State", value: state }]}
        ariaLabel={`${skin.label}, ${state.toLowerCase()} barn skin`}
        wrapperClassName="profile-world-garden-skin-trigger"
        buttonClassName="profile-world-garden-skin-button"
      >
        <span className="profile-world-garden-skin-icon" aria-hidden>{icon}</span>
        <strong>{skin.label}</strong>
      </ProfileIdentityTrigger>
    </div>
  );
};

const BarnSkinShelf: React.FC<{
  available: boolean;
  selected: GardenBarnSkinRow | null;
  unlocked: readonly GardenBarnSkinRow[];
}> = ({ available, selected, unlocked }) => (
  <div className="profile-world-garden-skins" aria-label="Barn skins">
    <section className="profile-world-garden-selected-skin" aria-label="Selected barn skin">
      <span className="profile-world-garden-skin-kicker">Selected barn skin</span>
      {!available || !selected
        ? <strong className="profile-world-garden-skin-unavailable">Unavailable</strong>
        : <BarnSkinIdentity skin={selected} state="Selected" />}
    </section>
    <section className="profile-world-garden-unlocked-skins" aria-label="Unlocked barn skins">
      <span className="profile-world-garden-skin-kicker">
        <span>Unlocked skins</span>
        <strong className="profile-number">{available ? unlocked.length.toLocaleString() : "Unavailable"}</strong>
      </span>
      {available && unlocked.length > 0 ? (
        <div className="profile-world-garden-skin-rail">
          {unlocked.map((skin) => (
            <BarnSkinIdentity key={gardenBarnSkinView(skin).key} skin={skin} state="Unlocked" />
          ))}
        </div>
      ) : available ? (
        <small className="profile-world-garden-skin-unavailable">None recorded</small>
      ) : null}
    </section>
  </div>
);

const CropTile: React.FC<{ row: GardenCropRow }> = ({ row }) => (
  <div className="profile-world-crop-tile">
    <ProfileItemTile
      id={row.itemId ?? row.key}
      name={row.label}
      wikiName={row.label}
      iconId={row.itemId ?? row.key}
      hypixelId={row.itemId}
      tier={resourceTierFor(row.itemId)}
      cornerLabel={row.upgradeLevel}
      sections={[{
        title: "Garden crop",
        lines: [
          row.collected === null ? "Collected: Unavailable" : `Collected: ${row.collected.toLocaleString()}`,
          row.upgradeLevel === null ? "Crop upgrade: Unavailable" : `Crop upgrade: ${row.upgradeLevel.toLocaleString()}`,
        ],
      }]}
      ariaLabel={`${row.label}, ${row.collected === null ? "collection unavailable" : `${row.collected.toLocaleString()} collected`}`}
    />
    <span>{row.label}</span>
  </div>
);

const VisitorCell: React.FC<{ row: GardenVisitorRow; request?: GardenCommissionRow }> = ({ row, request }) => {
  const icon = <ItemIcon name={row.iconName} id={row.iconName} fallbackName="Villager" size={42} />;
  return (
    <article className="profile-world-visitor-cell" data-profile-item-tier={row.tier ?? "unknown"}>
      <ProfileIdentityTrigger
        id={null}
        name={row.label}
        wikiName={row.label}
        icon={icon}
        tier={row.tier}
        tierIsDisplayed={Boolean(row.tier)}
        metadata={[
          { label: "Visits", value: row.visits === null ? "Unavailable" : row.visits.toLocaleString(), mono: true },
          { label: "Completed", value: row.completed === null ? "Unavailable" : row.completed.toLocaleString(), mono: true },
        ]}
        sections={request && request.requirements.length > 0 ? [{ title: "Current request", tone: "bonus", lines: requestTooltipLines(request.requirements) }] : []}
        provenance="Garden visitor"
        ariaLabel={`${row.label}, Garden visitor`}
        wrapperClassName="profile-world-visitor-identity-trigger"
        buttonClassName="profile-world-visitor-identity-button"
      >
        <span className="profile-world-visitor-face" aria-hidden>{icon}</span>
        <span className="profile-world-visitor-copy">
          <strong>{row.label}</strong>
          <small className="profile-number">{row.completed === null ? "Completed unavailable" : `${row.completed.toLocaleString()} completed`}</small>
        </span>
      </ProfileIdentityTrigger>
      {request && request.requirements.length > 0 && <span className="profile-world-visitor-request"><RequestItems rows={request.requirements} /></span>}
      <b className="profile-number">{row.visits === null ? "Visits unavailable" : `${row.visits.toLocaleString()} visits`}</b>
    </article>
  );
};

type VisitorSort = "rarity-desc" | "rarity-asc";

const VISITOR_SORT_OPTIONS: readonly { value: VisitorSort; label: string }[] = [
  { value: "rarity-desc", label: "Highest rarity" },
  { value: "rarity-asc", label: "Lowest rarity" },
];

const VISITOR_TIER_RANK: Readonly<Record<string, number>> = {
  special: 5,
  mythic: 4,
  legendary: 3,
  rare: 2,
  uncommon: 1,
  unknown: 0,
};

const visitorFold = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

const VisitorSortMenu: React.FC<{
  value: VisitorSort;
  onChange: (value: VisitorSort) => void;
}> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = VISITOR_SORT_OPTIONS.find((option) => option.value === value) ?? VISITOR_SORT_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className={`profile-world-visitor-sort ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="profile-world-visitor-sort-trigger"
        aria-label={`Sort Garden visitors: ${selected.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ArrowDownWideNarrow aria-hidden />
        <span>{selected.label}</span>
      </button>
      {open && (
        <div className="profile-world-visitor-sort-menu" role="listbox" aria-label="Sort Garden visitors">
          {VISITOR_SORT_OPTIONS.map((option) => {
            const active = option.value === value;
            return (
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={active ? "is-selected" : ""}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                key={option.value}
              >
                <span>{option.label}</span>
                {active && <Check aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const VisitorBrowser: React.FC<{
  rows: readonly GardenVisitorRow[];
  activeCommissions: readonly GardenCommissionRow[];
  sort: VisitorSort;
}> = ({ rows, activeCommissions, sort }) => {
  const sortedRows = useMemo(() => [...rows].sort((left, right) => {
    const leftRank = VISITOR_TIER_RANK[left.tier ?? "unknown"] ?? 0;
    const rightRank = VISITOR_TIER_RANK[right.tier ?? "unknown"] ?? 0;
    const rarity = sort === "rarity-desc" ? rightRank - leftRank : leftRank - rightRank;
    return rarity || left.label.localeCompare(right.label);
  }), [rows, sort]);
  const requestByVisitor = useMemo(() => new Map(activeCommissions.flatMap((row) => [
    [visitorFold(row.key), row] as const,
    [visitorFold(row.label), row] as const,
  ])), [activeCommissions]);
  return (
    <div className="profile-world-visitor-browser">
      <div className="profile-world-visitor-grid">
        {sortedRows.map((row) => (
          <VisitorCell
            key={row.key}
            row={row}
            request={requestByVisitor.get(visitorFold(row.key)) ?? requestByVisitor.get(visitorFold(row.label))}
          />
        ))}
      </div>
    </div>
  );
};

const ValueGrid: React.FC<{ rows: readonly ProfileWorldValueRow[]; empty: string }> = ({ rows, empty }) => rows.length === 0 ? (
  <p className="profile-rmd-field-state">{empty}</p>
) : (
  <div className="profile-world-value-grid">
    {rows.map((row) => <div className="profile-world-value-row" key={row.key}><span>{row.label}</span><strong className="profile-number">{row.value.toLocaleString()}</strong></div>)}
  </div>
);

export const GardenPreview: React.FC<GardenPreviewProps> = ({ status, model, error = null }) => {
  const [visitorSort, setVisitorSort] = useState<VisitorSort>("rarity-desc");
  const visibleState = resolveProfileSectionState(status, model?.state);
  const available = (section: keyof NonNullable<GardenPreviewModel["availability"]>): boolean => model?.availability?.[section] !== false;

  return (
    <section className="profile-rmd-preview profile-world-preview" aria-label="Garden" data-profile-section-state={visibleState}>
      <section className="profile-rmd-shell profile-glass" aria-label="Garden progress">
        <ProfilePbcHeader eyebrow="Garden" title="Garden progress" count={null} countLabel="" />
        {visibleState !== "partial" && visibleState !== "populated" && visibleState !== "empty" ? (
          <StatePanel state={visibleState} status={status} error={error} />
        ) : visibleState === "empty" || !model ? (
          <ProfilePbcEmpty>No Garden progress is recorded on this profile.</ProfilePbcEmpty>
        ) : (
          <div className="profile-rmd-content profile-world-content">
            <ProfilePbcStatusLine status={status} partial={visibleState === "partial"} />
            <div className="profile-world-garden-board">
              <section className="profile-world-garden-current" aria-labelledby="garden-current-title">
                <header><strong id="garden-current-title">Current Garden</strong></header>
                <dl className="profile-metrics profile-metrics--four profile-metrics--standalone profile-world-garden-facts">
                  <div className="profile-metric profile-metric--garden-experience"><dt className="profile-metric-label">Garden XP</dt><dd className="profile-number">{available("experience") && model.experience !== null ? compactProfileNumber(model.experience) : "Unavailable"}</dd></div>
                  <div className="profile-metric profile-metric--garden-plots"><dt className="profile-metric-label">Unlocked plots</dt><dd className="profile-number">{available("plots") ? model.unlockedPlots.length.toLocaleString() : "Unavailable"}</dd></div>
                  <div className="profile-metric profile-metric--garden-visitors"><dt className="profile-metric-label">Visitors completed</dt><dd className="profile-number">{available("visitorTotals") && model.totalVisitorsCompleted !== null ? model.totalVisitorsCompleted.toLocaleString() : "Unavailable"}</dd></div>
                  <div className="profile-metric profile-metric--garden-unique"><dt className="profile-metric-label">Unique visitors</dt><dd className="profile-number">{available("visitorTotals") && model.uniqueVisitorsServed !== null ? model.uniqueVisitorsServed.toLocaleString() : "Unavailable"}</dd></div>
                </dl>
                <BarnSkinShelf
                  available={available("barnSkins")}
                  selected={model.selectedBarnSkin}
                  unlocked={model.unlockedBarnSkins}
                />
              </section>
              <div className="profile-world-garden-flow">
                <div className="profile-world-garden-rail profile-world-garden-rail--left">
                  <section className="profile-world-garden-visitors" aria-labelledby="garden-commissions-title">
                    <header><strong id="garden-commissions-title">Active visitors</strong><span>{available("commissions") ? model.activeCommissions.length.toLocaleString() : "Unavailable"}</span></header>
                    {!available("commissions") ? <p className="profile-rmd-field-state">Garden commission data is unavailable.</p> : model.activeCommissions.length === 0 ? (
                      <p className="profile-rmd-field-state">No active Garden visitors are recorded.</p>
                    ) : <div className="profile-world-commission-grid">{model.activeCommissions.map((row) => <CommissionCard key={row.key} row={row} />)}</div>}
                  </section>
                  <section className="profile-world-garden-system profile-world-garden-system--composter" aria-labelledby="garden-composter-title">
                    <header>
                      <span className="profile-world-garden-system-icon" aria-hidden>
                        <ItemIcon name="Composter" id="COMPOSTER" size={30} fallbackName="Composter" fallback="blank" />
                      </span>
                      <div>
                        <strong id="garden-composter-title">Composter</strong>
                        <small>{available("composter") ? `${model.composter.upgrades.length.toLocaleString()} upgrades` : "Unavailable"}</small>
                      </div>
                    </header>
                    {!available("composter") ? <p className="profile-rmd-field-state">Composter data is unavailable.</p> : !model.composter.present ? <p className="profile-rmd-field-state">No composter data is recorded.</p> : (
                      <div className="profile-world-composter">
                        <dl className="profile-world-system-stats">
                          <div><dt>Organic matter</dt><dd className="profile-number">{model.composter.organicMatter === null ? "Unavailable" : compactProfileNumber(model.composter.organicMatter)}</dd></div>
                          <div><dt>Fuel</dt><dd className="profile-number">{model.composter.fuelUnits === null ? "Unavailable" : compactProfileNumber(model.composter.fuelUnits)}</dd></div>
                          <div><dt>Compost</dt><dd className="profile-number">{model.composter.compostUnits === null ? "Unavailable" : model.composter.compostUnits.toLocaleString()}</dd></div>
                          <div><dt>Items</dt><dd className="profile-number">{model.composter.compostItems === null ? "Unavailable" : model.composter.compostItems.toLocaleString()}</dd></div>
                        </dl>
                        <ValueGrid rows={model.composter.upgrades} empty="No composter upgrades are recorded." />
                      </div>
                    )}
                  </section>
                </div>
                <div className="profile-world-garden-rail profile-world-garden-rail--right">
                  <section className="profile-world-crops" aria-labelledby="garden-crops-title">
                    <header><strong id="garden-crops-title">Crops</strong><span>{available("cropsCollected") || available("cropUpgrades") ? model.crops.length.toLocaleString() : "Unavailable"}</span></header>
                    {!available("cropsCollected") && !available("cropUpgrades") ? <p className="profile-rmd-field-state">Garden crop data is unavailable.</p> : model.crops.length === 0 ? (
                      <p className="profile-rmd-field-state">No crop progress is recorded.</p>
                    ) : <div className="profile-world-item-grid">{model.crops.map((row) => <CropTile key={row.key} row={row} />)}</div>}
                  </section>
                  <section className="profile-world-garden-system profile-world-garden-system--upgrades" aria-labelledby="garden-upgrades-title">
                    <header>
                      <span className="profile-world-garden-system-icon" aria-hidden>
                        <ItemIcon name="Garden Desk" id="GARDEN_DESK" size={30} fallbackName="Oak Desk" fallback="blank" />
                      </span>
                      <div>
                        <strong id="garden-upgrades-title">Garden upgrades</strong>
                        <small>{available("deskUpgrades") ? `${model.deskUpgrades.length.toLocaleString()} active` : "Unavailable"}</small>
                      </div>
                    </header>
                    {!available("deskUpgrades") ? <p className="profile-rmd-field-state">Garden upgrade data is unavailable.</p> : (
                      <ValueGrid rows={model.deskUpgrades} empty="No Garden upgrades are recorded." />
                    )}
                  </section>
                </div>
              </div>
            </div>

            <div className="profile-rmd-pages profile-world-depth">
              <ProfilePbcDisclosure
                storageId="garden-visitors"
                title="Visitors"
                count={available("visitors") ? model.visitors.length : null}
                initiallyExpanded={false}
                controls={available("visitors") && model.visitors.length > 0 ? (
                  <VisitorSortMenu value={visitorSort} onChange={setVisitorSort} />
                ) : null}
              >
                {!available("visitors") ? <p className="profile-rmd-field-state">Garden visitor totals are unavailable.</p> : model.visitors.length === 0 ? (
                  <p className="profile-rmd-field-state">No Garden visitor totals are recorded.</p>
                ) : <VisitorBrowser rows={model.visitors} activeCommissions={model.activeCommissions} sort={visitorSort} />}
              </ProfilePbcDisclosure>
            </div>
          </div>
        )}
      </section>
    </section>
  );
};

export default GardenPreview;
