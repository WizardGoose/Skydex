import React, { useEffect, useMemo, useState } from "react";
import { Grid3X3, KeyRound } from "lucide-react";
import {
  ACQUISITION_LABEL,
  ACQUISITION_ORDER,
  accessoryPowerStats,
  bagFromParsedItems,
  isNormalAccessory,
  refreshOwned,
  useAccessories,
  type AccessoryAcquisitionCategory,
  type AccessoryReadinessKind,
} from "../accessories";
import { AccessoryTile } from "../accessories/ui/AccessoryTile";
import { rarityClass } from "../accessories/ui/display";
import { collapseNonStackingAccessories } from "../accessories/ui/equivalence";
import { actionablePathOf } from "../accessories/ui/actionable";
import {
  filterEntries,
  filterIsIdle,
  type AccessoryFilter,
} from "../accessories/ui/group";
import type { ActionablePath } from "../accessories/ui/sourceMeta";
import type { AccessoryView } from "../accessories/ui/types";
import { useShopStock } from "../items/wikiShops";
import { itemLabel } from "../ui/itemTooltipModel";
import { ItemIcon } from "../ui/ItemIcon";
import { skyBlockStatPresentation } from "../utilities/utilityFunctions";
import {
  ACCESSORY_READINESS_FILTERS,
  accessoryFacetIsDisabled,
  accessoryFacetMatchCounts,
  matchesAccessoryProgressFilter,
  type AccessoryProgressFilter,
} from "./accessoryFacets";
import { ProfileProgressionFilters } from "./profile-sections/ProfileProgressionFilters";
import "./accessories-preview.css";

export interface AccessorySetupView {
  power: string | null;
  tuning: readonly {
    key: string;
    label: string;
    value: string;
  }[];
}

export interface AccessoriesPreviewProps {
  profileId: string | null;
  setup?: AccessorySetupView | null;
  /** Already-decoded talisman bag from the shared Profile snapshot. */
  ownedItems?: readonly unknown[] | null;
  /** Profile-only MP modifiers retained with the shared sanitized snapshot. */
  abiphoneContacts?: number | null;
  consumedPrism?: boolean;
  /** Public lookups must not consult or refresh the visitor's personal accessory store. */
  publicProfile?: boolean;
}

const ACQUISITION_PRESENTATION: Record<AccessoryAcquisitionCategory, { id: string; name: string; accent: string }> = {
  collections: { id: "BOOK", name: "Book", accent: "#55ffff" },
  upgradePaths: { id: "ANVIL", name: "Anvil", accent: "#ffff55" },
  slayer: { id: "REVENANT_FLESH", name: "Revenant Flesh", accent: "#ff5555" },
  dungeons: { id: "WITHER_SKELETON_SKULL", name: "Wither Skeleton Skull", accent: "#aa55ff" },
  kuudra: { id: "KUUDRA_TEETH", name: "Kuudra Teeth", accent: "#ff8a45" },
  mining: { id: "MITHRIL_ORE", name: "Mithril", accent: "#55ffff" },
  garden: { id: "WHEAT", name: "Wheat", accent: "#55ff55" },
  fishing: { id: "FISHING_ROD", name: "Fishing Rod", accent: "#5599ff" },
  dragons: { id: "DRAGON_EGG", name: "Dragon Egg", accent: "#ff55ff" },
  quests: { id: "WRITABLE_BOOK", name: "Book and Quill", accent: "#ffff55" },
  npcShops: { id: "EMERALD", name: "Emerald", accent: "#55ff55" },
  mobDrops: { id: "ROTTEN_FLESH", name: "Rotten Flesh", accent: "#ff7777" },
  shensAuction: { id: "ARTIFACT_OF_CONTROL", name: "Artifact of Control", accent: "#ff55ff" },
  darkAuction: { id: "MIDAS_SWORD", name: "Midas' Sword", accent: "#aa55ff" },
  events: { id: "NEW_YEAR_CAKE", name: "New Year Cake", accent: "#ffb3e6" },
  generalCrafting: { id: "CRAFTING_TABLE", name: "Crafting Table", accent: "#55ffff" },
  legacy: { id: "BARRIER", name: "Barrier", accent: "#9aa8b5" },
  needsReview: { id: "PAPER", name: "Paper", accent: "#ffaa55" },
};

const EMPTY_SECTION = (
  <div className="profile-accessory-empty" role="status">
    No accessories are visible in this section.
  </div>
);

