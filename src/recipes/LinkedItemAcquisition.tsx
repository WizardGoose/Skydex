import React from "react";
import type { Item } from "../items/useItemData";
import type { AcquisitionRoute } from "./acquisition";
import { AlternativeAcquisitionRoutes } from "./AcquisitionRoutes";
import { findMinionTier, minionItemName } from "./minionItems";
import { minionTierMaterials } from "../profile-view/profile-sections/minionTierLadder";
import { ProfileItemTile } from "../profile-view/profile-sections/ProfileItemTile";
import { WikiLink } from "../ui/WikiLink";
import { RecipeLink } from "../ui/RecipeLink";

export const LinkedItemAcquisition: React.FC<{ id: string; item: Item; routes: readonly AcquisitionRoute[] }> = ({ id, item, routes }) => {
  const minion = findMinionTier(item.name);
  const materials = minion ? minionTierMaterials(minion.data) : [];
  const exchange = minion && (minion.data.npc || materials.some(material => material.name.toLowerCase() === "coin"));
  return <div className="recipes-item-panel">
    <header className="recipes-selected-recipe">
      <span className="recipes-selected-icon"><ProfileItemTile id={id} hypixelId={item.hypixelId} name={item.name} iconName={item.wikiTitle ?? item.name} tier={item.tier} iconSize={54} /></span>
      <div className="recipes-selected-copy">
        <span>{item.category ?? "SkyBlock item"}</span>
        <h2 id="recipes-planner-title">{item.name}</h2>
        <p>{exchange ? `NPC exchange${minion.data.npc ? ` · ${minion.data.npc}` : ""}` : "No crafting or Forge recipe is listed for this item."}</p>
        {exchange && <ul className="space-y-1 text-[12px] text-slate-300">
          {minion.tier > 1 && <li><RecipeLink name={minionItemName(minion.family, minion.tier - 1)}>{minionItemName(minion.family, minion.tier - 1)}</RecipeLink> ×1</li>}
          {materials.map(material => <li key={material.name}>{material.name.toLowerCase() === "coin" ? material.name : <RecipeLink name={material.name} quantity={material.amount}>{material.name}</RecipeLink>} ×{material.amount.toLocaleString()}</li>)}
        </ul>}
        <WikiLink name={item.wikiTitle ?? item.name} className="mt-2 text-[11px] text-slate-300">View on the wiki</WikiLink>
      </div>
    </header>
    {routes.length > 0 && <AlternativeAcquisitionRoutes itemKey={id} routes={routes} />}
  </div>;
};
