import React, { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, CircleHelp, LockKeyhole } from "lucide-react";
import { fetchMaterialChains, readChainCache, writeChainCache, type ChainIndex } from "../../items/materialChain";
import { slug } from "../../items/wikiCrafting";
import { useRecipes, type Item, type ItemIndex } from "../../items/useItemData";
import { requestSkillIcons, useSkillIcons, type SkillIconMap } from "../../island/skillIcons";
import type { ProfileStatusView } from "../../profile/profileStatus";
import {
  resolveCollectionSourceGate,
  tradingAllowedForGameMode,
  type CollectionSourceAccess,
} from "../../profile/collectionSourceGate";
import {
  type CollectionPreviewEntry,
  type CollectionsPreviewModel,
} from "../../profile/petsBestiaryCollections";
import type { ItemTooltipMetadata } from "../../ui/itemTooltipModel";
import { ItemIcon } from "../../ui/ItemIcon";
import {
  ProfilePbcEmpty,
  ProfilePbcHeader,
  ProfilePbcLoading,
  ProfilePbcStatusLine,
  ProfilePbcUnavailable,
} from "./ProfilePbcShared";
import { ProfileItemTile } from "./ProfileItemTile";
import { ProfileIdentityTrigger } from "./ProfileIdentityTrigger";
import { ProfileProgressionFilters } from "./ProfileProgressionFilters";
import {
  compactProfileNumber,
  groupProfileEntries,
  profilePercent,
  toggleProfileExpansionKey,
} from "./profilePbcFormatting";
import "./pets-bestiary-collections.css";
import "./collections-preview.css";

const NEARBY_TIER_LIMIT = 6;

const collectionCategoryAccent = (category: string | null | undefined): string => {
  switch (category?.trim().toLowerCase()) {
    case "farming": return "#f6b83f";
    case "mining": return "#57d7ee";
    case "combat": return "#ef6675";
    case "foraging": return "#56ca88";
    case "fishing": return "#579ee9";
    case "rift": return "#cf69f1";
    default: return "#8799aa";
  }
};

const collectionCategoryIcon = (
  category: string,
  skillIcons: SkillIconMap | null,
): { name: string; id: string } | null => {
  const key = category.trim().toLowerCase();
  if (key === "rift") return { name: "Enchanted Mycelium", id: "ENCHANTED_MYCELIUM" };
  const skillIcon = skillIcons?.[key];
  return skillIcon ? { name: skillIcon, id: skillIcon } : null;
};

export interface CollectionsPreviewProps {
  status: ProfileStatusView;
  model: CollectionsPreviewModel | null;
  gameMode?: string | null;
  error?: string | null;
}

const tierLabel = (tier: number | null): string => {
  if (tier === null) return "Unavailable";
  return tier === 0 ? "None unlocked" : `Tier ${tier}`;
};

const collectionTooltipMetadata = (
  entry: CollectionPreviewEntry,
  sourceAccess: CollectionSourceAccess | null = null,
): ItemTooltipMetadata[] => {
  const metadata: ItemTooltipMetadata[] = [
    { label: "Unlocked tier", value: tierLabel(entry.unlockedTier) },
    { label: "Maximum tier", value: entry.maxTier === null ? "Unavailable" : `Tier ${entry.maxTier}` },
    { label: "Collected", value: entry.amount === null ? "Unavailable" : entry.amount.toLocaleString(), mono: true },
  ];
  if (entry.nextTier !== null && entry.nextRequired !== null) {
    metadata.push({
      label: `Tier ${entry.nextTier} threshold`,
      value: entry.nextRequired.toLocaleString(),
      mono: true,
    });
    if (entry.amount !== null) {
      metadata.push({
        label: "Remaining",
        value: Math.max(0, entry.nextRequired - entry.amount).toLocaleString(),
        mono: true,
      });
    }
  }
  if (entry.sourceGate) {
    metadata.push({ label: "Source", value: entry.sourceGate.sourceName });
    metadata.push({
      label: "Source access",
      value: sourceAccess?.label ?? entry.sourceGate.requirementLabel,
    });
    if (entry.sourceGate.requirement.have !== null) {
      metadata.push({
        label: "Slayer progress",
        value: `${entry.sourceGate.requirement.have} / ${entry.sourceGate.requirement.threshold}`,
        mono: true,
      });
    }
  }
  return metadata;
};

