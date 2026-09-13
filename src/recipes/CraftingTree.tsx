import React, { useId, useState } from "react";
import { ChevronDown, Hammer, Minus, Package, Plus } from "lucide-react";
import type { AllocationNode } from "../items/craftingAllocation";
import type { OwnedIndex } from "../inventory";
import { holdingLocations } from "./holdings";
import { ProfileItemTile } from "../profile-view/profile-sections/ProfileItemTile";
import { WikiLink } from "../ui/WikiLink";
import { ItemIcon } from "../ui/ItemIcon";
import { ItemTooltip } from "../ui/ItemTooltip";
import "./crafting-tree.css";

const CraftingAllocation: React.FC<{ node: AllocationNode; owned?: OwnedIndex; output?: boolean }> = ({ node, owned, output = false }) => {
  const locations = (node.allocatedByAlternative ?? [{ id: node.id, name: node.name, allocated: node.allocated }])
    .filter(part => part.allocated > 0).map(part => {
      const location = holdingLocations(owned?.get(part.id));
      return location && `${part.name !== node.name ? `${part.name}: ` : ""}${location}`;
    }).filter(Boolean).join(" · ");
  return <div className="recipe-flow-allocation">
    {node.allocated > 0 && <span><Package size={12} aria-hidden />Storage <b>{node.allocated.toLocaleString()}</b></span>}
    {(node.fromCrafting ?? 0) > 0 && <span><Hammer size={12} aria-hidden />Earlier crafts <b>{node.fromCrafting!.toLocaleString()}</b></span>}
    {node.children.length > 0 ? !output && <span><Hammer size={12} aria-hidden />Craft <b>{node.craftOutput.toLocaleString()}</b></span>
      : node.remaining > 0 && <span>Gather <b>{node.remaining.toLocaleString()}</b>{!node.inventoryKnown && " · holdings unknown"}</span>}
    {locations && <small>Available: {locations}</small>}
    {node.blocked && <small>Recipe expansion unavailable</small>}
  </div>;
};

const CraftingBranch: React.FC<{ node: AllocationNode; owned?: OwnedIndex; root?: boolean }> = ({ node, owned, root = false }) => {
  const [expanded, setExpanded] = useState(true);
  const [openInput, setOpenInput] = useState<number | null>(null);
  const inputsId = useId();
  const branch = node.children.length > 0;
  return <div className={`recipe-flow-branch${branch ? " has-inputs" : ""}`}>
    <div className="recipe-flow-output">
      <ProfileItemTile id={node.id} name={node.name} iconName={node.wikiTitle ?? node.name} tier={node.tier}
        count={node.craftOutput || node.requested} iconSize={36} />
      <div>
        {!root && <WikiLink name={node.name} className={node.tier ? `text-rarity-${node.tier.toLowerCase().replace(/_/g, "-")}` : undefined} />}
        {branch && <span className="recipe-flow-crafts"><Hammer size={13} aria-hidden />{node.craftCount.toLocaleString()} {node.craftCount === 1 ? "craft" : "crafts"}</span>}
        <CraftingAllocation node={node} owned={owned} output />
      </div>
    </div>
    {branch && <div className={`recipe-flow-inputs${expanded ? "" : " is-collapsed"}`}>
      <button type="button" className="recipe-flow-toggle" aria-expanded={expanded} aria-controls={inputsId}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${node.name} ingredients`} onClick={() => setExpanded(value => !value)}>{expanded ? <Minus size={13} /> : <Plus size={13} />}</button>
      <div className="recipe-flow-batch" id={inputsId}>
        {expanded ? <>
          <div className="recipe-flow-equation" data-input-count={node.children.length} role="list" aria-label={`Ingredients for ${node.name}`}>
            {node.children.map((child, index) => <div className="recipe-flow-input" role="listitem" key={`${child.id}:${index}`}>
              <WikiLink name={child.name} className={child.tier ? `text-rarity-${child.tier.toLowerCase().replace(/_/g, "-")}` : undefined} />
              <ProfileItemTile id={child.id} name={child.name} iconName={child.wikiTitle ?? child.name} tier={child.tier} count={child.requested} iconSize={36}
                ariaLabel={`${child.name}, ${child.requested.toLocaleString()} required`}
                onClick={child.children.length ? () => setOpenInput(value => value === index ? null : index) : undefined} />
              {child.children.length > 0 && <button type="button" className="recipe-flow-disclosure" aria-expanded={openInput === index} aria-label={`${openInput === index ? "Collapse" : "Expand"} ${child.name} recipe`} onClick={() => setOpenInput(value => value === index ? null : index)}><ChevronDown size={12} aria-hidden /></button>}
            </div>)}
          </div>
          <div className="recipe-flow-sources">
            {node.children.map((child, index) => <div key={`${child.id}:${index}`}>
              <span className="recipe-flow-source-name"><ItemIcon id={child.id} name={child.wikiTitle ?? child.name} size={18} /><strong className={child.tier ? `text-rarity-${child.tier.toLowerCase().replace(/_/g, "-")}` : undefined}>{child.name}</strong></span>
              <CraftingAllocation node={child} owned={owned} />
            </div>)}
          </div>
          {openInput !== null && node.children[openInput]?.children.length > 0 && <div className="recipe-flow-nested"><CraftingBranch node={node.children[openInput]} owned={owned} /></div>}
        </> : <div className="recipe-flow-collapsed">{node.children.map((child,index) => <span key={`${child.id}:${index}`}><ItemIcon id={child.id} name={child.wikiTitle ?? child.name} size={18} /><span className={child.tier ? `text-rarity-${child.tier.toLowerCase().replace(/_/g, "-")}` : undefined}>{child.name}</span> ({child.requested.toLocaleString()})</span>)}</div>}
      </div>
    </div>}
  </div>;
};

/** Dependency branches join only at the item they actually make. */
export const CraftingTree: React.FC<{ roots: readonly AllocationNode[]; owned?: OwnedIndex; title?: string }> = ({ roots, owned, title = "Crafting tree" }) => (
  <section className="recipe-crafting-tree" aria-label={title}>
    <div className="recipes-support-heading"><div><h2>{title}</h2></div></div>
    <div className="recipe-flow-scroll" tabIndex={0} role="region" aria-label="Ingredient branches">
      {roots.map((root, index) => (
        <details open className="recipe-flow-goal" key={`${root.id}:${index}`} aria-label={`Crafting tree for ${root.name}`}>
          <summary className="recipe-flow-heading">
            <ItemTooltip id={root.id} name={root.name} tier={root.tier} interactive wrapperTag="span" wrapperClassName="inline-flex min-w-0">
              <span className="inline-flex min-w-0 items-center gap-1.5"><ItemIcon id={root.id} name={root.wikiTitle ?? root.name} size={20} /><span className={root.tier ? `text-rarity-${root.tier.toLowerCase().replace(/_/g, "-")}` : undefined}>{root.name}</span></span>
            </ItemTooltip>
            <span className="recipe-flow-heading-count">({root.requested.toLocaleString()})</span><ChevronDown size={14} aria-hidden />
          </summary>
          <CraftingBranch node={root} owned={owned} root />
        </details>
      ))}
    </div>
  </section>
);
