import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import type { OwnedIndex } from "../inventory";
import type { MuseumPreviewModel } from "../profile/riftMuseumDungeons";
import { ProfileItemTile } from "../profile-view/profile-sections/ProfileItemTile";
import { ProfileProgressionFilters, type ProfileProgressionFilterGroup } from "../profile-view/profile-sections/ProfileProgressionFilters";
import { WikiLink } from "../ui/WikiLink";
import { ItemIcon } from "../ui/ItemIcon";
import { ItemTooltip } from "../ui/ItemTooltip";
import { FOCUS, rarityTileClass } from "../ui/kit";
import type { RecipeBookEntry } from "./progressionModel";
import type { CraftingListGoal } from "./craftingQueue";
import { museumRecipeRows } from "./museumPlanning";
import "./recipes-museum.css";

export const RecipesMuseumCollection: React.FC<{
  model: MuseumPreviewModel;
  recipes: readonly RecipeBookEntry[];
  owned: OwnedIndex;
  onPlan: (goals: readonly CraftingListGoal[]) => void;
  onSelect: (id: string) => void;
}> = ({ model, recipes, owned, onPlan, onSelect }) => {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("missing");
  const [visibleLimit, setVisibleLimit] = useState(36);
  const listRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query).trim().toLowerCase();
  useEffect(() => { setVisibleLimit(36); listRef.current?.scrollTo({ top: 0 }); }, [deferredQuery, status]);
  const rows = useMemo(() => museumRecipeRows(model.collectionUnits ?? [], recipes, owned), [model.collectionUnits, recipes, owned]);
  const searched = rows.filter(row => `${row.unit.label} ${row.pieces.map(piece => piece.item.name).join(" ")}`.toLowerCase().includes(deferredQuery));
  const matchesStatus = (row: typeof rows[number], value: string) => value === "all"
    || value === "missing" && row.unit.state === "missing"
    || value === "donated" && row.unit.state !== "missing"
    || value === "ready" && row.unit.state === "missing" && row.heldPieces === row.pieces.length;
  const visible = searched.filter(row => matchesStatus(row, status)).sort((a, b) =>
    Number(b.unit.state === "missing" && b.heldPieces === b.pieces.length) - Number(a.unit.state === "missing" && a.heldPieces === a.pieces.length)
    || a.unit.label.localeCompare(b.unit.label));
  const groups: ProfileProgressionFilterGroup[] = [{ legend: "Donation", options: [
    ["missing", "Missing"], ["ready", "Ready to donate"], ["donated", "Donated"],
  ].map(([id, label]) => ({ id, label, count: searched.filter(row => matchesStatus(row, id)).length,
    selected: status === id, disabled: false, onToggle: () => setStatus(value => value === id ? "all" : id) })) }];
  return <section className="recipes-museum profile-glass" aria-labelledby="recipes-museum-title">
    <header className="recipes-museum-heading"><h2 id="recipes-museum-title">Museum collection</h2>
      {model.completion && <span>{model.completion.completed.toLocaleString()} / {model.completion.total.toLocaleString()} donated</span>}
    </header>
    {model.collectionUnits ? <>
      <div className="recipes-museum-filters"><ProfileProgressionFilters query={query} onQueryChange={setQuery}
        searchLabel="Search museum collection" placeholder="Find a donation" groups={groups} activeCount={status === "all" ? 0 : 1}
        resultCount={visible.length} totalCount={rows.length} onClear={() => { setQuery(""); setStatus("all"); }} /></div>
      <div ref={listRef} className="recipes-museum-list" role="region" aria-label="Museum donations" tabIndex={0} onScroll={event => {
        const node = event.currentTarget;
        if (node.scrollHeight - node.scrollTop - node.clientHeight < 160) setVisibleLimit(limit => Math.min(visible.length, limit + 36));
      }}>
        {visible.slice(0, visibleLimit).map(({ unit, pieces, heldPieces, goals }) => <details className="recipes-museum-unit" key={unit.key}>
          <summary><ItemTooltip id={pieces[0].item.id} name={pieces[0].item.name} tier={pieces[0].item.tier} interactive wrapperTag="span" wrapperClassName="recipes-museum-art">
            <span className={`profile-item-tile ${rarityTileClass(pieces[0].item.tier)}`}><ItemIcon id={pieces[0].item.id} name={pieces[0].item.name} size={28} /></span>
            </ItemTooltip>
            <span className="recipes-museum-copy"><strong className={unit.kind === "item" && pieces[0].item.tier ? `text-rarity-${pieces[0].item.tier.toLowerCase().replace(/_/g, "-")}` : undefined}>{unit.label}</strong>
              <small>{unit.state !== "missing" ? unit.acceptedBy ? `Credited through ${unit.acceptedBy}` : unit.state === "borrowed" ? "Donated · withdrawn" : "Donated"
                : heldPieces === pieces.length ? "Ready to donate" : !owned.has ? "Holdings unavailable" : unit.kind === "item" ? "Not donated" : `${heldPieces} / ${pieces.length} pieces found`}</small></span><ChevronDown size={14} aria-hidden />
          </summary>
          <div className="recipes-museum-pieces">
            {pieces.map(({ item, held, location, recipe }) => <div className="recipes-museum-piece" key={item.id}>
              <ProfileItemTile id={item.id} name={item.name} tier={item.tier} iconSize={28} onClick={recipe ? () => onSelect(recipe.id) : undefined} />
              <span><WikiLink name={item.name} className={item.tier ? `text-rarity-${item.tier.toLowerCase().replace(/_/g, "-")}` : undefined} />
                <small>{location || (unit.acceptedBy ? `Credited through ${unit.acceptedBy}` : !owned.has ? "Holdings unavailable" : "Not found in captured storage")}</small></span>
              {recipe && !held && unit.state === "missing" && <button className={FOCUS} type="button" aria-label={`Plan ${item.name}`} onClick={() => onPlan([{id: recipe.id, method: recipe.preferredMethod.kind, quantity: 1}])}><Plus size={15} aria-hidden /></button>}
            </div>)}
            {goals.length > 1 && <button className={`recipes-museum-plan ${FOCUS}`} type="button" onClick={() => onPlan(goals)}><Plus size={14} aria-hidden />Plan missing pieces</button>}
          </div>
        </details>)}
        {visible.length === 0 && <p className="recipes-museum-empty">{status === "missing" && !query ? "Every donation is recorded." : "No donations match these filters."}</p>}
      </div>
    </> : <p className="recipes-museum-empty">{model.state === "private" ? "Museum data is private for this profile." : model.state === "loading" ? "Loading museum collection…" : "Museum collection data is unavailable for this profile."}</p>}
  </section>;
};
