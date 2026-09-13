import type { Item } from "../items/useItemData";
import { UtilityTargetSearch } from "../ui/UtilityTargetSearch";
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CircleHelp,
  Flame,
  Hammer,
  LockKeyhole,
} from "lucide-react";
import { ProfileProgressionFilterMenu, type ProfileProgressionFilterGroup } from "../profile-view/profile-sections/ProfileProgressionFilters";
import { ProfileItemTile } from "../profile-view/profile-sections/ProfileItemTile";
import { itemStatsFromRecord } from "../ui/itemTooltipModel";
import { FOCUS } from "../ui/kit";
import type {
  RecipeAccessStatus,
  RecipeBookEntry,
  RecipeMaterialStatus,
  RecipeMethod,
  RecipeMethodKind,
} from "./progressionModel";

const ACCESS_LABEL: Record<RecipeAccessStatus, string> = {
  unlocked: "Unlocked",
  locked: "Locked",
  unknown: "Check in game",
};

const MATERIAL_LABEL: Record<RecipeMaterialStatus, string> = {
  ready: "Materials ready",
  missing: "Needs materials",
  unknown: "Storage unavailable",
};

const ACCESS_ICON = {
  unlocked: Check,
  locked: LockKeyhole,
  unknown: CircleHelp,
} as const;

type OutcomeFilter = "all" | "ready" | RecipeAccessStatus;
type MethodFilter = "all" | RecipeMethodKind;
type MaterialFilter = "all" | RecipeMaterialStatus;

const ROW_HEIGHT = 50;
const OVERSCAN = 5;

/** Match the compact target shelves; item names and access stay in item details. */
const collectionColumns = (width: number, entryCount: number): number => Math.min(
  Math.max(1, entryCount),
  Math.max(1, Math.floor((width + 5) / 49)),
);

interface RecipeCollectionRowsProps {
  entries: readonly RecipeBookEntry[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
}

const RecipeCollectionRows: React.FC<RecipeCollectionRowsProps> = ({ entries, selectedId, loading, onSelect }) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);
  const [range, setRange] = useState({ start: 0, end: 18 });
  const syncRange = useCallback((node: HTMLDivElement, columnCount = columns) => {
    const startRow = Math.max(0, Math.floor(node.scrollTop / ROW_HEIGHT) - OVERSCAN);
    const endRow = Math.ceil((node.scrollTop + node.clientHeight) / ROW_HEIGHT) + OVERSCAN;
    const start = startRow * columnCount;
    const end = Math.min(entries.length, endRow * columnCount);
    setRange((current) => current.start === start && current.end === end ? current : { start, end });
  }, [columns, entries.length]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const nextColumns = collectionColumns(node.clientWidth, entries.length);
    setColumns((current) => current === nextColumns ? current : nextColumns);
    node.scrollTop = 0;
    syncRange(node, nextColumns);
  }, [columns, entries, syncRange]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const nextColumns = collectionColumns(node.clientWidth, entries.length);
      setColumns((current) => current === nextColumns ? current : nextColumns);
      syncRange(node, nextColumns);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [entries.length, syncRange]);

  const rowCount = Math.ceil(entries.length / columns);

  return (
    <div
      ref={viewportRef}
      className="recipes-collection-results"
      style={{ "--recipes-shelf-content-height": `${Math.max(1, rowCount) * ROW_HEIGHT}px` } as React.CSSProperties}
      onScroll={(event) => syncRange(event.currentTarget)}
      aria-label={`${entries.length.toLocaleString()} matching recipes`}
      data-columns={columns}
    >
      {entries.length > 0 ? (
        <div className="recipes-collection-scroll" style={{ height: rowCount * ROW_HEIGHT }}>
          {entries.slice(range.start, range.end).map((entry, offset) => {
            const index = range.start + offset;
            const rowIndex = Math.floor(index / columns);
            const columnIndex = index % columns;
            const selected = selectedId === entry.id;
            const materialLabel = entry.materialStatus === "ready" && entry.accessStatus === "unlocked" ? "Ready to make" : MATERIAL_LABEL[entry.materialStatus];
            const primaryGate = entry.preferredMethod.accessGates.find((gate) => gate.state !== "met")
              ?? entry.preferredMethod.accessGates[0];
            const gateProgress = primaryGate?.progressLabel ?? null;
            const sourceLabel = primaryGate?.sourceAccess?.route === "progression"
              ? null
              : primaryGate?.sourceAccess?.label ?? null;
            return (
              <article
                key={entry.id}
                className={`recipes-shelf-entry${selected ? " is-selected" : ""}`}
                style={{
                  height: ROW_HEIGHT,
                  width: `${100 / columns}%`,
                  left: `${columnIndex * (100 / columns)}%`,
                  transform: `translateY(${rowIndex * ROW_HEIGHT}px)`,
                }}
                aria-label={entry.item.name}
              >
                <ProfileItemTile id={entry.id} hypixelId={entry.item.hypixelId} name={entry.item.name} iconName={entry.item.wikiTitle ?? entry.item.name}
                  tier={entry.item.tier} selected={selected} onClick={() => onSelect(entry.id)} iconSize={34}
                  stats={itemStatsFromRecord(entry.item.stats)}
                  metadata={[
                    { label: "Method", value: entry.methods.map((method) => method.label).join(" + ") },
                    { label: "Recipe access", value: ACCESS_LABEL[entry.accessStatus] },
                    { label: "Materials", value: materialLabel },
                    ...(primaryGate ? [{ label: primaryGate.label, value: [gateProgress, sourceLabel].filter(Boolean).join(" · ") || primaryGate.detail }] : []),
                  ]}
                />
              </article>
            );
          })}
        </div>
      ) : loading ? (
        <div className="recipes-collection-empty" role="status"><span className="recipes-spinner" aria-hidden />Loading recipes</div>
      ) : (
        <div className="recipes-collection-empty"><strong>No recipes match</strong><span>Change the access state, search, or filters.</span></div>
      )}
    </div>
  );
};