const CollectionSourceBadge: React.FC<{
  access: CollectionSourceAccess;
  iconOnly?: boolean;
}> = ({ access, iconOnly = false }) => {
  const Icon = access.state === "locked"
    ? LockKeyhole
    : access.state === "unknown"
      ? CircleHelp
      : ArrowRightLeft;
  return (
    <span
      className={`profile-collection-source-badge is-${access.state}${iconOnly ? " is-icon-only" : ""}`}
      title={access.detail}
      aria-hidden={iconOnly || undefined}
    >
      <Icon aria-hidden />
      {!iconOnly && <span>{access.label}</span>}
    </span>
  );
};

const CollectionTile: React.FC<{
  entry: CollectionPreviewEntry;
  tradingAllowed: boolean | null;
  selected?: boolean;
  onSelect?: () => void;
}> = ({ entry, tradingAllowed, selected = false, onSelect }) => {
  const sourceAccess = resolveCollectionSourceGate(entry.sourceGate, tradingAllowed);
  const showSource = Boolean(sourceAccess && entry.sourceGate?.requirement.state !== "met");
  return (
    <span className={`profile-collection-tile-shell${sourceAccess ? ` is-${sourceAccess.state}` : ""}`}>
      <ProfileItemTile
        id={entry.id}
        name={entry.name}
        wikiName={entry.name}
        iconId={entry.id}
        hypixelId={entry.id}
        tier={null}
        cornerLabel={entry.unlockedTier === null ? null : `T${entry.unlockedTier}`}
        selected={selected}
        onClick={onSelect}
        metadata={collectionTooltipMetadata(entry, sourceAccess)}
        provenance="Collection progress"
        ariaLabel={`${entry.name}, ${tierLabel(entry.unlockedTier)}${showSource ? `, ${sourceAccess?.label}` : ""}`}
      />
      {showSource && sourceAccess && <CollectionSourceBadge access={sourceAccess} iconOnly />}
    </span>
  );
};

const foldCollectionName = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

interface CollectionUnlockRow {
  key: string;
  item: Item;
  tier: number;
  required: number;
  type: "Recipe" | "Trade" | "Dwarven Forge Recipe";
}

const collectionItem = (entry: CollectionPreviewEntry, items: ItemIndex): Item | null => {
  const id = entry.id.toUpperCase();
  const name = foldCollectionName(entry.name);
  return Object.values(items).find((item) => item.hypixelId?.toUpperCase() === id)
    ?? Object.values(items).find((item) => foldCollectionName(item.name) === name)
    ?? null;
};

const itemById = (items: ItemIndex, id: string): Item | null => items[id]
  ?? Object.values(items).find((item) => item.hypixelId === id)
  ?? null;

const collectionUnlocks = (entry: CollectionPreviewEntry, items: ItemIndex): CollectionUnlockRow[] => {
  const accepted = new Set([foldCollectionName(entry.id), foldCollectionName(entry.name)]);
  const values = Object.values(items);
  return Object.entries(items).flatMap(([key, item]) => (item.unlocks ?? []).flatMap((unlock): CollectionUnlockRow[] => {
    if (!accepted.has(foldCollectionName(unlock.collection))) return [];
    const resolvedItem = item.recipe?.length
      ? item
      : values.find((candidate) => foldCollectionName(candidate.name) === foldCollectionName(item.name) && candidate.recipe?.length)
        ?? item;
    return [{ key: `${key}:${unlock.tier}:${unlock.type}`, item: resolvedItem, tier: unlock.tier, required: unlock.required, type: unlock.type }];
  })).sort((left, right) => (left.tier - right.tier) || left.item.name.localeCompare(right.item.name));
};

