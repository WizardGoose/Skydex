import { RecipeLink } from "../../ui/RecipeLink";
import { ItemTooltip } from "../../ui/ItemTooltip";
import { slug } from "../../items/wikiCrafting";
import { minionItemName } from "../../recipes/minionItems";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { ItemIndex } from "../../items/useItemData";
import type { OwnedIndex } from "../../inventory";
import type { ParsedItems } from "../../networth/profileNetworth";
import type { NetworthStatus } from "../../networth/useNetworth";
import { groupMinionFamilies } from "../../profile/minionCategoryModel";
import {
  minionProgress,
  minionProgressSummary,
  type CraftedGeneratorProfile,
  type MinionFamilyProgress,
} from "../../profile/minions";
import { ItemIcon } from "../../ui/ItemIcon";
import {
  minionsPreviewState,
  recognizedCraftedGeneratorIds,
  type MinionsPreviewState,
} from "./profileAuxiliaryPreviewModels";
import { closeMinionDisclosure, toggleMinionDisclosure } from "./minionDisclosureState";
import { buildMinionTierLadder, minionRemainingMaterialTotals } from "./minionTierLadder";
import "./minions-inventory-networth.css";
import "./minions-preview.css";

export interface MinionsPreviewProps {
  profile: CraftedGeneratorProfile | null;
  profileStatus: NetworthStatus;
  items: ItemIndex;
  owned: OwnedIndex;
  parsed: ParsedItems | null;
  inventoryShared: boolean;
  ironman: boolean;
}

const MinionsStatePanel: React.FC<{ state: Exclude<MinionsPreviewState, "populated" | "partial"> }> = ({ state }) => {
  const copy: Record<typeof state, string> = {
    loading: "Reading crafted minion tiers.",
    private: "Connect your Hypixel API key in Settings to load crafted minions.",
    unavailable: "Crafted minion tiers were not shared for this profile.",
    empty: "No crafted minion tiers were reported.",
    error: "Crafted minion tiers could not be loaded.",
  };
  return (
    <section className="profile-aux-state profile-glass" aria-labelledby="profile-minions-state-title" data-profile-section-state={state}>
      <h2 id="profile-minions-state-title">Minions</h2>
      {state === "loading" ? (
        <div className="profile-aux-skeleton" aria-label={copy[state]} role="status"><i /><i /><i /></div>
      ) : (
        <p role={state === "error" ? "alert" : "status"}>{copy[state]}</p>
      )}
    </section>
  );
};

const progressPercent = (entry: MinionFamilyProgress): number => (
  entry.currentTier === null || entry.maxTier <= 0
    ? 0
    : Math.max(0, Math.min(100, (entry.currentTier / entry.maxTier) * 100))
);

const columnCountForWorkspace = (width: number): number => (
  width <= 420 ? 1 : 2
);

const initialColumnCount = (): number => {
  if (typeof window === "undefined") return 2;
  return window.innerWidth <= 420 ? 1 : 2;
};

const partitionMinionColumns = (
  entries: readonly MinionFamilyProgress[],
  requestedCount: number,
): MinionFamilyProgress[][] => {
  const count = Math.min(Math.max(1, requestedCount), Math.max(1, entries.length));
  const columns = Array.from({ length: count }, () => [] as MinionFamilyProgress[]);
  entries.forEach((entry, index) => columns[index % count].push(entry));
  return columns;
};

const MinionFamilyCell: React.FC<{
  entry: MinionFamilyProgress;
  selected: boolean;
  onSelect: () => void;
}> = ({ entry, selected, onSelect }) => {
  const progress = progressPercent(entry);
  return (
    <button
      type="button"
      className="profile-minion-family"
      data-minion-family={entry.family.id}
      aria-pressed={selected}
      aria-expanded={selected}
      onClick={onSelect}
    >
      <span aria-hidden><ItemIcon name={entry.family.wikiTitle} id={`${entry.family.id}_MINION`} size={30} fallback="blank" /></span>
      <span className="profile-minion-family-copy">
        <strong>{entry.family.name}</strong>
        <small>{entry.currentTier === null ? "Unavailable" : entry.currentTier === 0 ? "Not crafted" : `Tier ${entry.currentTier}/${entry.maxTier}`}</small>
        {entry.currentTier !== null && (
          <span
            className="profile-skill-progress"
            role="progressbar"
            aria-label={`${entry.family.name} crafted tier progress`}
            aria-valuemin={0}
            aria-valuemax={entry.maxTier}
            aria-valuenow={entry.currentTier}
          >
            <i style={{ width: `${progress}%` }} />
          </span>
        )}
      </span>
    </button>
  );
};