export const RecipeCollection: React.FC<{
  entries: readonly RecipeBookEntry[];
  initialQuery: string;
  linkedItem?: Item | null;
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
}> = ({ entries, initialQuery, selectedId, loading, onSelect, linkedItem }) => {
  const [query, setQuery] = useState(initialQuery);
  const [expanded, setExpanded] = useState(true);
  const deferredQuery = useDeferredValue(query);
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>("all");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
  const [materialFilter, setMaterialFilter] = useState<MaterialFilter>("all");
  const [rarityFilter, setRarityFilter] = useState("all");

  const rarities = useMemo(() => [...new Set(entries.map((entry) => entry.item.tier).filter((tier): tier is string => Boolean(tier)))].sort(), [entries]);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const searchTerms = useMemo(() => normalizedQuery.split(/\s+/).filter(Boolean), [normalizedQuery]);
  const matchesOutcome = useCallback((entry: RecipeBookEntry) =>
    outcomeFilter === "all"
    || outcomeFilter === "ready" && entry.accessStatus === "unlocked" && entry.materialStatus === "ready"
    || outcomeFilter !== "ready" && entry.accessStatus === outcomeFilter,
  [outcomeFilter]);
  const matches = useCallback((entry: RecipeBookEntry, ignore?: "outcome" | "method" | "material" | "rarity") =>
    (searchTerms.length === 0 || searchTerms.every((term) => entry.searchText.includes(term)))
    && (ignore === "outcome" || matchesOutcome(entry))
    && (ignore === "method" || methodFilter === "all" || entry.methods.some((method) => method.kind === methodFilter))
    && (ignore === "material" || materialFilter === "all" || entry.materialStatus === materialFilter)
    && (ignore === "rarity" || rarityFilter === "all" || entry.item.tier === rarityFilter),
  [materialFilter, matchesOutcome, methodFilter, rarityFilter, searchTerms]);

  const visibleEntries = useMemo(() => {
    const filtered = entries.filter((entry) => matches(entry));
    if (!normalizedQuery) return filtered;
    const rank = (entry: RecipeBookEntry): number => {
      const name = entry.item.name.toLowerCase();
      if (name === normalizedQuery) return 0;
      if (name.startsWith(normalizedQuery)) return 1;
      if (searchTerms.every((term) => name.includes(term))) return 2;
      return 3;
    };
    return filtered.sort((left, right) => rank(left) - rank(right) || left.item.name.localeCompare(right.item.name));
  }, [entries, matches, normalizedQuery, searchTerms]);
  const countWhere = useCallback((ignore: "outcome" | "method" | "material" | "rarity", predicate: (entry: RecipeBookEntry) => boolean) =>
    entries.filter((entry) => matches(entry, ignore) && predicate(entry)).length,
  [entries, matches]);
  const groups = useMemo<readonly ProfileProgressionFilterGroup[]>(() => [
    {
      legend: "Status",
      options: ([
        ["ready", "Ready"], ["unlocked", "Unlocked"], ["locked", "Locked"], ["unknown", "Check in game"],
      ] as const).map(([id, label]) => {
        const count = countWhere("outcome", (entry) => id === "ready"
          ? entry.accessStatus === "unlocked" && entry.materialStatus === "ready"
          : entry.accessStatus === id);
        const selected = outcomeFilter === id;
        return { id, label, count, selected, disabled: count === 0 && !selected, onToggle: () => setOutcomeFilter(selected ? "all" : id) };
      }),
    },
    {
      legend: "Method",
      options: ([
        ["craft", "Crafting", <Hammer key="craft" aria-hidden />],
        ["forge", "Forge", <Flame key="forge" aria-hidden />],
      ] as const).map(([id, label, icon]) => {
        const count = countWhere("method", (entry) => entry.methods.some((method) => method.kind === id));
        const selected = methodFilter === id;
        return { id, label, icon, count, selected, disabled: count === 0 && !selected, onToggle: () => setMethodFilter(selected ? "all" : id) };
      }),
    },
    {
      legend: "Materials",
      options: ([
        ["ready", "Materials ready"],
        ["missing", "Needs materials"],
        ["unknown", "Storage unavailable"],
      ] as const).map(([id, label]) => {
        const count = countWhere("material", (entry) => entry.materialStatus === id);
        const selected = materialFilter === id;
        return { id, label, count, selected, disabled: count === 0 && !selected, onToggle: () => setMaterialFilter(selected ? "all" : id) };
      }),
    },
    {
      legend: "Rarity",
      options: rarities.map((rarity) => {
        const count = countWhere("rarity", (entry) => entry.item.tier === rarity);
        const selected = rarityFilter === rarity;
        return {
          id: rarity,
          label: rarity.replace(/_/g, " ").toLowerCase().replace(/(^|\s)\w/g, (letter) => letter.toUpperCase()),
          count,
          selected,
          disabled: count === 0 && !selected,
          onToggle: () => setRarityFilter(selected ? "all" : rarity),
          accent: `var(--color-rarity-${rarity.toLowerCase().replace(/_/g, "-")})`,
        };
      }),
    },
  ], [countWhere, outcomeFilter, materialFilter, methodFilter, rarities, rarityFilter]);

  const clearFilters = useCallback(() => {
    setQuery("");
    setMethodFilter("all");
    setMaterialFilter("all");
    setRarityFilter("all");
    setOutcomeFilter("all");
  }, []);
  const showLinkedItem = Boolean(linkedItem && selectedId && (!query.trim() || linkedItem.name.toLowerCase().includes(query.trim().toLowerCase())));
  const activeAdvancedFilters = [outcomeFilter, methodFilter, materialFilter, rarityFilter].filter((filter) => filter !== "all").length;

  return (
    <section className="recipes-collection" aria-labelledby="recipes-collection-title">
      <div className="recipes-collection-overview">
        <header className="recipes-zone-heading">
          <span className="profile-eyebrow">Collection</span>
          <h2 id="recipes-collection-title">Recipes</h2>
          <p>Unlocks and material readiness</p>
        </header>
        <UtilityTargetSearch query={query} onQueryChange={setQuery} expanded={expanded} onExpandedChange={setExpanded}
          placeholder="Add a target item" label="Search recipes, ingredients, or unlocks" controls="recipes-picker-shelf"
          actions={<ProfileProgressionFilterMenu groups={groups} activeCount={activeAdvancedFilters} onClear={clearFilters} />} />
      </div>
      <div className="recipes-picker-shelf" id="recipes-picker-shelf" hidden={!expanded}>
      <div
        id="recipes-collection-results-panel"
        className="recipes-collection-panel"
        role="region"
        aria-label="Matching recipes"
      >
        {showLinkedItem && linkedItem && selectedId && (
          <div className="recipes-collection-results" style={{ "--recipes-shelf-content-height": String(ROW_HEIGHT) + "px" } as React.CSSProperties}>
            <article className="recipes-shelf-entry is-selected" style={{ position: "relative", width: "100%", height: ROW_HEIGHT }} aria-label={linkedItem.name}>
              <ProfileItemTile id={selectedId} hypixelId={linkedItem.hypixelId} name={linkedItem.name} iconName={linkedItem.wikiTitle ?? linkedItem.name}
                tier={linkedItem.tier} selected onClick={() => onSelect(selectedId)} iconSize={34} />
            </article>
          </div>
        )}
        {(!showLinkedItem || visibleEntries.length > 0) && <RecipeCollectionRows entries={visibleEntries} selectedId={selectedId} loading={loading} onSelect={onSelect} />}
      </div>
      </div>
    </section>
  );
};