const AccessoryMetric: React.FC<{
  label: string;
  value: React.ReactNode;
  primary?: boolean;
  detail?: string;
}> = ({ label, value, primary = false, detail }) => (
  <span
    className={`profile-accessory-metric ${primary ? "profile-accessory-metric--primary" : ""}`}
    title={detail}
  >
    <small>{label}</small>
    <strong className="profile-number">{value}</strong>
  </span>
);

const formattedStatValue = (value: number): string => value.toLocaleString("en-US", {
  maximumFractionDigits: 2,
});

const AccessoryStatRow: React.FC<{
  label: string;
  value: string;
  shortLabel?: string;
  glyph?: string | null;
  statKey?: string;
}> = ({ label, value, shortLabel, glyph, statKey }) => {
  const presentation = skyBlockStatPresentation(label);
  return (
    <span className="profile-accessory-stat-row profile-tuning-stat" data-stat={statKey} title={label}>
      <i className={`profile-tuning-glyph ${presentation?.colorClass ?? ""}`} aria-hidden>{glyph ?? presentation?.glyph ?? "•"}</i>
      <span className={`profile-tuning-label ${presentation?.colorClass ?? ""}`}>{shortLabel ?? label}</span>
      <strong className="profile-number">{value}</strong>
    </span>
  );
};

const AccessoryGrid: React.FC<{
  entries: readonly AccessoryView[];
  actionable?: ReadonlyMap<string, ActionablePath>;
  recombed?: ReadonlySet<string>;
  markTransferable?: boolean;
}> = ({ entries, actionable, recombed, markTransferable = false }) => {
  return (
    <div className="profile-accessory-grid" data-accessory-render-count={entries.length}>
      {entries.map((entry) => (
        <AccessoryTile
          key={entry.id}
          entry={entry}
          actionable={actionable?.get(entry.id) ?? null}
          recombed={recombed?.has(entry.id) ?? false}
          markTransferable={markTransferable}
        />
      ))}
    </div>
  );
};