export const SelectedMinionDetail: React.FC<{
  entry: MinionFamilyProgress;
  onClose: () => void;
}> = ({ entry, onClose }) => {
  const tiers = useMemo(
    () => buildMinionTierLadder(entry).filter((tier) => tier.state !== "crafted"),
    [entry],
  );
  const totals = useMemo(() => minionRemainingMaterialTotals(tiers), [tiers]);
  const incompleteTotal = tiers.some((tier) => tier.requirementState === "unavailable");
  return (
    <section id={`profile-minion-detail-${entry.family.id}`} className="profile-minion-detail profile-minion-tier-disclosure" aria-label={`${entry.family.name} missing tiers`} data-minion-detail={entry.family.id}>
      <header>
        <small>Missing tiers</small>
        <strong>{entry.tiersRemaining === null ? "Unavailable" : entry.tiersRemaining === 0 ? "Complete" : entry.tiersRemaining}</strong>
        <button type="button" onClick={onClose} aria-label="Close selected minion detail"><X aria-hidden /></button>
      </header>
      <div className="profile-minion-tier-summary">
        <span>{entry.currentTier === null ? "Crafted tier unavailable" : `Crafted through tier ${entry.currentTier}`}</span>
        <strong>{entry.maxTier.toLocaleString()} catalogue tiers</strong>
      </div>
      <div className="profile-minion-tier-ladder" data-minion-tier-list>
        {tiers.length === 0 ? (
          <p className="profile-minion-tier-complete">Every bundled tier is already crafted.</p>
        ) : tiers.map((tier) => (
            <article
              className={`profile-minion-tier-row profile-minion-tier-row--${tier.state}`}
              data-minion-tier-row
              data-minion-tier={tier.tier}
              data-minion-tier-state={tier.state}
              data-minion-tier-requirement-state={tier.requirementState}
              key={tier.tier}
            >
              <span className="profile-minion-tier-marker profile-number" aria-label={`Tier ${tier.tier}`}>{tier.tier}</span>
              <div className="profile-minion-tier-copy">
                <RecipeLink id={slug(minionItemName(entry.family, tier.tier))} name={minionItemName(entry.family, tier.tier)} className="text-[11px] font-semibold text-slate-200" />
                {tier.requirementState === "known" ? (
                  <div className="profile-minion-tier-materials" aria-label={`Tier ${tier.tier} incremental resource requirement`}>
                    {tier.materials.map((material, index) => (
                      <span key={`${material.name}-${index}`}>
                        <span aria-hidden><ItemIcon name={material.name} size={18} fallback="blank" /></span>
                        <ItemTooltip id={slug(material.name)} name={material.name} count={material.amount} disabled={material.name.toLowerCase() === "coin"} wrapperTag="span"><span>{material.name}</span></ItemTooltip>
                        <b className="profile-number">×{material.amount.toLocaleString()}</b>
                      </span>
                    ))}
                  </div>
                ) : (
                  <small>Requirement unavailable in the bundled catalogue</small>
                )}
              </div>
            </article>
          ))}
      </div>
      {(totals.length > 0 || incompleteTotal) && (
        <footer className="profile-minion-material-total" data-minion-material-total>
          <div>
            <strong>Remaining material total</strong>
            <small>{incompleteTotal ? "Known tiers only" : `${tiers.length.toLocaleString()} remaining tier${tiers.length === 1 ? "" : "s"}`}</small>
          </div>
          {totals.length > 0 && (
            <div className="profile-minion-material-total-grid">
              {totals.map((material) => (
                <span key={`${material.kind ?? "material"}:${material.name}`} title={`Used in tier${material.tiers.length === 1 ? "" : "s"} ${material.tiers.join(", ")}`}>
                  <span aria-hidden><ItemIcon name={material.name} size={20} fallback="blank" /></span>
                  <ItemTooltip id={slug(material.name)} name={material.name} count={material.amount} disabled={material.name.toLowerCase() === "coin"} wrapperTag="span"><span>{material.name}</span></ItemTooltip>
                  <b className="profile-number">×{material.amount.toLocaleString()}</b>
                </span>
              ))}
            </div>
          )}
          {incompleteTotal && <p>Some bundled tier requirements are unavailable, so this total is not presented as complete.</p>}
        </footer>
      )}
    </section>
  );
};