export const RecipeMethodPicker: React.FC<{
  methods: readonly RecipeMethod[];
  selected: RecipeMethodKind;
  onSelect: (kind: RecipeMethodKind) => void;
}> = ({ methods, selected, onSelect }) => (
  <div className="recipes-method-picker" role="group" aria-label="Recipe method">
    {methods.map((method) => {
      const Icon = method.kind === "forge" ? Flame : Hammer;
      return (
        <button key={method.kind} type="button" aria-pressed={selected === method.kind} className={`${FOCUS}${selected === method.kind ? " is-active" : ""}`} onClick={() => onSelect(method.kind)}>
          <Icon aria-hidden />
          <span><strong>{method.label}</strong><small>{ACCESS_LABEL[method.accessStatus]} · {MATERIAL_LABEL[method.materialStatus]}</small></span>
        </button>
      );
    })}
  </div>
);

export const RecipeAccessPanel: React.FC<{ method: RecipeMethod }> = ({ method }) => {
  const AccessIcon = ACCESS_ICON[method.accessStatus];
  const alternativeCollections = method.accessGates.filter((gate) => gate.alternative).length > 1;
  return (
    <section className={`recipes-access is-${method.accessStatus}`} aria-labelledby="recipes-access-title">
      <header>
        <span className="recipes-access-icon"><AccessIcon aria-hidden /></span>
        <div>
          <span className="profile-eyebrow">Recipe access</span>
          <h2 id="recipes-access-title">{method.accessStatus === "locked" ? "How to unlock it" : ACCESS_LABEL[method.accessStatus]}</h2>
          <p>
            {method.accessStatus === "unlocked"
              ? "The selected profile meets every known recipe requirement."
              : method.accessStatus === "locked"
                ? "Complete the missing requirement below."
                : "Hypixel's profile data cannot reliably confirm this recipe's access. Check the in-game Recipe Book."}
          </p>
        </div>
      </header>
      {method.accessGates.length === 0 ? (
        <div className="recipes-access-open"><Check aria-hidden /><span><strong>No recipe unlock is listed</strong><small>This recipe is available without a collection or profile gate.</small></span></div>
      ) : (
        <div className="recipes-access-gates">
          {alternativeCollections && <p>Complete any one of the collection paths.</p>}
          {method.accessGates.map((gate) => {
            const GateIcon = ACCESS_ICON[gate.state === "met" ? "unlocked" : gate.state === "unmet" ? "locked" : "unknown"];
            return (
              <article key={gate.id} className={`is-${gate.state}`}>
                <GateIcon aria-hidden />
                <div>
                  <strong>{gate.label}</strong>
                  <span>{gate.detail}</span>
                  {gate.state !== "met" && <small>{gate.how}</small>}
                  {gate.progressPercent !== null && (
                    <span className="recipes-access-progress" role="progressbar" aria-label={`${gate.label} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(gate.progressPercent)}>
                      <i style={{ width: `${gate.progressPercent}%` }} />
                    </span>
                  )}
                </div>
                {gate.alternative && <em>one path</em>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
