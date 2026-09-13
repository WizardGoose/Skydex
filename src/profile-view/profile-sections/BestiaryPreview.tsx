import React, { useEffect, useMemo, useState } from "react";
import type { ProfileStatusView } from "../../profile/profileStatus";
import {
  type BestiaryPreviewEntry,
  type BestiaryPreviewModel,
} from "../../profile/petsBestiaryCollections";
import type { ItemTooltipMetadata } from "../../ui/itemTooltipModel";
import {
  ProfilePbcDisclosure,
  ProfilePbcEmpty,
  ProfilePbcHeader,
  ProfilePbcLoading,
  ProfilePbcStatusLine,
  ProfilePbcUnavailable,
} from "./ProfilePbcShared";
import { ProfileItemTile } from "./ProfileItemTile";
import { ProfileProgressionFilters } from "./ProfileProgressionFilters";
import { ItemIcon } from "../../ui/ItemIcon";
import { RARITY } from "../../ui/kit";
import {
  compactProfileNumber,
  groupProfileEntries,
  profilePercent,
  toggleProfileExpansionKey,
} from "./profilePbcFormatting";
import { cropIconSrc } from "../../greenhouse/planner/icons";
import "./pets-bestiary-collections.css";
import "./bestiary-preview.css";

const NEARBY_MILESTONE_LIMIT = 6;

const bestiaryLocationIconName = (category: BestiaryCategory): string =>
  category.iconId
    ? category.iconId.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : category.name;

const bestiaryLocationIconSrc = (category: BestiaryCategory): string | undefined =>
  category.iconSrc ?? (category.iconId === "PUMPKIN" ? cropIconSrc("pumpkin") : undefined);

/**
 * Raw Bestiary counters name the encounter, not always the rendered entity.
 * Keep the encounter name for text and the wiki action, but offer the vanilla
 * or SkyBlock base creature as a final texture rung after that exact name has
 * genuinely failed. This is deliberately semantic, not an initials disguise.
 */