export const MinionsPreview: React.FC<MinionsPreviewProps> = (props) => {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [openFamilyIds, setOpenFamilyIds] = useState<Set<string>>(() => new Set());
  const state = minionsPreviewState(props.profile, props.profileStatus);
  const categoryGridRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(initialColumnCount);

  useEffect(() => {
    const anchor = categoryGridRef.current;
    if (!anchor) return;
    const workspace = anchor.closest<HTMLElement>(".profile-workspace") ?? anchor;
    const measure = () => setColumnCount(columnCountForWorkspace(workspace.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [state]);

  if (state !== "populated" && state !== "partial") return <MinionsStatePanel state={state} />;
  if (!props.profile) return <MinionsStatePanel state="unavailable" />;

  const profile = props.profile;
  const progress = minionProgress(profile);
  const summary = minionProgressSummary(progress);
  const craftedFamilies = summary.craftedFamilies ?? 0;
  const familyProgressPercent = summary.totalFamilies > 0
    ? Math.min(100, Math.max(0, (craftedFamilies / summary.totalFamilies) * 100))
    : 0;
  const recognized = recognizedCraftedGeneratorIds(profile);
  const catalogueTiers = progress.reduce((sum, entry) => sum + entry.maxTier, 0);
  const types = ["all", ...new Set(progress.map((entry) => entry.family.type))];
  const needle = query.trim().toLowerCase();
  const filtered = progress.filter((entry) => (
    (type === "all" || entry.family.type === type)
    && (
      needle === ""
      || entry.family.name.toLowerCase().includes(needle)
      || entry.family.id.includes(needle)
      || entry.family.collection?.toLowerCase().includes(needle) === true
    )
  ));
  const categories = groupMinionFamilies(filtered);

  return (
    <section className="profile-aux-preview profile-minions-preview" aria-labelledby="profile-minions-title" data-profile-section-state={state}>
      <header className="profile-aux-head profile-glass">
        <div><span>Minions</span><h2 id="profile-minions-title">Crafted progress</h2></div>
        <div className="profile-minion-head-progress">
          <strong>{craftedFamilies.toLocaleString()} / {progress.length.toLocaleString()} families</strong>
          <span
            className="profile-skill-progress"
            role="progressbar"
            aria-label="Crafted Minion family progress"
            aria-valuemin={0}
            aria-valuemax={summary.totalFamilies}
            aria-valuenow={craftedFamilies}
          >
            <i style={{ width: `${familyProgressPercent}%` }} />
          </span>
        </div>
      </header>
      {state === "partial" && (
        <p className="profile-aux-notice" role="status">
          {profile.unmapped.length > 0
            ? `${profile.unmapped.length.toLocaleString()} crafted generator IDs are newer than the bundled catalogue. Recognized progress may understate the profile.`
            : "The latest profile refresh failed. Visible crafted progress uses the last readable profile."}
        </p>
      )}
      <div className="profile-minion-metrics" aria-label="Crafted minion progress">
        <article className="profile-glass">
          <small>Recognized crafted IDs</small>
          <strong className="profile-number">{recognized.length.toLocaleString()}</strong>
          <span>of {catalogueTiers.toLocaleString()} bundled tiers</span>
        </article>
        <article className="profile-glass">
          <small>Family coverage</small>
          <strong className="profile-number">{summary.craftedFamilies ?? "-"}/{summary.totalFamilies}</strong>
          <span>with a recorded tier</span>
        </article>
        <article className="profile-glass">
          <small>Maxed families</small>
          <strong className="profile-number">{summary.completedFamilies ?? "-"}</strong>
          <span>at bundled maximum</span>
        </article>
      </div>

      <section className="profile-minion-matrix-shell profile-glass" aria-labelledby="profile-minion-matrix-title">
        <header>
          <div><small>Family matrix</small><h3 id="profile-minion-matrix-title">Crafted tier by family</h3></div>
          <span className="profile-number">{filtered.length}/{progress.length}</span>
        </header>
        <div className="profile-minion-filters">
          <label className="profile-aux-search">
            <span className="sr-only">Search minion families</span>
            <Search aria-hidden />
            <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search minion families" autoComplete="off" />
          </label>
          <label>
            <span className="sr-only">Filter minion type</span>
            <select value={type} onChange={(event) => setType(event.currentTarget.value)}>
              {types.map((option) => <option key={option} value={option}>{option === "all" ? "All types" : option}</option>)}
            </select>
          </label>
        </div>
        <div className="profile-minion-categories" ref={categoryGridRef}>
          {categories.map((category) => {
            const columns = partitionMinionColumns(category.entries, columnCount);
            return (
              <section key={category.id} aria-labelledby={`profile-minion-category-${category.id.toLowerCase()}`}>
                <header>
                  <h4 id={`profile-minion-category-${category.id.toLowerCase()}`}>{category.id}</h4>
                  <span className="profile-number">{category.entries.length}</span>
                </header>
                <div className="profile-minion-matrix" data-minion-matrix={category.id} data-minion-column-count={columns.length}>
                  {columns.map((entries, columnIndex) => (
                    <div className="profile-minion-column" data-minion-column={`${category.id}-${columnIndex + 1}`} key={`${category.id}-${columnIndex}`}>
                      {entries.map((entry) => {
                        const selected = openFamilyIds.has(entry.family.id);
                        return (
                          <div className={`profile-minion-family-stack${selected ? " is-expanded" : ""}`} key={entry.family.id}>
                            <MinionFamilyCell
                              entry={entry}
                              selected={selected}
                              onSelect={() => setOpenFamilyIds((current) => toggleMinionDisclosure(current, entry.family.id))}
                            />
                            {selected && (
                              <SelectedMinionDetail
                                entry={entry}
                                onClose={() => setOpenFamilyIds((current) => closeMinionDisclosure(current, entry.family.id))}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          {filtered.length === 0 && <p className="profile-aux-empty">No minion families match this search.</p>}
        </div>
      </section>
    </section>
  );
};

export default MinionsPreview;