export const AccessoriesPreview: React.FC<AccessoriesPreviewProps> = ({
  profileId,
  setup = null,
  ownedItems,
  abiphoneContacts = null,
  consumedPrism = false,
  publicProfile = false,
}) => {
  const parsedBag = useMemo(
    () => Array.isArray(ownedItems) ? bagFromParsedItems(ownedItems) : undefined,
    [ownedItems],
  );
  const snapshot = useAccessories(
    parsedBag,
    { abiphoneContacts, consumedPrism },
    { isolatedProfile: publicProfile },
  );
  const shops = useShopStock();
  const [query, setQuery] = useState("");
  const [progressFilter, setProgressFilter] = useState<AccessoryProgressFilter>("missing");
  const [routeFilters, setRouteFilters] = useState<AccessoryAcquisitionCategory[]>([]);
  const [readinessFilters, setReadinessFilters] = useState<AccessoryReadinessKind[]>([]);

  useEffect(() => {
    if (!publicProfile) void refreshOwned();
  }, [profileId, publicProfile]);

  const filter = useMemo<AccessoryFilter>(() => ({
    query: query.trim().toLowerCase(),
    sources: [],
    groups: [],
    showCovered: false,
  }), [query]);
  const normalEntries = useMemo(
    () => snapshot.entries.filter(isNormalAccessory),
    [snapshot.entries],
  );
  const textMatches = useMemo(
    () => filterEntries(normalEntries, filter),
    [filter, normalEntries],
  );
  const facetScope = useMemo(
    () => snapshot.ownedKnown
      ? textMatches.filter((entry) => matchesAccessoryProgressFilter(entry, progressFilter))
      : textMatches,
    [progressFilter, snapshot.ownedKnown, textMatches],
  );
  const facetUniverse = useMemo(() => {
    const entries = filterEntries(normalEntries, { ...filter, query: "" });
    return snapshot.ownedKnown
      ? entries.filter((entry) => matchesAccessoryProgressFilter(entry, progressFilter))
      : entries;
  }, [filter, normalEntries, progressFilter, snapshot.ownedKnown]);
  const { routeCounts, readinessCounts } = useMemo(
    () => accessoryFacetMatchCounts(facetScope, routeFilters, readinessFilters),
    [facetScope, readinessFilters, routeFilters],
  );
  const routeOptions = useMemo(
    () => ACQUISITION_ORDER.filter((category) => (
      routeFilters.includes(category)
      || facetUniverse.some((entry) => entry.acquisition.category === category)
    )),
    [facetUniverse, routeFilters],
  );
  const readinessOptions = useMemo(
    () => ACCESSORY_READINESS_FILTERS.filter(({ kind }) => (
      readinessFilters.includes(kind)
      || facetUniverse.some((entry) => entry.readiness.kind === kind)
    )),
    [facetUniverse, readinessFilters],
  );
  const visible = useMemo(() => {
    return textMatches.filter((entry) => (
      (routeFilters.length === 0 || routeFilters.includes(entry.acquisition.category))
      && (readinessFilters.length === 0 || readinessFilters.includes(entry.readiness.kind))
    ));
  }, [readinessFilters, routeFilters, textMatches]);
  const filterCount = routeFilters.length + readinessFilters.length;
  const idle = filterIsIdle(filter) && filterCount === 0;
  const progressGroups = useMemo(() => {
    const nextRungs = collapseNonStackingAccessories(visible.filter((entry) => entry.foldedBehind === null && !entry.coveredByFamily));
    return {
      missing: nextRungs.filter((entry) => entry.status !== "owned" && entry.ownedPrerequisite === null),
      upgrades: nextRungs.filter((entry) => entry.status !== "owned" && entry.ownedPrerequisite !== null),
      owned: nextRungs.filter((entry) => entry.status === "owned"),
    } satisfies Record<AccessoryProgressFilter, AccessoryView[]>;
  }, [visible]);
  const catalogueLineCount = progressGroups.missing.length
    + progressGroups.upgrades.length
    + progressGroups.owned.length;
  const actionable = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, ActionablePath>();
    for (const entry of normalEntries) {
      const path = actionablePathOf(entry, shops.index, now);
      if (path !== null) map.set(entry.id, path);
    }
    return map;
  }, [normalEntries, shops.index]);
  const selectedEntries = snapshot.ownedKnown ? progressGroups[progressFilter] : visible;

  const clearProgressionFilters = () => {
    setQuery("");
    setRouteFilters([]);
    setReadinessFilters([]);
  };

  const toggleRoute = (category: AccessoryAcquisitionCategory) => {
    setRouteFilters((current) => current.includes(category)
      ? current.filter((value) => value !== category)
      : [...current, category]);
  };

  const toggleReadiness = (kind: AccessoryReadinessKind) => {
    setReadinessFilters((current) => current.includes(kind)
      ? current.filter((value) => value !== kind)
      : [...current, kind]);
  };

  if (snapshot.loading && snapshot.entries.length === 0) {
    return (
      <section className="profile-accessories-preview" aria-label="Accessories">
        <section className="profile-accessory-bag profile-glass" aria-live="polite">
          <header className="profile-panel-head">
            <div className="profile-loadout-title-copy">
              <span className="profile-eyebrow">Accessories</span>
              <h2>Current accessory setup</h2>
            </div>
          </header>
          <div className="profile-accessory-loading">
            <div className="profile-accessory-loading-grid" aria-hidden>
              {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
            </div>
          </div>
        </section>
      </section>
    );
  }

  const { ownedKnown } = snapshot;
  const empty = idle ? EMPTY_SECTION : (
    <div className="profile-accessory-empty" role="status">
      Nothing in this section matches the current filters.
    </div>
  );
  const powerFigure = snapshot.magicalPower;
  const selectedPowerStats = accessoryPowerStats(setup?.power, powerFigure?.total);
  const powerDetail = powerFigure === null
    ? undefined
    : [
        `${powerFigure.counted.toLocaleString()} active accessories counted`,
        powerFigure.skipped > 0 ? `${powerFigure.skipped.toLocaleString()} skipped` : null,
        powerFigure.unknownTier > 0 ? `${powerFigure.unknownTier.toLocaleString()} with unknown rarity` : null,
      ].filter(Boolean).join("; ");
  const bagProgressMetrics = (
    <div className="profile-accessory-metrics profile-accessory-current" aria-label="Accessory bag progress">
      {ownedKnown && <AccessoryMetric label="Missing" value={progressGroups.missing.length.toLocaleString()} />}
      {ownedKnown && <AccessoryMetric label="Upgrades" value={progressGroups.upgrades.length.toLocaleString()} />}
      {ownedKnown && <AccessoryMetric label="Owned" value={progressGroups.owned.length.toLocaleString()} />}
      <AccessoryMetric label="Catalogue" value={catalogueLineCount.toLocaleString()} />
    </div>
  );

  return (
    <section className="profile-accessories-preview" aria-label="Accessories">
      <section className="profile-accessory-bag profile-glass" aria-label="Accessory bag">
        <header className="profile-panel-head">
          <div className="profile-loadout-title-copy">
            <span className="profile-eyebrow">Accessories</span>
            <h2>Current accessory setup</h2>
          </div>
          <span className="profile-live-state profile-accessory-summary-count">
            {ownedKnown && <Grid3X3 aria-hidden />}
            {ownedKnown ? "Bag read" : "Catalogue only"}
          </span>
        </header>

        <div className="profile-accessory-current-layout">
          {(powerFigure !== null || setup?.power) && (
            <div className="profile-accessory-player-state" aria-label="Current accessory setup">
              <div className="profile-accessory-summary-metrics">
                {powerFigure !== null && (
                  <AccessoryMetric
                    label="Magical Power"
                    value={powerFigure.total.toLocaleString()}
                    primary
                    detail={powerDetail}
                  />
                )}
                {snapshot.activeCount !== null && (
                  <AccessoryMetric label="Active accessories" value={snapshot.activeCount.toLocaleString()} />
                )}
                {snapshot.activeRecombobulated !== null && (
                  <AccessoryMetric label="Recombobulated" value={snapshot.activeRecombobulated.toLocaleString()} />
                )}
              </div>
              {setup?.power && (
                <section className="profile-accessory-power-stone">
                  <small>Selected Power</small>
                  <strong>{setup.power}</strong>
                  {selectedPowerStats.length > 0 && (
                    <div className="profile-accessory-power-stats profile-accessory-stat-grid profile-tuning-grid" aria-label={`${setup.power} stats at ${powerFigure?.total.toLocaleString()} Magical Power`}>
                      {selectedPowerStats.map((stat) => (
                        <AccessoryStatRow
                          label={stat.label}
                          shortLabel={stat.shortLabel}
                          glyph={stat.glyph}
                          statKey={stat.key}
                          value={`${stat.value >= 0 ? "+" : ""}${stat.value.toLocaleString()}`}
                          key={stat.key}
                        />
                      ))}
                    </div>
                  )}
                  {setup.tuning.length > 0 && (
                    <div className="profile-accessory-tuning" aria-label="Current tuning">
                      <small>Tuning</small>
                      <div className="profile-accessory-tuning-grid profile-accessory-stat-grid profile-tuning-grid">
                        {setup.tuning.map((stat) => (
                          <AccessoryStatRow label={stat.label} value={stat.value} statKey={stat.key} key={stat.key} />
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {powerFigure !== null && (
            <div className="profile-accessory-breakdown-grid">
              <div className="profile-accessory-breakdown-stack">
                <section className="profile-accessory-breakdown" aria-label="Magical Power breakdown">
                <header>
                  <small>Magical Power breakdown</small>
                  <strong className="profile-number">{powerFigure.total.toLocaleString()} MP</strong>
                </header>
                <div>
                  {powerFigure.breakdown.map((row) => (
                    <span key={row.tier}>
                      <b className="profile-number">{row.mpEach} MP</b>
                      <span>× {row.count.toLocaleString()} <em className={rarityClass(row.tier)}>{row.tier.replaceAll("_", " ")}</em></span>
                      <strong className="profile-number">{row.subtotal.toLocaleString()} MP</strong>
                    </span>
                  ))}
                  {powerFigure.hegemonyBonus > 0 && (
                    <span><b>Hegemony</b><span>Double MP bonus</span><strong className="profile-number">+{powerFigure.hegemonyBonus.toLocaleString()} MP</strong></span>
                  )}
                  {powerFigure.riftPrism > 0 && (
                    <span><b>Rift Prism</b><span>Permanent bonus</span><strong className="profile-number">+{powerFigure.riftPrism.toLocaleString()} MP</strong></span>
                  )}
                  {powerFigure.abicaseBonus > 0 && (
                    <span><b>Abicase</b><span>Contact bonus</span><strong className="profile-number">+{powerFigure.abicaseBonus.toLocaleString()} MP</strong></span>
                  )}
                </div>
                </section>
                {bagProgressMetrics}
              </div>

              <section className="profile-accessory-bonuses" aria-label="Active accessory bonuses">
                <header>
                  <small>Active accessory bonuses</small>
                  <strong>{snapshot.statContributions.length.toLocaleString()} stats</strong>
                </header>
                {snapshot.statContributions.length > 0 && (
                  <div className="profile-accessory-stat-list profile-accessory-stat-grid profile-tuning-grid">
                    {snapshot.statContributions.map((stat) => (
                      <AccessoryStatRow
                        label={itemLabel(stat.key)}
                        value={`${stat.value >= 0 ? "+" : ""}${formattedStatValue(stat.value)}`}
                        statKey={stat.key}
                        key={stat.key}
                      />
                    ))}
                  </div>
                )}
                {snapshot.enrichments.length > 0 && (
                  <div className="profile-accessory-enrichments">
                    <small>Enrichments</small>
                    <div className="profile-accessory-enrichment-grid profile-accessory-stat-grid profile-tuning-grid">
                      {snapshot.enrichments.map((enrichment) => {
                        const label = itemLabel(enrichment.key);
                        return (
                          <AccessoryStatRow label={label} value={`${enrichment.count}×`} statKey={enrichment.key} key={enrichment.key} />
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}

          {powerFigure === null && bagProgressMetrics}
        </div>

        {!ownedKnown && !snapshot.loading && (
          <div className="profile-accessory-private" role="status">
            <KeyRound aria-hidden />
            <span>The accessory bag could not be read, so this is the catalogue without ownership claims.</span>
          </div>
        )}

        <section className="profile-accessory-progress" aria-labelledby="profile-accessory-progress-title">
          <header className="profile-accessory-progress-head">
            <div>
              <span className="profile-eyebrow">Collection progress</span>
              <h3 id="profile-accessory-progress-title">
                {ownedKnown ? `${progressFilter === "missing" ? "Missing" : progressFilter === "upgrades" ? "Upgrades" : "Owned"} accessories` : "Accessory catalogue"}
              </h3>
            </div>
            <strong className="profile-number">
              {selectedEntries.length.toLocaleString()} {ownedKnown ? progressFilter : "catalogued"}
            </strong>
          </header>

          <ProfileProgressionFilters
            query={query}
            onQueryChange={setQuery}
            searchLabel="Search accessories by name or family"
            placeholder="Search accessories by name or family"
            groups={[
              {
                legend: "Acquisition route",
                options: routeOptions.map((category) => {
                  const count = routeCounts.get(category) ?? 0;
                  const selected = routeFilters.includes(category);
                  const presentation = ACQUISITION_PRESENTATION[category];
                  return {
                    id: category,
                    label: ACQUISITION_LABEL[category],
                    count,
                    selected,
                    disabled: accessoryFacetIsDisabled(count, selected),
                    onToggle: () => toggleRoute(category),
                    accent: presentation.accent,
                    icon: <ItemIcon
                      name={presentation.name}
                      id={presentation.id}
                      hypixelId={presentation.id}
                      size={18}
                      fallback="blank"
                    />,
                  };
                }),
              },
              {
                legend: "What the profile proves",
                options: readinessOptions.map(({ kind, label }) => {
                  const count = readinessCounts.get(kind) ?? 0;
                  const selected = readinessFilters.includes(kind);
                  return {
                    id: kind,
                    label,
                    count,
                    selected,
                    disabled: accessoryFacetIsDisabled(count, selected),
                    onToggle: () => toggleReadiness(kind),
                  };
                }),
              },
            ]}
            activeCount={filterCount}
            resultCount={selectedEntries.length}
            totalCount={normalEntries.length}
            onClear={clearProgressionFilters}
          />

          <div className="profile-accessory-sections">
            {ownedKnown && (
              <div className="profile-accessory-filter-tabs" role="group" aria-label="Accessory progress filter">
                {(["missing", "upgrades", "owned"] as const).map((nextFilter) => (
                  <button
                    type="button"
                    className={progressFilter === nextFilter ? "is-active" : ""}
                    aria-pressed={progressFilter === nextFilter}
                    disabled={progressFilter !== nextFilter && progressGroups[nextFilter].length === 0}
                    onClick={() => setProgressFilter(nextFilter)}
                    key={nextFilter}
                  >
                    <span>{nextFilter === "missing" ? "Missing" : nextFilter === "upgrades" ? "Upgrades" : "Owned"}</span>
                    <b className="profile-number">{progressGroups[nextFilter].length.toLocaleString()}</b>
                  </button>
                ))}
              </div>
            )}
            <section className="profile-accessory-results" aria-live="polite">
              {selectedEntries.length === 0 ? empty : (
                <AccessoryGrid
                  entries={selectedEntries}
                  actionable={actionable}
                  recombed={snapshot.recombobulated}
                  markTransferable={progressFilter !== "owned" || !ownedKnown}
                />
              )}
            </section>
          </div>
        </section>
      </section>
    </section>
  );
};
