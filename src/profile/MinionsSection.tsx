import React, { useCallback, useMemo, useState } from "react";
import { ExternalLink, LockKeyhole, Search, TriangleAlert, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { BoardControl, CardBoard, CollapseCard } from "../island/boardPrimitives";
import type { OwnedIndex } from "../inventory";
import type { AllocationNode } from "../items/craftingAllocation";
import type { ItemIndex } from "../items/useItemData";
import { ItemIcon } from "../ui/ItemIcon";
import {
  BTN_QUIET,
  FOCUS,
  INPUT,
  LABEL,
  NUM,
  PANEL,
  SectionHead,
  Tag,
} from "../ui/kit";
import { WikiLink } from "../ui/WikiLink";
import type { ParsedItems } from "../networth/profileNetworth";
import type { NetworthStatus } from "../networth/useNetworth";
import {
  buildMinionHoldings,
  parseCraftedGenerators,
  MINION_CATALOGUE_PROVENANCE,
  minionProgress,
  minionProgressSummary,
  planMinionFamily,
  type CraftedGeneratorProfile,
  type MinionFamilyProgress,
  type MinionPlan,
} from "./minions";
import { slug } from "../items/wikiCrafting";
import { MINION_TIER_ROW_CLASS } from "./minionGrid";
import {
  groupMinionFamilies,
  MINION_CATEGORY_BOARD_CLASS,
  MINION_CATEGORY_CARD_CLASS,
  MINION_DETAIL_SHEET_CLASS,
  MINION_FAMILY_ROW_CLASS,
} from "./minionCategoryModel";

const EMPTY_PROFILE: CraftedGeneratorProfile = {
  available: false,
  highestByFamily: {},
  raw: [],
  unmapped: [],
};

const count = (value: number): string => value.toLocaleString();

const displaySource = (source: string): string =>
  source === "enderChest" ? "ender chest" : source === "Hypixel API" ? source : source;

const completionText = (entry: MinionFamilyProgress): string => {
  if (entry.completion === "complete") return "Complete";
  if (entry.completion === "unavailable") return "Unavailable";
  return `${entry.tiersRemaining ?? "-"} left`;
};

const selectorSummary = (entry: MinionFamilyProgress): string => {
  if (entry.currentTier === null) return "Unavailable";
  return `Tier ${entry.currentTier}/${entry.maxTier} | ${completionText(entry)}`;
};

const allocationStatus = (node: AllocationNode | undefined, requested: number): React.ReactNode => {
  if (!node || !node.inventoryKnown) return <span className="text-slate-500">unavailable</span>;
  if (node.remaining === 0) return <span className="text-emerald-300">covered</span>;
  if (node.children.length > 0) return <span className="text-amber-300">craft {count(node.remaining)}</span>;
  return <span className="text-amber-300">short {count(Math.max(0, requested - node.allocated))}</span>;
};

const AllocationBreakdown: React.FC<{ nodes: readonly AllocationNode[]; depth?: number }> = ({ nodes, depth = 0 }) => (
  <div className={`${depth === 0 ? "mt-2 border-t border-white/8 pt-2" : "mt-1 border-l border-white/10 pl-2"} space-y-1`}>
    {nodes.map((node) => (
      <div key={`${node.id}-${depth}-${node.requested}`} className="text-[10px]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-slate-300">
            {depth > 0 && <span className="mr-1 text-slate-600" aria-hidden>-</span>}
            {node.name}
          </span>
          <span className={`${NUM} shrink-0 text-slate-400`}>
            {node.inventoryKnown ? `${count(node.allocated)} held | ${count(node.remaining)} short` : "unavailable"}
          </span>
        </div>
        {node.children.length > 0 && <AllocationBreakdown nodes={node.children} depth={depth + 1} />}
      </div>
    ))}
  </div>
);

const MaterialRow: React.FC<{
  name: string;
  amount: number;
  node?: AllocationNode;
  items: ItemIndex;
}> = ({ name, amount, node, items }) => {
  const id = slug(name);
  const item = items[id];
  return (
    <div className="rounded-sm border border-white/8 bg-black/10 px-2 py-1.5" data-minion-material-row>
      <div className="flex min-w-0 items-center gap-2">
        <ItemIcon name={name} id={item?.hypixelId ?? id} size={22} fallback="blank" />
        <WikiLink
          name={name}
          className="min-w-0 flex-1 text-[11px] text-slate-200"
          nameClassName="truncate"
          title={`${name} on the official Hypixel SkyBlock Wiki`}
        />
        <span className={`${NUM} shrink-0 text-[11px] text-slate-300`}>
          x{count(amount)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 pl-7 text-[10px]">
        <span>{allocationStatus(node, amount)}</span>
        {node?.children.length ? <span className="text-slate-500">breakdown</span> : null}
      </div>
      {node?.children.length ? <AllocationBreakdown nodes={node.children} /> : null}
    </div>
  );
};

const FamilyDetail: React.FC<{
  entry: MinionFamilyProgress;
  plan: MinionPlan | null;
  items: ItemIndex;
  holdingsKnown: boolean;
  openTier: number | null;
  onToggleTier: (tier: number) => void;
}> = ({ entry, plan, items, holdingsKnown, openTier, onToggleTier }) => {
  const wiki = (
    <WikiLink name={entry.family.wikiTitle} className={BTN_QUIET} nameClassName="text-[11px]">
      <span>Official wiki</span>
      <ExternalLink className="h-3 w-3" aria-hidden />
    </WikiLink>
  );

  if (entry.completion === "unavailable") {
    return (
      <div className="space-y-2 border-t border-white/10 px-3 py-3 text-[11px] text-slate-400" data-minion-upgrade-path>
        <div className="flex items-center justify-between gap-2">
          <span className={LABEL}>Upgrade path unavailable</span>
          {wiki}
        </div>
        <p>Crafted tier data was not shared for this profile. Unavailable is not uncrafted.</p>
      </div>
    );
  }

  if (entry.completion === "complete" || !plan) {
    return (
      <div className="space-y-2 border-t border-white/10 px-3 py-3 text-[11px] text-emerald-200" data-minion-upgrade-path>
        <div className="flex items-center justify-between gap-2">
          <span className={LABEL}>Upgrade path complete</span>
          {wiki}
        </div>
        <p>Tier {entry.maxTier} reached.</p>
      </div>
    );
  }

  let childIndex = 0;
  const tiers = plan.requirements.map((requirement, index) => ({
    ...requirement,
    data: entry.remainingTiers[index]?.data ?? { tba: 0, storage: 0, materials: [], npc: null },
    rows: requirement.materials.map((material) => ({
      material,
      node: material.amount > 0 ? plan.allocation.root.children[childIndex++] : undefined,
    })),
  }));

  return (
    <div className="space-y-3 border-t border-white/10 px-3 py-3" data-minion-upgrade-path>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className={LABEL}>Remaining upgrade path</div>
          <p className="mt-0.5 text-[11px] text-slate-400">Tiers {plan.fromTier}-{plan.throughTier}</p>
        </div>
        {wiki}
      </div>

      {!holdingsKnown && (
        <div className="flex items-start gap-2 border-l-2 border-amber-400/60 bg-amber-400/5 px-2.5 py-2 text-[11px] text-amber-200" role="status">
          <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>Holdings unavailable. Residuals are not a zero claim.</span>
        </div>
      )}

      <div className="space-y-1.5" data-minion-tier-list>
        {tiers.map(({ tier, data, rows }) => {
          const open = openTier === tier;
          const panelId = `minion-tier-${entry.family.id}-${tier}`;
          return (
            <div key={tier} className={MINION_TIER_ROW_CLASS} data-minion-tier-row>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => onToggleTier(tier)}
                className={`${FOCUS} flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-[11px] text-slate-200`}
              >
                <span className="font-semibold">Tier {tier}</span>
                <span className={`${NUM} text-[10px] text-slate-500`}>storage {count(data.storage)} | {data.tba} sec/action</span>
              </button>
              {open && (
                <div id={panelId} role="region" className="space-y-1.5 border-t border-white/8 p-2" data-minion-tier-panel>
                  {rows.length === 0 ? (
                    <p className="text-[11px] text-slate-500">No item quantities were published for this tier.</p>
                  ) : (
                    rows.map(({ material, node }, index) => (
                      <MaterialRow
                        key={`${tier}-${material.name}-${index}`}
                        name={material.name}
                        amount={material.amount}
                        node={node}
                        items={items}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-sm border border-white/8 bg-black/15 px-2.5 py-2" data-minion-residuals>
        <div className={LABEL}>Residual shortage</div>
        {plan.shortages.length === 0 ? (
          <p className="mt-1 text-[11px] text-emerald-300">No residual shortage.</p>
        ) : (
          <div className="mt-1.5 space-y-1">
            {plan.shortages.map((shortage) => (
              <div key={shortage.id} className="flex items-baseline justify-between gap-2 text-[11px]">
                <WikiLink name={shortage.name} className="min-w-0 text-slate-300" nameClassName="truncate" />
                <span className={`${NUM} shrink-0 ${shortage.known ? "text-amber-300" : "text-slate-500"}`}>
                  {shortage.known ? count(shortage.remaining) : "unknown"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface MinionFamilyRowProps {
  entry: MinionFamilyProgress;
  selected: boolean;
  onSelect: (id: string) => void;
}

const MinionFamilyRow: React.FC<MinionFamilyRowProps> = ({ entry, selected, onSelect }) => (
  <button
    type="button"
    aria-pressed={selected}
    title={`${entry.family.name} / ${selectorSummary(entry)}`}
    data-minion-family-row
    data-minion-family-id={entry.family.id}
    onClick={() => onSelect(entry.family.id)}
    className={`${MINION_FAMILY_ROW_CLASS} ${FOCUS} ${
      selected ? "bg-cyan-500/12 text-slate-50" : "text-slate-300 hover:bg-white/5"
    }`}
  >
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-white/8 bg-slate-950/35">
      <ItemIcon name={entry.family.wikiTitle} id={`${entry.family.id}_MINION`} size={24} fallback="blank" />
    </span>
    <span className="min-w-0 leading-tight">
      <span className="block truncate text-[11px] font-semibold">{entry.family.name}</span>
      <span className={`mt-0.5 block truncate text-[9px] ${entry.completion === "unavailable" ? "text-amber-300/75" : "text-slate-500"}`}>
        {entry.currentTier === null ? "Tier unavailable" : `Tier ${entry.currentTier}/${entry.maxTier} / ${completionText(entry)}`}
      </span>
    </span>
    <span className={`${NUM} shrink-0 text-[10px] ${entry.completion === "complete" ? "text-emerald-300" : "text-slate-400"}`}>
      {entry.currentTier === null ? "-" : `${entry.tiersRemaining ?? 0}`}
    </span>
  </button>
);

const MinionCategoryCard: React.FC<{
  category: { id: string; entries: readonly MinionFamilyProgress[] };
  open: boolean;
  selectedId: string | null;
  detail: React.ReactNode;
  onToggle: () => void;
  onSelect: (id: string) => void;
}> = ({ category, open, selectedId, detail, onToggle, onSelect }) => {
  const first = category.entries[0];
  const complete = category.entries.filter((entry) => entry.completion === "complete").length;
  const selected = category.entries.some((entry) => entry.family.id === selectedId);
  return (
    <div data-minion-category-card className={MINION_CATEGORY_CARD_CLASS}>
      <CollapseCard
        icon={
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-white/8 bg-slate-950/35" aria-hidden>
            {first ? <ItemIcon name={first.family.wikiTitle} id={`${first.family.id}_MINION`} size={24} fallback="blank" /> : null}
          </span>
        }
        title={category.id}
        meta={`${category.entries.length} families`}
        right={<Tag accent={selected}>{complete}/{category.entries.length}</Tag>}
        open={open}
        hit={selected}
        onToggle={onToggle}
      >
        <div className="border-t border-white/8" data-minion-family-rows>
          {category.entries.map((entry) => (
            <MinionFamilyRow
              key={entry.family.id}
              entry={entry}
              selected={entry.family.id === selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
        {detail}
      </CollapseCard>
    </div>
  );
};

export const MinionsSection: React.FC<{
  profile: CraftedGeneratorProfile | null;
  profileStatus: NetworthStatus;
  items: ItemIndex;
  owned: OwnedIndex;
  parsed: ParsedItems | null;
  inventoryShared: boolean;
  ironman: boolean;
}> = ({ profile, profileStatus, items, owned, parsed, inventoryShared, ironman }) => {
  void ironman;
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [openTiers, setOpenTiers] = useState<Readonly<Record<string, number | null>>>({});
  const [openCategories, setOpenCategories] = useState<Readonly<Record<string, boolean>>>({});
  const [searchParams, setSearchParams] = useSearchParams();

  const catalogueProfile = useMemo(() => {
    if (!profile || !profile.available || profile.raw.length === 0) return profile;
    return parseCraftedGenerators({ player_data: { crafted_generators: profile.raw } });
  }, [profile]);
  const progress = useMemo(() => minionProgress(catalogueProfile ?? EMPTY_PROFILE), [catalogueProfile]);
  const summary = useMemo(() => minionProgressSummary(progress), [progress]);
  const holdings = useMemo(
    () => buildMinionHoldings(items, owned, parsed, inventoryShared),
    [items, owned, parsed, inventoryShared]
  );
  const types = useMemo(() => ["all", ...new Set(progress.map((entry) => entry.family.type))], [progress]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return progress.filter((entry) => {
      const matchesType = type === "all" || entry.family.type === type;
      const matchesQuery =
        needle === "" ||
        entry.family.name.toLowerCase().includes(needle) ||
        entry.family.id.includes(needle) ||
        (entry.family.collection ?? "").toLowerCase().includes(needle);
      return matchesType && matchesQuery;
    });
  }, [progress, query, type]);
  const categories = useMemo(() => groupMinionFamilies(filtered), [filtered]);
  const requestedId = searchParams.get("minion");
  const selected = progress.find((entry) => entry.family.id === requestedId) ?? null;
  const selectedOpenTier = selected ? openTiers[selected.family.id] ?? null : null;
  const plan = useMemo(
    () => (selected ? planMinionFamily(selected, items, holdings.inventory) : null),
    [selected, items, holdings.inventory]
  );

  const selectFamily = useCallback(
    (id: string) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        if (next.get("minion") === id) next.delete("minion");
        else next.set("minion", id);
        return next;
      }, { replace: true });
    },
    [setSearchParams]
  );
  const clearFamily = useCallback(() => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("minion");
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const toggleTier = useCallback((familyId: string, tier: number): void => {
    setOpenTiers((current) => ({
      ...current,
      [familyId]: current[familyId] === tier ? null : tier,
    }));
  }, []);
  const categoryOpen = useCallback(
    (id: string) =>
      openCategories[id] ??
      categories.some((category) => category.id === id && category.entries.some((entry) => entry.family.id === requestedId)),
    [categories, openCategories, requestedId]
  );
  const toggleCategory = useCallback((id: string) => {
    setOpenCategories((current) => {
      const selectedCategoryOpen = categories.some(
        (category) => category.id === id && category.entries.some((entry) => entry.family.id === requestedId)
      );
      return { ...current, [id]: !(current[id] ?? selectedCategoryOpen) };
    });
  }, [categories, requestedId]);
  const anyCategoryOpen = categories.some((category) => categoryOpen(category.id));
  const setCategoriesOpen = useCallback((open: boolean) => {
    setOpenCategories(Object.fromEntries(categories.map((category) => [category.id, open])));
  }, [categories]);

  const selectedDetail = selected ? (
    <div
      id="minion-detail-panel"
      role="region"
      aria-labelledby="minion-detail-heading"
      className={MINION_DETAIL_SHEET_CLASS + " min-h-[20rem]"}
      data-minion-detail-sheet
      data-minion-detail-family={selected.family.id}
    >
      <div className="flex min-w-0 items-start gap-2.5 border-b border-white/8 px-3 py-3" data-minion-detail-header>
        <ItemIcon name={selected.family.wikiTitle} id={selected.family.id + "_MINION"} size={40} fallback="blank" />
        <div className="min-w-0 flex-1">
          <h3 id="minion-detail-heading" className="truncate text-[14px] font-semibold text-slate-100">{selected.family.name}</h3>
          <p className="mt-0.5 truncate text-[10px] text-slate-500">
            {selected.family.type}{selected.family.collection ? " / " + selected.family.collection : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <WikiLink name={selected.family.wikiTitle} className={BTN_QUIET} nameClassName="text-[11px]">
            <span>Wiki</span>
            <ExternalLink className="h-3 w-3" aria-hidden />
          </WikiLink>
          <button type="button" className={BTN_QUIET + " " + FOCUS} onClick={clearFamily} aria-label="Close minion detail" title="Close detail">
            <X className="h-3 w-3" aria-hidden />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 border-b border-white/8 bg-black/10 px-3 py-2" data-minion-detail-metrics>
        <Tag title="Current crafted tier from the selected profile.">{selected.currentTier === null ? "Tier unavailable" : "Tier " + selected.currentTier + "/" + selected.maxTier}</Tag>
        <Tag accent={selected.completion === "complete"}>{completionText(selected)}</Tag>
      </div>
      <FamilyDetail
        entry={selected}
        plan={plan}
        items={items}
        holdingsKnown={holdings.known}
        openTier={selectedOpenTier}
        onToggleTier={(tier) => toggleTier(selected.family.id, tier)}
      />
    </div>
  ) : null;

  return (
    <section className={PANEL} aria-labelledby="profile-minions-title" data-minion-category-board>
      <span id="profile-minions-title" className="sr-only">Minions</span>
      <SectionHead
        title="Minions"
        right={<span className={LABEL}>{summary.totalFamilies} current families</span>}
      />
      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-1.5" data-minion-progress>
          <Tag>Progress {summary.craftedFamilies === null ? "-" : String(summary.craftedFamilies) + "/" + summary.totalFamilies}</Tag>
          <Tag>Complete {summary.completedFamilies === null ? "-" : String(summary.completedFamilies) + "/" + summary.totalFamilies}</Tag>
          <Tag title={holdings.labels.join(", ")}>Holdings {holdings.labels.length > 0 ? holdings.labels.map(displaySource).join(" | ") : "Unavailable"}</Tag>
        </div>


        {profileStatus === "loading" && <span className="text-[10px] text-slate-500" role="status">Profile updating</span>}
        {profileStatus === "needsKey" && <a className="text-[10px] text-amber-200 underline underline-offset-2" href="/settings#hypixel" role="status">Connect your profile in Settings</a>}
        {profileStatus === "error" && (
          <span className="flex items-center gap-1.5 text-[10px] text-amber-200" role="alert">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Profile data stale
          </span>
        )}
        {catalogueProfile?.available && catalogueProfile.unmapped.length > 0 && (
          <details className="w-fit max-w-full rounded-full border border-amber-400/35 bg-amber-400/5 text-[10px] text-amber-200" data-minion-partial-warning>
            <summary className={`${FOCUS} flex cursor-pointer list-none items-center gap-1.5 rounded-full px-2.5 py-1 [&::-webkit-details-marker]:hidden`}>
              <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
              Partial catalogue / {catalogueProfile.unmapped.length}
            </summary>
            <p className="max-w-sm px-2.5 pb-2 text-[10px] leading-relaxed text-amber-100/80">
              Some profile entries are newer than the bundled catalogue; progress may understate them.
            </p>
          </details>
        )}

        <div className="flex flex-wrap items-center gap-2" data-minion-filters>
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" aria-hidden />
            <label htmlFor="minion-family-search" className="sr-only">Search minion families</label>
            <input
              id="minion-family-search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search families"
              className={`${INPUT} w-full pl-8`}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <label className="sr-only" htmlFor="minion-type-filter">Filter minion type</label>
          <select id="minion-type-filter" value={type} onChange={(event) => setType(event.currentTarget.value)} className={`${INPUT} w-full sm:w-auto`}>
            {types.map((option) => <option key={option} value={option}>{option === "all" ? "All types" : option}</option>)}
          </select>
          <span className={`${NUM} text-[10px] text-slate-500`}>{filtered.length}/{progress.length}</span>
          <BoardControl
            anyOpen={anyCategoryOpen}
            onCollapseAll={() => setCategoriesOpen(false)}
            onExpandAll={() => setCategoriesOpen(true)}
          />
        </div>

        <div className={MINION_CATEGORY_BOARD_CLASS} data-minion-category-grid>
          <CardBoard
            items={categories}
            keyOf={(category) => category.id}
            render={(category) => (
              <MinionCategoryCard
                category={category}
                open={categoryOpen(category.id)}
                selectedId={selected?.family.id ?? null}
                detail={selected && category.entries.some((entry) => entry.family.id === selected.family.id) ? selectedDetail : null}
                onToggle={() => toggleCategory(category.id)}
                onSelect={selectFamily}
              />
            )}
          />
        </div>

        <a
          href={MINION_CATALOGUE_PROVENANCE.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${FOCUS} inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 hover:underline`}
          data-minion-catalogue-source
        >
          Wiki catalogue source <ExternalLink className="h-2.5 w-2.5" aria-hidden />
        </a>
      </div>
    </section>
  );
};

export default MinionsSection;