const bestiaryTextureFallback = (name: string): string | null => {
  const lowerName = name.toLowerCase();
  const pest = /^pest\s+(.+)$/.exec(lowerName);
  if (pest) {
    if (pest[1] === "mouse") return "Rabbit";
    return pest[1].replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  if (/^team treasurite\s+/i.test(name)) return "Boss Corleone";
  if (/^mayor jerry\s+/i.test(name)) return "Mayor Jerry";
  const value = lowerName.replace(/^master\s+/, "");
  const rules: readonly [RegExp, string][] = [
    [/tentacle/, "Kuudra Tentacle"],
    [/enderman|zealot|voidling/, "Enderman"],
    [/wither/, "Wither Skeleton"],
    [/shadow assassin/, "Wither Skeleton"],
    [/crypt souleater|skeletor/, "Skeleton"],
    [/skeleton/, "Skeleton"],
    [/zombie|undead|lost adventurer|diamond guy|sadan statue|crypt lurker|crypt dreadlord|king midas/, "Zombie"],
    [/silverfish/, "Silverfish"],
    [/endermite/, "Endermite"],
    [/spider|arachne/, "Spider"],
    [/wolf|mutt/, "Wolf"],
    [/cow|mooshroom|moo|\bbull\b/, "Cow"],
    [/chicken/, "Chicken"],
    [/pigman/, "Zombified Piglin"],
    [/\bpig\b/, "Pig"],
    [/sheep/, "Sheep"],
    [/rabbit|bunbun|groundhog/, "Rabbit"],
    [/lynx/, "Ocelot"],
    [/squid|sepia/, "Squid"],
    [/blaze|flare/, "Blaze"],
    [/magma|\byog\b|moogma/, "Magma Cube"],
    [/slime|sludge|slug/, "Slime"],
    [/ghast|phanflare|phanpyre/, "Ghast"],
    [/\bbat\b/, "Bat"],
    [/witch/, "Witch"],
    [/goblin/, "Goblin"],
    [/dragon/, "Ender Dragon"],
    [/golem|construct|automaton/, "Iron Golem"],
    [/snowman/, "Snow Golem"],
    [/creeper/, "Creeper"],
    [/horse/, "Horse"],
    [/pufferfish/, "Pufferfish"],
    [/\bfish\b|fisherman|flip flopper/, "Cod"],
    [/\bbal\b/, "Bal"],
    [/guardian|sea shine/, "Guardian"],
    [/crystal sentry/, "End Crystal"],
    [/trick or treater/, "Zombie"],
    [/corrupted protector/, "Iron Golem"],
    [/frog|croaker|\bgorf\b/, "Frog"],
    [/worm|leech/, "Silverfish"],
    [/ghost/, "Ghost"],
  ];
  return rules.find(([pattern]) => pattern.test(value))?.[1] ?? null;
};

export interface BestiaryPreviewProps {
  status: ProfileStatusView;
  model: BestiaryPreviewModel | null;
  error?: string | null;
}

type BestiaryProgressKind = "not-started" | "in-progress" | "maxed" | "unavailable";

const bestiaryProgressKind = (entry: BestiaryPreviewEntry): BestiaryProgressKind => {
  if (entry.tier === null || entry.maxTier === null) return "unavailable";
  if (entry.tier >= entry.maxTier) return "maxed";
  if (entry.kills === 0 || entry.tier === 0) return "not-started";
  return "in-progress";
};

const bestiaryVisualStyle = (entry: BestiaryPreviewEntry): React.CSSProperties => {
  const kind = bestiaryProgressKind(entry);
  const progress = kind === "maxed" ? 100 : entry.progressPercent ?? 0;
  return {
    "--bestiary-game-color": entry.gameColor ?? "#70defb",
    "--bestiary-progress": profilePercent(progress),
  } as React.CSSProperties;
};

const bestiaryRarityClass = (rarity: string | null): string =>
  RARITY[(rarity ?? "").trim().toLowerCase()] ?? "text-slate-200";

const bestiaryFamilyAnchorId = (id: string): string =>
  `profile-bestiary-family-${id.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}`;

const bestiaryTooltipMetadata = (entry: BestiaryPreviewEntry): ItemTooltipMetadata[] => {
  const metadata: ItemTooltipMetadata[] = [
    { label: "Kills", value: entry.kills.toLocaleString(), mono: true, tone: "ability" },
  ];
  if (entry.category !== null) metadata.push({ label: "Category", value: entry.category, tone: "mana" });
  if (entry.rarity !== null) metadata.push({
    label: "Rarity",
    value: <span className={bestiaryRarityClass(entry.rarity)}>{entry.rarity.replace(/_/g, " ")}</span>,
  });
  if (entry.tier !== null) metadata.push({ label: "Current tier", value: `Tier ${entry.tier}`, tone: "bonus" });
  if (entry.maxTier !== null) metadata.push({ label: "Maximum tier", value: `Tier ${entry.maxTier}`, tone: "defense" });
  if (entry.bracket !== null) {
    metadata.push({
      label: entry.bracketType === "CRITTERS" ? "Critter bracket" : "Kill bracket",
      value: entry.bracket.toLocaleString(),
      mono: true,
      tone: "ability",
    });
  }
  if (entry.maxKills !== null) metadata.push({ label: "Bestiary cap", value: entry.maxKills.toLocaleString(), mono: true, tone: "defense" });
  if (entry.nextTier !== null && entry.nextRequired !== null) {
    metadata.push({ label: `Tier ${entry.nextTier} threshold`, value: entry.nextRequired.toLocaleString(), mono: true, tone: "mana" });
    metadata.push({ label: "Kills remaining", value: Math.max(0, entry.nextRequired - entry.kills).toLocaleString(), mono: true, tone: "warning" });
  }
  return metadata;
};

const formatKillCount = (kills: number): string => `${kills.toLocaleString()} ${kills === 1 ? "kill" : "kills"}`;
const formatCompactKillCount = (kills: number): string => `${compactProfileNumber(kills)} ${kills === 1 ? "kill" : "kills"}`;

const BestiaryTile: React.FC<{
  entry: BestiaryPreviewEntry;
  defined: boolean;
  selected?: boolean;
  onSelect?: () => void;
}> = ({ entry, defined, selected = false, onSelect }) => {
  const progressKind = bestiaryProgressKind(entry);
  return (
    <span
      id={bestiaryFamilyAnchorId(entry.id)}
      className={`profile-bestiary-tile-shell is-${progressKind}`}
      data-bestiary-progress={progressKind}
      style={bestiaryVisualStyle(entry)}
    >
      <ProfileItemTile
        id={entry.id}
        name={entry.name}
        wikiName={defined ? entry.name : null}
        iconId={entry.iconId ?? entry.id}
        iconSrc={entry.iconSrc}
        iconFallbackName={bestiaryTextureFallback(entry.name)}
        freezeAnimatedMedia
        hypixelId={entry.iconId}
        tier={entry.rarity}
        identityColor={entry.gameColor}
        cornerLabel={entry.tier === null ? compactProfileNumber(entry.kills) : `T${entry.tier}`}
        metadata={bestiaryTooltipMetadata(entry)}
        progress={entry.nextTier !== null && entry.nextRequired !== null && entry.progressPercent !== null ? {
          label: `Progress to Tier ${entry.nextTier}`,
          value: `${entry.kills.toLocaleString()} / ${entry.nextRequired.toLocaleString()} kills`,
          current: entry.progressPercent,
          max: 100,
        } : null}
        provenance={defined ? "Bestiary family" : "Bestiary kill counter"}
        ariaLabel={`${entry.name}, ${formatKillCount(entry.kills)}${entry.tier === null ? "" : `, tier ${entry.tier}`}`}
        selected={selected}
        onClick={onSelect}
      />
    </span>
  );
};

interface RawBestiaryFamily {
  id: string;
  name: string;
  kills: number;
  variants: ReadonlyArray<{ entry: BestiaryPreviewEntry; level: number | null }>;
}

const rawCounterFamilies = (entries: readonly BestiaryPreviewEntry[]): RawBestiaryFamily[] => {
  const grouped = new Map<string, RawBestiaryFamily>();
  for (const entry of entries) {
    const match = entry.id.match(/^(.*)_([0-9]+)$/);
    const id = match?.[1] ?? entry.id;
    const level = match ? Number(match[2]) : null;
    const name = match ? entry.name.replace(/\s+[0-9]+$/, "") : entry.name;
    const current = grouped.get(id) ?? { id, name, kills: 0, variants: [] };
    current.kills += entry.kills;
    current.variants = [...current.variants, { entry, level }];
    grouped.set(id, current);
  }
  return [...grouped.values()]
    .map((family) => ({
      ...family,
      variants: family.variants.slice().sort((a, b) =>
        (a.level ?? Number.MAX_SAFE_INTEGER) - (b.level ?? Number.MAX_SAFE_INTEGER)),
    }))
    .sort((a, b) => (b.kills - a.kills) || a.name.localeCompare(b.name));
};

const RawFamilyTile: React.FC<{
  family: RawBestiaryFamily;
  selected: boolean;
  onSelect: () => void;
}> = ({ family, selected, onSelect }) => (
  <ProfileItemTile
    id={family.id}
    name={family.name}
    wikiName={family.name}
    iconId={family.id}
    iconFallbackName={bestiaryTextureFallback(family.name)}
    freezeAnimatedMedia
    tier={null}
    cornerLabel={compactProfileNumber(family.kills)}
    metadata={[
      { label: "Recorded kills", value: family.kills.toLocaleString(), mono: true },
      { label: "Recorded levels", value: family.variants.length.toLocaleString(), mono: true },
    ]}
    provenance="Bestiary family"
    ariaLabel={`${family.name}, ${formatKillCount(family.kills)} across ${family.variants.length.toLocaleString()} recorded levels`}
    selected={selected}
    onClick={onSelect}
  />
);

const RawFamilyBrowser: React.FC<{ families: readonly RawBestiaryFamily[] }> = ({ families }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = families.find((family) => family.id === selectedId) ?? families[0] ?? null;
  return (
    <div className="profile-bestiary-raw-depth">
      <div className="profile-item-grid profile-bestiary-tile-grid" data-bestiary-render-count={families.length}>
        {families.map((family) => (
          <RawFamilyTile
            key={family.id}
            family={family}
            selected={selected?.id === family.id}
            onSelect={() => setSelectedId(family.id)}
          />
        ))}
      </div>
      {selected && (
        <section className="profile-bestiary-family-detail" aria-label={`${selected.name} recorded levels`}>
          <header>
            <div><span>Selected family</span><h3>{selected.name}</h3></div>
            <strong className="profile-number">{formatKillCount(selected.kills)}</strong>
          </header>
          <div className="profile-bestiary-family-levels">
            {selected.variants.map(({ entry, level }) => (
              <article key={entry.id}>
                <span>{level === null ? "Recorded counter" : `Level ${level.toLocaleString()}`}</span>
                <strong className="profile-number">{formatKillCount(entry.kills)}</strong>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

interface BestiaryCategory {
  name: string;
  entries: readonly BestiaryPreviewEntry[];
  iconId: string | null;
  iconSrc: string | null;
  tiers: number | null;
  maxTiers: number | null;
}

const BESTIARY_PROGRESS_LABEL: Record<BestiaryProgressKind, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  maxed: "Maxed",
  unavailable: "Tier data unavailable",
};

const bestiaryTextMatch = (entry: BestiaryPreviewEntry, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  return !needle || [entry.name, entry.id, entry.category].some((value) => value?.toLowerCase().includes(needle));
};

const filteredBestiaryEntries = (
  category: BestiaryCategory,
  query: string,
  progressFilters: readonly BestiaryProgressKind[],
): BestiaryPreviewEntry[] => category.entries.filter((entry) => (
  bestiaryTextMatch(entry, query)
  && (progressFilters.length === 0 || progressFilters.includes(bestiaryProgressKind(entry)))
));

const partitionBestiaryCategories = (categories: readonly BestiaryCategory[]): BestiaryCategory[][] => {
  const columns: BestiaryCategory[][] = [[], []];
  categories.forEach((category, index) => columns[index % columns.length].push(category));
  return columns;
};

const BestiaryCategoryDetail: React.FC<{
  category: BestiaryCategory;
  entries: readonly BestiaryPreviewEntry[];
}> = ({ category, entries }) => {
  return (
    <section className="profile-bestiary-selected" aria-label={`${category.name} Bestiary families`}>
      <header>
        <h3>{category.name}</h3>
        <span className="profile-number">{entries.length.toLocaleString()} families</span>
      </header>
      {entries.length > 0 ? (
        <div className="profile-item-grid profile-bestiary-tile-grid" data-bestiary-render-count={entries.length}>
          {entries.map((entry) => <BestiaryTile key={entry.id} entry={entry} defined />)}
        </div>
      ) : <ProfilePbcEmpty>No Bestiary families match these filters.</ProfilePbcEmpty>}
    </section>
  );
};

export const BestiaryPreview: React.FC<BestiaryPreviewProps> = ({
  status,
  model,
  error = null,
}) => {
  const bestiary = model ?? {
    available: false,
    entries: [],
    totalKills: 0,
    familiesUnlocked: 0,
    familiesCompleted: null,
    familyTiers: null,
    maxFamilyTiers: null,
    dropped: 0,
    partial: false,
  } satisfies BestiaryPreviewModel;
  const familyEntries = useMemo(
    () => bestiary.entries.filter((entry) => entry.category !== null),
    [bestiary.entries],
  );
  const rawEntries = useMemo(
    () => bestiary.entries.filter((entry) => entry.category === null),
    [bestiary.entries],
  );
  const rawFamilies = useMemo(() => rawCounterFamilies(rawEntries), [rawEntries]);
  const familyGroups = useMemo(
    () => groupProfileEntries(familyEntries, (entry) => entry.category),
    [familyEntries],
  );
  const categories = useMemo<BestiaryCategory[]>(() => [...familyGroups.entries()].map(([name, entries]) => ({
    name,
    entries,
    iconId: entries.find((entry) => entry.locationIconId !== null)?.locationIconId ?? null,
    iconSrc: entries.find((entry) => entry.locationIconSrc !== null)?.locationIconSrc ?? null,
    tiers: entries.every((entry) => entry.tier !== null)
      ? entries.reduce((sum, entry) => sum + (entry.tier ?? 0), 0)
      : null,
    maxTiers: entries.every((entry) => entry.maxTier !== null)
      ? entries.reduce((sum, entry) => sum + (entry.maxTier ?? 0), 0)
      : null,
  })), [familyGroups]);
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set());
  const [pendingFamilyId, setPendingFamilyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [progressFilters, setProgressFilters] = useState<BestiaryProgressKind[]>([]);
  const textMatches = useMemo(
    () => familyEntries.filter((entry) => bestiaryTextMatch(entry, query)),
    [familyEntries, query],
  );
  const progressOptions = useMemo(() => (["not-started", "in-progress", "maxed", "unavailable"] as const)
    .filter((kind) => familyEntries.some((entry) => bestiaryProgressKind(entry) === kind)), [familyEntries]);
  const progressCounts = useMemo(() => new Map(progressOptions.map((kind) => [kind,
    textMatches.filter((entry) => bestiaryProgressKind(entry) === kind).length])),
  [progressOptions, textMatches]);
  const categoryMatchCounts = useMemo(() => new Map(categories.map((category) => [category.name,
    category.entries.filter((entry) => bestiaryTextMatch(entry, query)
      && (progressFilters.length === 0 || progressFilters.includes(bestiaryProgressKind(entry)))).length])),
  [categories, progressFilters, query]);
  const matchingFamilyCount = [...categoryMatchCounts.values()].reduce((sum, count) => sum + count, 0);
  const categoryColumns = useMemo(() => partitionBestiaryCategories(categories), [categories]);
  const filterActive = query.trim().length > 0 || progressFilters.length > 0;
  const toggleProgress = (kind: BestiaryProgressKind) => setProgressFilters((current) => current.includes(kind)
    ? current.filter((value) => value !== kind)
    : [...current, kind]);
  const clearFilters = () => {
    setQuery("");
    setProgressFilters([]);
  };
  const jumpToFamily = (entry: BestiaryPreviewEntry) => {
    const category = entry.category;
    if (category === null) return;
    clearFilters();
    setOpenCategories((current) => {
      const next = new Set(current);
      next.add(category);
      return next;
    });
    setPendingFamilyId(entry.id);
  };
  useEffect(() => {
    if (pendingFamilyId === null) return;
    const frame = window.requestAnimationFrame(() => {
      const anchor = document.getElementById(bestiaryFamilyAnchorId(pendingFamilyId));
      if (!anchor) return;
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      anchor.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center", inline: "nearest" });
      anchor.querySelector<HTMLButtonElement>(".profile-item-tile")?.focus({ preventScroll: true });
      setPendingFamilyId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [openCategories, pendingFamilyId, progressFilters, query]);
  const nearby = useMemo(() => familyEntries
    .flatMap((entry) => entry.nextTier !== null && entry.nextRequired !== null
      ? [{ entry, remaining: Math.max(0, entry.nextRequired - entry.kills) }]
      : [])
    .sort((a, b) => (a.remaining - b.remaining) || (b.entry.progressPercent ?? -1) - (a.entry.progressPercent ?? -1))
    .slice(0, NEARBY_MILESTONE_LIMIT), [familyEntries]);
  const familyTiers = familyEntries.length > 0 && familyEntries.every((entry) => entry.tier !== null)
    ? familyEntries.reduce((sum, entry) => sum + (entry.tier ?? 0), 0)
    : null;
  const maxFamilyTiers = familyEntries.length > 0 && familyEntries.every((entry) => entry.maxTier !== null)
    ? familyEntries.reduce((sum, entry) => sum + (entry.maxTier ?? 0), 0)
    : null;
  const completedFamilies = familyEntries.length > 0 && familyEntries.every((entry) => entry.maxTier !== null)
    ? familyEntries.filter((entry) => entry.tier === entry.maxTier).length
    : null;

  return (
    <section className="profile-pbc-preview profile-bestiary-preview" aria-label="Bestiary">
      <section className="profile-pbc-shell profile-glass" aria-label="Bestiary kills">
        <ProfilePbcHeader
          eyebrow="Bestiary"
          title="Bestiary kills"
          count={bestiary.available ? familyEntries.length + rawFamilies.length : null}
          countLabel="families"
        />
        {status.showSkeleton ? (
          <ProfilePbcLoading rows={8} />
        ) : !bestiary.available ? (
          <ProfilePbcUnavailable status={status} noun="Bestiary" error={error} />
        ) : bestiary.entries.length === 0 ? (
          <ProfilePbcEmpty>No bestiary kills are recorded on this profile.</ProfilePbcEmpty>
        ) : (
          <div className="profile-pbc-content profile-bestiary-content">
            <ProfilePbcStatusLine status={status} partial={bestiary.partial} />
            <div className="profile-bestiary-top">
              <section className="profile-bestiary-overview" aria-label="Bestiary overview">
                <span>Total recorded kills</span>
                <strong className="profile-number">{compactProfileNumber(bestiary.totalKills)}</strong>
                <dl>
                  {familyEntries.length > 0 && (
                    <div>
                      <dt>Defined families</dt>
                      <dd className="profile-number">{familyEntries.length.toLocaleString()}</dd>
                    </div>
                  )}
                  {familyEntries.length > 0 && (
                    <div>
                      <dt>Unlocked</dt>
                      <dd className="profile-number">{familyEntries.filter((entry) => entry.kills > 0).length.toLocaleString()}</dd>
                    </div>
                  )}
                  {completedFamilies !== null && (
                    <div>
                      <dt>Maxed</dt>
                      <dd className="profile-number">{completedFamilies.toLocaleString()}</dd>
                    </div>
                  )}
                  {rawEntries.length > 0 && (
                    <div>
                      <dt>Recorded families</dt>
                      <dd className="profile-number">{rawFamilies.length.toLocaleString()}</dd>
                    </div>
                  )}
                  {rawEntries.length > 0 && (
                    <div>
                      <dt>Level counters</dt>
                      <dd className="profile-number">{rawEntries.length.toLocaleString()}</dd>
                    </div>
                  )}
                </dl>
                {familyTiers !== null && maxFamilyTiers !== null && maxFamilyTiers > 0 && (
                  <div className="profile-bestiary-overall-progress">
                    <span className="profile-number">{familyTiers.toLocaleString()} / {maxFamilyTiers.toLocaleString()} family tiers</span>
                    <span
                      className="profile-pbc-progress"
                      role="progressbar"
                      aria-label="Overall Bestiary family tier progress"
                      aria-valuemin={0}
                      aria-valuemax={maxFamilyTiers}
                      aria-valuenow={familyTiers}
                    >
                      <i style={{ width: profilePercent((familyTiers / maxFamilyTiers) * 100) }} />
                    </span>
                  </div>
                )}
              </section>
              {nearby.length > 0 && (
                <section className="profile-bestiary-nearby" aria-label="Nearby Bestiary milestones">
                  <header>
                    <span>Nearby milestones</span>
                    <strong>{nearby.length.toLocaleString()} closest</strong>
                  </header>
                  <div>
                    {nearby.map(({ entry, remaining }) => {
                      const icon = (
                        <ItemIcon
                          name={entry.name}
                          id={entry.iconId ?? entry.id}
                          hypixelId={entry.iconId ?? undefined}
                          src={entry.iconSrc ?? undefined}
                          fallbackName={bestiaryTextureFallback(entry.name) ?? undefined}
                          freezeAnimatedMedia
                          size={30}
                          fallback="blank"
                        />
                      );
                      return (
                      <article key={entry.id} style={bestiaryVisualStyle(entry)}>
                        <button
                          type="button"
                          className="profile-bestiary-nearby-jump"
                          aria-label={`Jump to ${entry.name}, ${formatCompactKillCount(remaining)} to tier ${entry.nextTier}`}
                          onClick={() => jumpToFamily(entry)}
                        >
                          <span className="profile-bestiary-nearby-icon" aria-hidden>{icon}</span>
                          <span className="profile-bestiary-nearby-copy">
                            <strong className={bestiaryRarityClass(entry.rarity)}>{entry.name}</strong>
                            <small className="profile-number">Tier {entry.nextTier}</small>
                          </span>
                          <span className="profile-bestiary-nearby-remaining profile-number">{formatCompactKillCount(remaining)}</span>
                          {entry.progressPercent !== null && (
                            <span
                              className="profile-pbc-progress"
                              role="progressbar"
                              aria-label={`${entry.name} progress to tier ${entry.nextTier}`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.round(entry.progressPercent)}
                            >
                              <i style={{ width: profilePercent(entry.progressPercent) }} />
                            </span>
                          )}
                        </button>
                      </article>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>

            {categories.length > 0 ? (
              <>
                <ProfileProgressionFilters
                  query={query}
                  onQueryChange={setQuery}
                  searchLabel="Search Bestiary families"
                  placeholder="Search Bestiary families"
                  activeCount={progressFilters.length}
                  resultCount={matchingFamilyCount}
                  totalCount={familyEntries.length}
                  onClear={clearFilters}
                  groups={[{
                    legend: "Family progress",
                    options: progressOptions.map((kind) => {
                      const count = progressCounts.get(kind) ?? 0;
                      const selectedFilter = progressFilters.includes(kind);
                      return {
                        id: kind,
                        label: BESTIARY_PROGRESS_LABEL[kind],
                        count,
                        selected: selectedFilter,
                        disabled: count === 0 && !selectedFilter,
                        onToggle: () => toggleProgress(kind),
                      };
                    }),
                  }]}
                />
                <div className="profile-bestiary-category-columns" aria-label="Bestiary categories">
                  {categoryColumns.map((column, columnIndex) => (
                    <div className="profile-bestiary-category-column" key={columnIndex}>
                      {column.map((category) => {
                        const matchCount = categoryMatchCounts.get(category.name) ?? 0;
                        const isOpen = openCategories.has(category.name);
                        const entries = filteredBestiaryEntries(category, query, progressFilters);
                        return (
                          <div className={`profile-bestiary-category-stack ${isOpen ? "is-expanded" : ""}`} key={category.name}>
                            <button
                              type="button"
                              className="profile-bestiary-category-button"
                              aria-expanded={isOpen}
                              disabled={matchCount === 0 && !isOpen}
                              onClick={() => setOpenCategories((current) => toggleProfileExpansionKey(current, category.name))}
                            >
                              <span className="profile-bestiary-location-icon" aria-hidden="true">
                                <ItemIcon
                                  name={bestiaryLocationIconName(category)}
                                  id={category.iconId ?? undefined}
                                  hypixelId={category.iconId ?? undefined}
                                  src={bestiaryLocationIconSrc(category)}
                                  allowSemanticFallback={Boolean(category.iconId)}
                                  freezeAnimatedMedia
                                  size={28}
                                  fallback="blank"
                                />
                              </span>
                              <span className="profile-bestiary-location-copy">
                                <span>{category.name}</span>
                                <strong className="profile-number">{filterActive
                                  ? `${matchCount.toLocaleString()} / ${category.entries.length.toLocaleString()} families`
                                  : `${category.entries.length.toLocaleString()} families`}</strong>
                                {category.tiers !== null && category.maxTiers !== null && (
                                  <small className="profile-number">{category.tiers.toLocaleString()} / {category.maxTiers.toLocaleString()} tiers</small>
                                )}
                              </span>
                            </button>
                            {isOpen && <BestiaryCategoryDetail category={category} entries={entries} />}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
                {rawEntries.length > 0 && (
                  <ProfilePbcDisclosure
                    storageId="bestiary-raw-counters"
                    title="Unmapped families"
                    count={rawFamilies.length}
                    initiallyExpanded={false}
                  >
                    <RawFamilyBrowser families={rawFamilies} />
                  </ProfilePbcDisclosure>
                )}
              </>
            ) : (
              <section className="profile-bestiary-fallback" aria-label="Raw Bestiary counters">
                <header>
                  <div>
                    <span>Recorded by mob</span>
                    <h3>Mob families</h3>
                  </div>
                  <strong className="profile-number">{rawFamilies.length.toLocaleString()} families</strong>
                </header>
                <RawFamilyBrowser families={rawFamilies} />
              </section>
            )}
          </div>
        )}
      </section>
    </section>
  );
};