const CollectionDetail: React.FC<{
  entry: CollectionPreviewEntry;
  tradingAllowed: boolean | null;
  items: ItemIndex;
  loading: boolean;
  error: string | null;
  onBack: () => void;
}> = ({ entry, tradingAllowed, items, loading, error, onBack }) => {
  const item = useMemo(() => collectionItem(entry, items), [entry, items]);
  const unlocks = useMemo(() => collectionUnlocks(entry, items), [entry, items]);
  const sourceAccess = resolveCollectionSourceGate(entry.sourceGate, tradingAllowed);
  const showSource = Boolean(sourceAccess && entry.sourceGate?.requirement.state !== "met");
  const [selectedUnlockKey, setSelectedUnlockKey] = useState<string | null>(null);
  const [articleRecipes, setArticleRecipes] = useState<ChainIndex>(() => readChainCache());
  const [articleRecipeLoading, setArticleRecipeLoading] = useState(false);
  const selectedUnlock = unlocks.find((unlock) => unlock.key === selectedUnlockKey) ?? unlocks[0] ?? null;
  const selectedArticleKey = selectedUnlock ? slug(selectedUnlock.item.wikiTitle ?? selectedUnlock.item.name) : null;
  const selectedRecipe = selectedUnlock?.item.recipe?.length
    ? selectedUnlock.item.recipe
    : selectedArticleKey ? articleRecipes[selectedArticleKey] ?? null : null;

  useEffect(() => {
    if (!selectedUnlock || selectedUnlock.item.recipe?.length || !selectedArticleKey || selectedArticleKey in articleRecipes) return;
    const controller = new AbortController();
    setArticleRecipeLoading(true);
    fetchMaterialChains([selectedUnlock.item.wikiTitle ?? selectedUnlock.item.name], controller.signal)
      .then((learned) => {
        setArticleRecipes((current) => {
          const next = { ...current, ...learned };
          writeChainCache(next);
          return next;
        });
      })
      .catch(() => undefined)
      .finally(() => setArticleRecipeLoading(false));
    return () => controller.abort();
  }, [articleRecipes, selectedArticleKey, selectedUnlock]);

  return (
    <section className="profile-collection-detail" aria-labelledby="profile-collection-detail-title">
      <header>
        <button type="button" onClick={onBack}>Back to collection</button>
        <span>{entry.category ?? "Collection"}</span>
      </header>
      <div className="profile-collection-detail-hero">
        <span className={`profile-collection-detail-icon profile-collection-tile-shell${sourceAccess ? ` is-${sourceAccess.state}` : ""}`}>
          <ProfileItemTile
            id={entry.id}
            name={entry.name}
            wikiName={entry.name}
            iconId={entry.id}
            hypixelId={entry.id}
            tier={item?.tier ?? null}
            tierIsDisplayed={Boolean(item?.tier)}
            metadata={collectionTooltipMetadata(entry, sourceAccess)}
            ariaLabel={`${entry.name} collection${showSource ? `, ${sourceAccess?.label}` : ""}`}
          />
          {showSource && sourceAccess && <CollectionSourceBadge access={sourceAccess} iconOnly />}
        </span>
        <div>
          <span>Collection menu</span>
          <h4 id="profile-collection-detail-title">{entry.name}</h4>
          <p>{entry.nextTier === null || entry.nextRequired === null
            ? entry.isMaxed ? "All recorded tiers unlocked" : "Next tier unavailable"
            : `${Math.max(0, entry.nextRequired - (entry.amount ?? 0)).toLocaleString()} remaining to Tier ${entry.nextTier}`}</p>
          {showSource && sourceAccess && <CollectionSourceBadge access={sourceAccess} />}
        </div>
      </div>
      <dl className="profile-collection-detail-stats">
        <div><dt>Collected</dt><dd className="profile-number">{entry.amount === null ? "Unavailable" : entry.amount.toLocaleString()}</dd></div>
        <div><dt>Current tier</dt><dd className="profile-number">{tierLabel(entry.unlockedTier)}</dd></div>
        <div><dt>Maximum tier</dt><dd className="profile-number">{entry.maxTier === null ? "Unavailable" : `Tier ${entry.maxTier}`}</dd></div>
      </dl>
      {entry.progressPercent !== null && entry.nextRequired !== null && (
        <span
          className="profile-pbc-progress profile-collection-detail-progress"
          role="progressbar"
          aria-label={`${entry.name} progress to tier ${entry.nextTier}`}
          aria-valuemin={0}
          aria-valuemax={entry.nextRequired}
          aria-valuenow={entry.amount ?? undefined}
        >
          <i style={{ width: profilePercent(entry.progressPercent) }} />
        </span>
      )}
      {item?.recipe && item.recipe.length > 0 && (
        <section className="profile-collection-recipe" aria-label={`${entry.name} crafting recipe`}>
          <header><strong>Crafting recipe</strong><span className="profile-number">Makes {item.yields.toLocaleString()}</span></header>
          <div className="profile-collection-recipe-grid profile-item-grid">
            {item.recipe.map((ingredient) => (
              <ProfileItemTile
                key={`${ingredient.id}:${ingredient.qty}`}
                id={ingredient.id}
                name={ingredient.name}
                wikiName={ingredient.name}
                iconId={ingredient.id}
                hypixelId={ingredient.id}
                count={ingredient.qty}
                tier={items[ingredient.id]?.tier ?? null}
                metadata={ingredient.alternatives?.length
                  ? [{ label: "Alternatives", value: ingredient.alternatives.map((alternative) => alternative.name).join(", ") }]
                  : []}
                ariaLabel={`${ingredient.name}, ${ingredient.qty.toLocaleString()} required`}
              />
            ))}
          </div>
        </section>
      )}
      <section className="profile-collection-unlocks" aria-label={`${entry.name} tier rewards`}>
        <header><strong>Tier rewards</strong><span className="profile-number">{unlocks.length.toLocaleString()} listed</span></header>
        {loading ? <p>Loading collection rewards…</p> : error && unlocks.length === 0 ? (
          <p>Collection reward data is unavailable.</p>
        ) : unlocks.length === 0 ? (
          <p>No recipe, trade, or Forge rewards are listed for this collection.</p>
        ) : (
          <div className="profile-collection-unlock-grid profile-item-grid">
            {unlocks.map((unlock) => (
              <ProfileItemTile
                key={unlock.key}
                id={unlock.item.hypixelId}
                name={unlock.item.name}
                wikiName={unlock.item.wikiTitle ?? unlock.item.name}
                iconId={unlock.item.hypixelId ?? unlock.key}
                hypixelId={unlock.item.hypixelId}
                tier={unlock.item.tier}
                tierIsDisplayed={Boolean(unlock.item.tier)}
                cornerLabel={`T${unlock.tier}`}
                metadata={[
                  { label: "Unlock", value: unlock.type },
                  { label: "Collection tier", value: `Tier ${unlock.tier}`, mono: true },
                  { label: "Required", value: unlock.required.toLocaleString(), mono: true },
                ]}
                selected={selectedUnlock?.key === unlock.key}
                onClick={() => setSelectedUnlockKey(unlock.key)}
                ariaLabel={`${unlock.item.name}, unlocked at ${entry.name} tier ${unlock.tier}`}
              />
            ))}
          </div>
        )}
      </section>
      {selectedUnlock && (
        <section className="profile-collection-unlock-detail" aria-label={`${selectedUnlock.item.name} unlock details`}>
          <header>
            <div><span>{selectedUnlock.type} · Tier {selectedUnlock.tier}</span><strong>{selectedUnlock.item.name}</strong></div>
            <span className="profile-number">{selectedRecipe?.length ? `Makes ${selectedUnlock.item.yields.toLocaleString()}` : selectedUnlock.required.toLocaleString()}</span>
          </header>
          {selectedRecipe?.length ? (
            <div className="profile-collection-unlock-recipe">
              <span className="profile-collection-unlock-result">
                <ProfileItemTile
                  id={selectedUnlock.item.hypixelId}
                  name={selectedUnlock.item.name}
                  wikiName={selectedUnlock.item.wikiTitle ?? selectedUnlock.item.name}
                  iconId={selectedUnlock.item.hypixelId ?? selectedUnlock.key}
                  hypixelId={selectedUnlock.item.hypixelId}
                  count={selectedUnlock.item.yields}
                  tier={selectedUnlock.item.tier}
                  tierIsDisplayed={Boolean(selectedUnlock.item.tier)}
                  ariaLabel={`${selectedUnlock.item.name}, recipe result`}
                />
              </span>
              <div>
                <span>Ingredients</span>
                <div className="profile-collection-recipe-grid profile-item-grid">
                  {selectedRecipe.map((ingredient) => {
                    const ingredientItem = itemById(items, ingredient.id);
                    return (
                      <ProfileItemTile
                        key={`${selectedUnlock.key}:${ingredient.id}:${ingredient.qty}`}
                        id={ingredient.id}
                        name={ingredient.name}
                        wikiName={ingredientItem?.wikiTitle ?? ingredient.name}
                        iconId={ingredient.id}
                        hypixelId={ingredient.id}
                        count={ingredient.qty}
                        tier={ingredientItem?.tier ?? null}
                        tierIsDisplayed={Boolean(ingredientItem?.tier)}
                        metadata={ingredient.alternatives?.length
                          ? [{ label: "Alternatives", value: ingredient.alternatives.map((alternative) => alternative.name).join(", ") }]
                          : []}
                        ariaLabel={`${ingredient.name}, ${ingredient.qty.toLocaleString()} required`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          ) : <p>{articleRecipeLoading ? "Loading recipe ingredients…" : `${selectedUnlock.type} ingredient data is unavailable.`}</p>}
        </section>
      )}
    </section>
  );
};

interface CollectionCategory {
  name: string;
  entries: readonly CollectionPreviewEntry[];
  maxed: number | null;
  unlockedTiers: number | null;
  maxTiers: number | null;
}

type CollectionProgressKind = "not-started" | "in-progress" | "maxed" | "unavailable";

const COLLECTION_PROGRESS_LABEL: Record<CollectionProgressKind, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  maxed: "Maxed",
  unavailable: "Progress unavailable",
};

const collectionProgressKind = (entry: CollectionPreviewEntry): CollectionProgressKind => {
  if (entry.isMaxed === null || entry.unlockedTier === null) return "unavailable";
  if (entry.isMaxed) return "maxed";
  if (entry.unlockedTier === 0 || entry.amount === 0) return "not-started";
  return "in-progress";
};

const collectionTextMatch = (entry: CollectionPreviewEntry, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  return !needle || [entry.name, entry.id, entry.category].some((value) => value?.toLowerCase().includes(needle));
};

const filteredCollectionEntries = (
  category: CollectionCategory,
  query: string,
  progressFilters: readonly CollectionProgressKind[],
): CollectionPreviewEntry[] => category.entries.filter((entry) => (
  collectionTextMatch(entry, query)
  && (progressFilters.length === 0 || progressFilters.includes(collectionProgressKind(entry)))
));

const partitionCollectionCategories = (categories: readonly CollectionCategory[]): CollectionCategory[][] => {
  const columns: CollectionCategory[][] = [[], []];
  categories.forEach((category, index) => columns[index % columns.length].push(category));
  return columns;
};

const CollectionCategoryDetail: React.FC<{
  category: CollectionCategory;
  entries: readonly CollectionPreviewEntry[];
  tradingAllowed: boolean | null;
  items: ItemIndex;
  loading: boolean;
  error: string | null;
}> = ({ category, entries, tradingAllowed, items, loading, error }) => {
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const selectedEntry = entries.find((entry) => entry.id === selectedCollectionId) ?? null;
  return (
    <section className="profile-collection-selected" aria-label={`${category.name} collections`}>
      <header>
        <h3>{category.name}</h3>
        <span className="profile-number">{entries.length.toLocaleString()} collections</span>
      </header>
      {selectedEntry ? (
        <CollectionDetail
          entry={selectedEntry}
          tradingAllowed={tradingAllowed}
          items={items}
          loading={loading}
          error={error}
          onBack={() => setSelectedCollectionId(null)}
        />
      ) : entries.length > 0 ? (
        <div className="profile-item-grid profile-collection-tile-grid" data-collection-render-count={entries.length}>
          {entries.map((entry) => (
            <CollectionTile
              key={entry.id}
              entry={entry}
              tradingAllowed={tradingAllowed}
              onSelect={() => setSelectedCollectionId(entry.id)}
            />
          ))}
        </div>
      ) : <ProfilePbcEmpty>No collections match these filters.</ProfilePbcEmpty>}
    </section>
  );
};

export const CollectionsPreview: React.FC<CollectionsPreviewProps> = ({
  status,
  model,
  gameMode = null,
  error = null,
}) => {
  const recipes = useRecipes();
  const skillIcons = useSkillIcons().icons;
  useEffect(() => requestSkillIcons(), []);
  const collections = model ?? {
    available: false,
    entries: [],
    unlockedCollections: null,
    maxedCollections: null,
    unlockedTiers: null,
    maxTiers: null,
    dropped: 0,
    partial: false,
  } satisfies CollectionsPreviewModel;
  const tradingAllowed = tradingAllowedForGameMode(gameMode);
  const groups = useMemo(
    () => groupProfileEntries(collections.entries, (entry) => entry.category),
    [collections.entries],
  );
  const categories = useMemo<CollectionCategory[]>(() => [...groups.entries()].map(([name, entries]) => ({
    name,
    entries,
    maxed: entries.every((entry) => entry.isMaxed !== null)
      ? entries.filter((entry) => entry.isMaxed === true).length
      : null,
    unlockedTiers: entries.every((entry) => entry.unlockedTier !== null)
      ? entries.reduce((sum, entry) => sum + (entry.unlockedTier ?? 0), 0)
      : null,
    maxTiers: entries.every((entry) => entry.maxTier !== null)
      ? entries.reduce((sum, entry) => sum + (entry.maxTier ?? 0), 0)
      : null,
  })), [groups]);
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [progressFilters, setProgressFilters] = useState<CollectionProgressKind[]>([]);
  const textMatches = useMemo(
    () => collections.entries.filter((entry) => collectionTextMatch(entry, query)),
    [collections.entries, query],
  );
  const progressOptions = useMemo(() => (["not-started", "in-progress", "maxed", "unavailable"] as const)
    .filter((kind) => collections.entries.some((entry) => collectionProgressKind(entry) === kind)),
  [collections.entries]);
  const progressCounts = useMemo(() => new Map(progressOptions.map((kind) => [kind,
    textMatches.filter((entry) => collectionProgressKind(entry) === kind).length])),
  [progressOptions, textMatches]);
  const categoryMatchCounts = useMemo(() => new Map(categories.map((category) => [category.name,
    category.entries.filter((entry) => collectionTextMatch(entry, query)
      && (progressFilters.length === 0 || progressFilters.includes(collectionProgressKind(entry)))).length])),
  [categories, progressFilters, query]);
  const filterActive = query.trim().length > 0 || progressFilters.length > 0;
  const matchingCollectionCount = [...categoryMatchCounts.values()].reduce((sum, count) => sum + count, 0);
  const categoryColumns = useMemo(() => partitionCollectionCategories(categories), [categories]);
  const toggleProgress = (kind: CollectionProgressKind) => setProgressFilters((current) => current.includes(kind)
    ? current.filter((value) => value !== kind)
    : [...current, kind]);
  const clearFilters = () => {
    setQuery("");
    setProgressFilters([]);
  };
  const nearby = useMemo(() => collections.entries
    .flatMap((entry) => {
      const sourceAccess = resolveCollectionSourceGate(entry.sourceGate, tradingAllowed);
      if (sourceAccess && sourceAccess.state !== "available") return [];
      return entry.amount !== null && entry.nextTier !== null && entry.nextRequired !== null && entry.amount < entry.nextRequired
        ? [{ entry, remaining: entry.nextRequired - entry.amount, sourceAccess }]
        : [];
    })
    .sort((a, b) => (a.remaining - b.remaining) || b.entry.progressPercent! - a.entry.progressPercent!)
    .slice(0, NEARBY_TIER_LIMIT), [collections.entries, tradingAllowed]);
  const overallPercent = collections.unlockedTiers !== null && collections.maxTiers !== null && collections.maxTiers > 0
    ? Math.min(100, Math.max(0, (collections.unlockedTiers / collections.maxTiers) * 100))
    : null;

  return (
    <section className="profile-pbc-preview profile-collections-preview" aria-label="Collections">
      <section className="profile-pbc-shell profile-glass" aria-label="Collection progress">
        <ProfilePbcHeader
          eyebrow="Collections"
          title="Collection progress"
          count={collections.available ? collections.entries.length : null}
          countLabel="collections"
        />
        {status.showSkeleton ? (
          <ProfilePbcLoading rows={8} />
        ) : !collections.available ? (
          <ProfilePbcUnavailable status={status} noun="Collection" error={error} />
        ) : collections.entries.length === 0 ? (
          <ProfilePbcEmpty>No collection progress is recorded on this profile.</ProfilePbcEmpty>
        ) : (
          <div className="profile-pbc-content profile-collections-content">
            <ProfilePbcStatusLine status={status} partial={collections.partial} />
            <div className="profile-collections-top">
              <section className="profile-collections-overview" aria-label="Overall collection progress">
                <header>
                  <span>Overall</span>
                  {collections.unlockedTiers !== null && collections.maxTiers !== null && (
                    <strong className="profile-number">
                      {collections.unlockedTiers.toLocaleString()} / {collections.maxTiers.toLocaleString()} tiers
                    </strong>
                  )}
                </header>
                {overallPercent !== null && (
                  <span
                    className="profile-pbc-progress profile-collections-overall-track"
                    role="progressbar"
                    aria-label="Overall collection tier progress"
                    aria-valuemin={0}
                    aria-valuemax={collections.maxTiers ?? undefined}
                    aria-valuenow={collections.unlockedTiers ?? undefined}
                  >
                    <i style={{ width: profilePercent(overallPercent) }} />
                  </span>
                )}
                <dl>
                  {collections.unlockedCollections !== null && (
                    <div>
                      <dt>Unlocked</dt>
                      <dd className="profile-number">{collections.unlockedCollections.toLocaleString()}</dd>
                    </div>
                  )}
                  {collections.maxedCollections !== null && (
                    <div>
                      <dt>Maxed</dt>
                      <dd className="profile-number">{collections.maxedCollections.toLocaleString()}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Catalogue</dt>
                    <dd className="profile-number">{collections.entries.length.toLocaleString()}</dd>
                  </div>
                </dl>
              </section>
              {nearby.length > 0 && (
                <section className="profile-collections-nearby" aria-label="Nearby collection tiers">
                  <header>
                    <span>Nearby tiers</span>
                    <strong>{nearby.length.toLocaleString()} closest</strong>
                  </header>
                  <div>
                    {nearby.map(({ entry, remaining, sourceAccess }) => {
                      const showSource = Boolean(sourceAccess && entry.sourceGate?.requirement.state !== "met");
                      const icon = <ItemIcon name={entry.name} id={entry.id} hypixelId={entry.id} size={22} fallback="blank" />;
                      return (
                      <article
                        key={entry.id}
                        style={{ "--profile-collection-accent": collectionCategoryAccent(entry.category) } as React.CSSProperties}
                      >
                        <ProfileIdentityTrigger
                          id={entry.id}
                          name={entry.name}
                          wikiName={entry.name}
                          icon={icon}
                          metadata={collectionTooltipMetadata(entry, sourceAccess)}
                          provenance="Collection progress"
                          ariaLabel={`${entry.name}, ${compactProfileNumber(remaining)} remaining to tier ${entry.nextTier}${showSource ? `, ${sourceAccess?.label}` : ""}`}
                          wrapperClassName="profile-collections-nearby-trigger"
                          buttonClassName="profile-collections-nearby-identity"
                        >
                          <i className="profile-collections-nearby-icon" aria-hidden>{icon}</i>
                          <span className="profile-collections-nearby-copy">
                            <strong>{entry.name}</strong>
                            <small className="profile-number">Tier {entry.nextTier}</small>
                            {showSource && sourceAccess && <CollectionSourceBadge access={sourceAccess} />}
                          </span>
                        </ProfileIdentityTrigger>
                        <span className="profile-number profile-collections-nearby-remaining">{compactProfileNumber(remaining)} remaining</span>
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
                      </article>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>

            <ProfileProgressionFilters
              query={query}
              onQueryChange={setQuery}
              searchLabel="Search collections"
              placeholder="Search collections"
              activeCount={progressFilters.length}
              resultCount={matchingCollectionCount}
              totalCount={collections.entries.length}
              onClear={clearFilters}
              groups={[{
                legend: "Collection progress",
                options: progressOptions.map((kind) => {
                  const count = progressCounts.get(kind) ?? 0;
                  const selectedFilter = progressFilters.includes(kind);
                  return {
                    id: kind,
                    label: COLLECTION_PROGRESS_LABEL[kind],
                    count,
                    selected: selectedFilter,
                    disabled: count === 0 && !selectedFilter,
                    onToggle: () => toggleProgress(kind),
                  };
                }),
              }]}
            />

            <div className="profile-collection-category-columns" aria-label="Collection categories">
              {categoryColumns.map((column, columnIndex) => (
                <div className="profile-collection-category-column" key={columnIndex}>
                  {column.map((category) => {
                    const icon = collectionCategoryIcon(category.name, skillIcons);
                    const matchCount = categoryMatchCounts.get(category.name) ?? 0;
                    const isOpen = openCategories.has(category.name);
                    const entries = filteredCollectionEntries(category, query, progressFilters);
                    return (
                      <div className={`profile-collection-category-stack ${isOpen ? "is-expanded" : ""}`} key={category.name}>
                        <button
                          type="button"
                          className="profile-collection-category-button"
                          aria-expanded={isOpen}
                          disabled={matchCount === 0 && !isOpen}
                          onClick={() => setOpenCategories((current) => toggleProfileExpansionKey(current, category.name))}
                          style={{ "--profile-collection-accent": collectionCategoryAccent(category.name) } as React.CSSProperties}
                        >
                          {icon && (
                            <i className="profile-collection-category-icon" aria-hidden>
                              <ItemIcon name={icon.name} id={icon.id} size={27} fallback="blank" />
                            </i>
                          )}
                          <span className="profile-collection-category-copy">
                            <span>{category.name}</span>
                            <strong className="profile-number">
                              {filterActive
                                ? `${matchCount.toLocaleString()} / ${category.entries.length.toLocaleString()} matches`
                                : category.maxed === null
                                ? `${category.entries.length.toLocaleString()} collections`
                                : `${category.maxed.toLocaleString()} / ${category.entries.length.toLocaleString()} maxed`}
                            </strong>
                            {category.unlockedTiers !== null && category.maxTiers !== null && (
                              <small className="profile-number">{category.unlockedTiers.toLocaleString()} / {category.maxTiers.toLocaleString()} tiers</small>
                            )}
                          </span>
                        </button>
                        {isOpen && (
                          <CollectionCategoryDetail
                            category={category}
                            entries={entries}
                            tradingAllowed={tradingAllowed}
                            items={recipes.items}
                            loading={recipes.loading}
                            error={recipes.error}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </section>
  );
};
