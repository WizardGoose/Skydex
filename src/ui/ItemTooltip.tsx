import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NUM, recombDisplayTier } from "./kit";
import {
  coinValue, itemLabel, normalTier, parseMinecraftText, positionItemTooltip, positionItemTooltipAtPointer, shouldInterceptTooltipClick, tooltipSurfacePointerEvents,
  prepareItemLore, romanLevel, stripMinecraftFormatting,
  type ItemTooltipExtra, type ItemTooltipMetadata, type ItemTooltipSection,
  type ItemTooltipProgress, type ItemTooltipRecipe,
  type ItemTooltipStat, type ItemTooltipTone, type ItemTooltipValue,
  type TooltipPoint, type TooltipPosition,
} from "./itemTooltipModel";
import { WikiLink } from "./WikiLink";
import { ItemIcon } from "./ItemIcon";
import { useHoverTooltips } from "./useHoverTooltips";
import { skyBlockStatPresentation } from "../utilities/utilityFunctions";
import { useItemLore } from "../items/useItemLore";
import { RecipeLink } from "./RecipeLink";
import { isPlayerItem } from "../items/itemAvailability";

export interface ItemTooltipContentProps {
  id?: string | null; name: string; count?: number; extra?: ItemTooltipExtra;
  tier?: string | null; tierIsDisplayed?: boolean; icon?: React.ReactNode; stats?: readonly ItemTooltipStat[];
  /** Exact game identity colour for entities that do not have an item rarity. */
  identityColor?: string | null;
  lore?: readonly string[] | null; sections?: readonly ItemTooltipSection[];
  interactionCues?: readonly React.ReactNode[]; soulbound?: boolean | string | null;
  obtained?: React.ReactNode; values?: readonly ItemTooltipValue[];
  progress?: ItemTooltipProgress | null;
  unitPrice?: number | null; priceLabel?: string; provenance?: React.ReactNode;
  metadata?: readonly ItemTooltipMetadata[]; skyDexSections?: readonly ItemTooltipSection[];
  recipe?: ItemTooltipRecipe | null;
  wikiName?: string | null;
  /** Disable for non-item entities that use item-shaped game detail. */
  recipeLink?: boolean;
  /** Internal interaction state: a pinned surface allows text selection and links. */
  surfacePinned?: boolean;
}
export interface ItemTooltipProps extends ItemTooltipContentProps {
  children: React.ReactElement; disabled?: boolean; interactive?: boolean;
  ariaLabel?: string; wrapperClassName?: string;
  wrapperTag?: "div" | "span";
}

const RARITY: Record<string,{text:string;band:string;color:string}> = {
  COMMON:{text:"text-rarity-common",band:"border-rarity-common/55",color:"var(--color-rarity-common)"},
  UNCOMMON:{text:"text-rarity-uncommon",band:"border-rarity-uncommon/55",color:"var(--color-rarity-uncommon)"},
  RARE:{text:"text-rarity-rare",band:"border-rarity-rare/55",color:"var(--color-rarity-rare)"},
  EPIC:{text:"text-rarity-epic",band:"border-rarity-epic/55",color:"var(--color-rarity-epic)"},
  LEGENDARY:{text:"text-rarity-legendary",band:"border-rarity-legendary/55",color:"var(--color-rarity-legendary)"},
  MYTHIC:{text:"text-rarity-mythic",band:"border-rarity-mythic/55",color:"var(--color-rarity-mythic)"},
  DIVINE:{text:"text-rarity-divine",band:"border-rarity-divine/55",color:"var(--color-rarity-divine)"},
  SPECIAL:{text:"text-rarity-special",band:"border-rarity-special/55",color:"var(--color-rarity-special)"},
  VERY_SPECIAL:{text:"text-rarity-very-special",band:"border-rarity-very-special/55",color:"var(--color-rarity-very-special)"},
  SUPREME:{text:"text-rarity-supreme",band:"border-rarity-supreme/55",color:"var(--color-rarity-supreme)"},
};
const TONE: Record<ItemTooltipTone,string> = { default:"text-slate-100",health:"text-stat-red",defense:"text-stat-green",mana:"text-stat-aqua",damage:"text-stat-red",fortune:"text-stat-gold",ability:"text-stat-gold",bonus:"text-stat-yellow",warning:"text-stat-red",muted:"text-slate-400" };
const ITEM_TOOLTIP_ACTIVATE_EVENT = "skydex:item-tooltip-activate";
interface ItemTooltipActivation { id:string; pointer?:TooltipPoint; handoff?:boolean; }
const present = (node: React.ReactNode) => node !== null && node !== undefined && node !== false && node !== "";
const TooltipLine: React.FC<{line:React.ReactNode}> = ({line}) => {
  if (typeof line !== "string") return <>{line}</>;
  return <>{line.split("\n").map((part, lineIndex) => <React.Fragment key={lineIndex}>{lineIndex > 0 && <br/>}{parseMinecraftText(part).map((segment, segmentIndex) => <span className={segment.className} key={segmentIndex}>{segment.text}</span>)}</React.Fragment>)}</>;
};
const Section: React.FC<{section:ItemTooltipSection}> = ({section}) => {
  const lines = section.lines.filter(present); if (!lines.length) return null;
  const titleClass = `text-[12px] font-semibold leading-snug ${TONE[section.tone ?? "default"]}`;
  const content = lines.map((line,i)=><div key={i} className="text-[11px] leading-[1.45] text-slate-300"><TooltipLine line={line}/></div>);
  return section.collapsible && present(section.title)
    ? <details className="sd-item-tooltip__section space-y-1"><summary className={`${titleClass} cursor-pointer`}>{section.title}</summary>{content}</details>
    : <div className="sd-item-tooltip__section space-y-0.5">{present(section.title) && <div className={titleClass}>{section.title}</div>}{content}</div>;
};
const Meta: React.FC<ItemTooltipMetadata> = ({label,value,mono=false,tone}) => <div className="sd-item-tooltip__meta-row grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-3"><span className="text-[10px] font-medium text-slate-500">{label}</span><span className={`min-w-0 break-words text-right text-[10px] leading-snug ${tone ? TONE[tone] : "text-slate-300"} ${mono ? NUM : ""}`}>{value}</span></div>;
const Recipe: React.FC<{recipe:ItemTooltipRecipe}> = ({recipe}) => (
  <div className="sd-item-tooltip__section space-y-1.5" aria-label="Crafting recipe">
    <div className="flex items-baseline justify-between gap-3 text-[12px] font-semibold leading-snug text-slate-100">
      <span>Recipe</span>
      {typeof recipe.yields === "number" && recipe.yields > 1 && (
        <span className={`text-[10px] font-medium text-slate-400 ${NUM}`}>Makes {recipe.yields.toLocaleString()}</span>
      )}
    </div>
    {recipe.pending ? (
      <div className="text-[11px] text-slate-400">Loading ingredients…</div>
    ) : recipe.ingredients.length > 0 ? (
      <div className="grid grid-cols-1 gap-x-3 gap-y-1 min-[420px]:grid-cols-2">
        {recipe.ingredients.map((ingredient, index) => (
          <div key={`${ingredient.id ?? ingredient.name}-${index}`} className="flex min-w-0 items-center gap-1.5">
            <ItemIcon name={ingredient.name} id={ingredient.id ?? undefined} size={18} />
            <span className="min-w-0 flex-1 leading-tight">
              <RecipeLink id={ingredient.id} name={ingredient.name} quantity={ingredient.qty} className="block truncate text-[10px] text-slate-300">{ingredient.name}</RecipeLink>
              {(ingredient.alternatives?.length ?? 0) > 0 && (
                <span className="block truncate text-[9px] text-slate-500" title={ingredient.alternatives?.map((alternative) => alternative.name).join(", ")}>
                  or {ingredient.alternatives?.map((alternative) => alternative.name).join(", ")}
                </span>
              )}
            </span>
            <span className={`shrink-0 text-[10px] text-slate-200 ${NUM}`}>×{ingredient.qty.toLocaleString()}</span>
          </div>
        ))}
      </div>
    ) : recipe.unavailable ? (
      <div className="text-[11px] text-slate-400">Ingredients unavailable.</div>
    ) : null}
  </div>
);

export interface ItemTooltipInlineItemProps {
  id?: string | null;
  name: string;
  tier?: string | null;
  count?: number | null;
}

/** Visual item identity for a tooltip row without nesting another tooltip. */
export const ItemTooltipInlineItem: React.FC<ItemTooltipInlineItemProps> = ({ id, name, tier, count = null }) => {
  const rarity = RARITY[normalTier(tier)] ?? null;
  return (
    <span className="sd-item-tooltip__inline-item inline-flex min-w-0 items-center gap-1.5 align-middle">
      <span className="inline-flex h-[1.25rem] w-[1.25rem] shrink-0 items-center justify-center" aria-hidden>
        <ItemIcon name={name} id={id ?? name} hypixelId={id ?? undefined} size={20} fallback="blank" />
      </span>
      <span className={`min-w-0 font-medium ${rarity?.text ?? "text-slate-200"}`}>{id && isPlayerItem(name, id) ? <RecipeLink id={id} name={name}>{name}</RecipeLink> : name}</span>
      {typeof count === "number" && count > 0 && <strong className={`shrink-0 text-[10px] text-slate-200 ${NUM}`}>×{count.toLocaleString()}</strong>}
    </span>
  );
};

export const ItemTooltipContent: React.FC<ItemTooltipContentProps> = ({
  id,name,count,extra,tier,tierIsDisplayed=false,icon,stats=[],identityColor,lore,sections=[],interactionCues=[],soulbound,
  obtained,values=[],progress=null,unitPrice,priceLabel="Bazaar each",provenance,metadata=[],skyDexSections=[],recipe,wikiName,
  surfacePinned=false,recipeLink=true
}) => {
  // Catalogue entries need base game lore. Captured stacks and domain-specific
  // tooltips already have their exact content and must never inherit base stats.
  const gameLore = useItemLore(!lore?.length && !sections.length && !identityColor && !extra ? id ?? null : null, name, tier);
  const resolvedLore = lore?.length ? lore : gameLore.item?.lore;
  const articleDisplayName = stripMinecraftFormatting(name).trim() || name;
  const displayName = gameLore.item?.name.startsWith("[Lvl 1]") ? gameLore.item.name : articleDisplayName;
  const displayTier = tierIsDisplayed ? normalTier(tier) : recombDisplayTier(tier, extra?.recomb === true);
  const rarity = RARITY[normalTier(displayTier)] ?? null;
  const prepared = prepareItemLore(resolvedLore, displayTier);
  const enchants = prepared.lines.length === 0 && extra?.ench ? Object.entries(extra.ench) : [];
  const stars = typeof extra?.stars === "number" && extra.stars > 0 ? Math.min(extra.stars,10) : 0;
  const meta: ItemTooltipMetadata[] = [...metadata.filter(r=>present(r.value)), ...(present(provenance)?[{label:"Source",value:provenance}]:[]), ...(id?[{label:"Item ID",value:gameLore.item?.id ?? id,mono:true}]:[])];
  const valueRows: ItemTooltipValue[] = [...values.filter(r=>present(r.value))];
  const rawArticleName = wikiName ?? (id ? articleDisplayName : null);
  const articleName = rawArticleName ? stripMinecraftFormatting(rawArticleName).trim() || null : null;
  if (typeof unitPrice === "number" && Number.isFinite(unitPrice) && unitPrice > 0) { valueRows.push({label:priceLabel,value:coinValue(unitPrice)}); if (typeof count === "number" && count > 1) valueRows.push({label:"Stack value",value:coinValue(unitPrice*count)}); }
  const binding = typeof soulbound === "string" ? soulbound : soulbound ? "Co-op Soulbound" : null;
  return <div
    className="sd-item-tooltip w-[24rem] max-w-[calc(100vw-1rem)] overflow-hidden border text-left"
    data-identity-color={identityColor ? "true" : undefined}
    style={{"--sd-item-tooltip-accent":identityColor ?? rarity?.color ?? "var(--color-slate-400)",fontFamily:"var(--font-sans)"} as React.CSSProperties}
  >
    <div className={`sd-item-tooltip__header border-b px-3 py-2.5 ${rarity ? rarity.band : "border-white/12 bg-slate-900"}`}><div className="flex min-w-0 items-center gap-2.5">{icon && <div className="sd-item-tooltip__icon flex h-10 w-10 shrink-0 items-center justify-center" aria-hidden>{icon}</div>}<div className="min-w-0 flex-1">{articleName ? <WikiLink name={articleName} className={`sd-item-tooltip__name max-w-full ${surfacePinned ? "pointer-events-auto [&>svg]:opacity-60" : "pointer-events-none"} ${rarity ? rarity.text : "text-slate-100"}`} nameClassName="break-words text-[13px] font-bold leading-tight" title={`Open ${articleName} on the wiki`}>{displayName}</WikiLink> : <div className={`sd-item-tooltip__name break-words text-[13px] font-bold leading-tight ${rarity ? rarity.text : "text-slate-100"}`}>{displayName}</div>}{(displayTier || prepared.typeLine) && <div className={`sd-item-tooltip__type mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${rarity ? rarity.text : "text-slate-400"}`}>{prepared.typeLine ?? normalTier(displayTier).replace(/_/g," ")}</div>}</div></div></div>
    <div className="sd-item-tooltip__body space-y-2.5 px-3 py-2.5">
      {(extra?.reforge || stars || extra?.recomb) && <div className="sd-item-tooltip__attributes flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">{extra?.reforge && <span className="text-slate-400">Reforge <span className="text-stat-aqua">{extra.reforge}</span></span>}{stars>0 && <span className="text-rarity-legendary">{"\u272a".repeat(stars)} <span className="text-slate-400">{stars} stars</span></span>}{extra?.recomb && <span className="text-rarity-epic">Recombobulated</span>}</div>}
      {stats.length>0 && !gameLore.item && <div className="sd-item-tooltip__stats space-y-0.5">{stats.map((s,i)=>{
        const presentation = skyBlockStatPresentation(s.label);
        const colorClass = presentation?.colorClass ?? TONE[s.tone ?? "default"];
        const label = presentation && !s.label.includes(presentation.glyph) ? `${presentation.glyph} ${s.label}` : s.label;
        return <div key={`${s.label}-${i}`} className="sd-item-tooltip__stat-row flex items-baseline justify-between gap-4 text-[11px]"><span className={colorClass}>{label}</span><span className={`text-right font-semibold ${colorClass}`}>{s.value}</span></div>;
      })}</div>}
      {progress && progress.max > 0 && <div className="sd-item-tooltip__progress space-y-1.5" aria-label={progress.label}>
        <div className="flex items-baseline justify-between gap-3 text-[10px]"><span className="font-semibold text-slate-400">{progress.label}</span><span className={`text-right text-slate-200 ${NUM}`}>{progress.value}</span></div>
        <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-label={progress.label} aria-valuemin={0} aria-valuemax={progress.max} aria-valuenow={Math.min(progress.max, Math.max(0, progress.current))}>
          <i className="block h-full rounded-[inherit] bg-[var(--sd-item-tooltip-accent)] shadow-none" style={{width:`${Math.min(100, Math.max(0, (progress.current / progress.max) * 100))}%`}} />
        </div>
      </div>}
      {prepared.lines.length>0 && <div className="sd-item-tooltip__lore space-y-0.5" aria-label="In-game lore">{prepared.lines.map((line,i)=>stripMinecraftFormatting(line).trim()===""?<div key={i} className="h-1.5" aria-hidden/>:<div key={i} className="text-[11px] leading-[1.4]">{parseMinecraftText(line).map((seg,j)=><span key={j} className={seg.className}>{seg.text}</span>)}</div>)}</div>}
      {gameLore.loading && <div className="text-[11px] text-slate-400" role="status">Loading item details…</div>}
      {gameLore.unavailable && <div className="text-[11px] text-slate-400">In-game description unavailable.</div>}
      {enchants.length>0 && <Section section={{title:"Enchantments",tone:"ability",lines:[<span key="ench" className="text-stat-blue">{enchants.map(([ench,lvl],i)=><React.Fragment key={ench}>{i>0?<span className="text-slate-600">, </span>:null}{itemLabel(ench)} {romanLevel(lvl)}</React.Fragment>)}</span>]}}/>}
      {sections.filter(s => !s.collapsible || surfacePinned).map((s,i)=><Section key={i} section={s}/>)}
      {recipe && <Recipe recipe={recipe}/>}
      {interactionCues.filter(present).map((cue,i)=><div key={i} className="text-[11px] font-semibold text-stat-yellow">{cue}</div>)}
      {binding && <div className="text-[11px] text-slate-300">* {binding} *</div>}
      {present(obtained) && <div className="flex items-baseline justify-between gap-3 text-[10px]"><span className="text-slate-500">Obtained</span><span className="text-right text-stat-red">{obtained}</span></div>}
      {valueRows.length>0 && <div className="sd-item-tooltip__values space-y-0.5 border-t border-white/8 pt-2">{valueRows.map((r,i)=><div key={`${r.label}-${i}`} className="flex items-baseline justify-between gap-3 text-[10px]"><span className="text-slate-500">{r.label}</span><span className={`text-right ${NUM} text-stat-gold`}>{r.value}</span></div>)}</div>}
    </div>
    {(meta.length>0 || skyDexSections.some(s => !s.collapsible || surfacePinned)) && <div className="sd-item-tooltip__footer space-y-1.5 border-t border-white/10 px-3 py-2 font-sans">{meta.map((r,i)=><Meta key={`${r.label}-${i}`} {...r}/>)}{skyDexSections.filter(s => !s.collapsible || surfacePinned).map((s,i)=><Section key={i} section={s}/>)}</div>}
    {surfacePinned && recipeLink && id && !identityColor && isPlayerItem(articleDisplayName, id) && (
      <div className="border-t border-white/10 px-3 py-2 text-[11px] font-semibold text-slate-200">
        <RecipeLink id={id} name={articleDisplayName} />
      </div>
    )}
  </div>;
};

const describedBy = (held:unknown, id:string, open:boolean) => {
  const current = typeof held === "string" ? held.trim() : "";
  return open ? [current, id].filter(Boolean).join(" ") : current || undefined;
};

export const ItemTooltip: React.FC<ItemTooltipProps> = ({
  children,
  disabled: explicitlyDisabled = false,
  interactive = false,
  ariaLabel,
  wrapperClassName = "inline-block",
  wrapperTag: Wrapper = "div",
  ...content
}) => {
  const hoverTooltips = useHoverTooltips();
  // Item-only reading targets retain explicit tap details; selectors still act immediately.
  const tapDetails = !interactive && Boolean(content.id) && !content.identityColor
    && content.recipeLink !== false && isPlayerItem(content.name, content.id)
    && children.type !== "a" && !(children.props as React.HTMLAttributes<HTMLElement>).onClick;
  const disabled = explicitlyDisabled || (!hoverTooltips && !tapDetails);
  const tooltipId = `item-tooltip-${useId().replace(/:/g, "")}`;
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const lastPointer = useRef<string | null>(null);
  const pointerRef = useRef<TooltipPoint | null>(null);
  const positionRef = useRef<TooltipPosition | null>(null);
  const tooltipSizeRef = useRef<{ width:number; height:number } | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [pointer, setPointer] = useState<TooltipPoint | null>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const open = !disabled && !dismissed && (pinned || (hoverTooltips && (hovered || focused)));

  const activate = (nextPointer?:TooltipPoint, handoff=false) => {
    document.dispatchEvent(new CustomEvent<ItemTooltipActivation>(ITEM_TOOLTIP_ACTIVATE_EVENT, {
      detail: { id:tooltipId, pointer:nextPointer, handoff },
    }));
  };

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const enter = () => {
    cancel();
    setDismissed(false);
    setHovered(true);
  };
  const leave = () => {
    cancel();
    // The hover surface is pointer-transparent, so there is no card-crossing
    // grace period to preserve. Clearing immediately lets the next grid slot
    // win the same pointer movement instead of showing stale content.
    setHovered(false);
  };

  useEffect(() => () => {
    cancel();
    if (pointerFrameRef.current !== null) cancelAnimationFrame(pointerFrameRef.current);
  }, []);
  useEffect(() => {
    if (disabled) return;
    const dismissForOtherTrigger = (event: Event) => {
      const detail = (event as CustomEvent<ItemTooltipActivation>).detail;
      if (detail.id === tooltipId) {
        if (detail.handoff && detail.pointer) {
          pointerRef.current = detail.pointer;
          setPointer(detail.pointer);
          setDismissed(false);
          setPinned(false);
          setFocused(false);
          setHovered(true);
        }
        return;
      }
      setPinned(false);
      setHovered(false);
      setFocused(false);
      setDismissed(true);
    };
    document.addEventListener(ITEM_TOOLTIP_ACTIVATE_EVENT, dismissForOtherTrigger);
    return () => document.removeEventListener(ITEM_TOOLTIP_ACTIVATE_EVENT, dismissForOtherTrigger);
  }, [disabled, tooltipId]);
  useEffect(() => {
    if (!disabled) return;
    setPinned(false);
    setHovered(false);
    setFocused(false);
  }, [disabled]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) {
      positionRef.current = null;
      setPosition(null);
      return;
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!triggerRef.current || !tooltipRef.current) return;
        const tooltipRect = { width: tooltipRef.current.getBoundingClientRect().width, height: tooltipRef.current.scrollHeight };
        tooltipSizeRef.current = { width:tooltipRect.width, height:tooltipRect.height };
        const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
        const activePointer = pointerRef.current ?? pointer;
        const next = activePointer
          ? positionItemTooltipAtPointer(activePointer, tooltipRect, viewport)
          : positionItemTooltip(triggerRef.current.getBoundingClientRect(), tooltipRect, viewport);
        positionRef.current = next;
        setPosition(next);
      });
    };
    update();
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, { capture:true, passive:true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(triggerRef.current);
    ro?.observe(tooltipRef.current);
    if (tooltipRef.current.firstElementChild) ro?.observe(tooltipRef.current.firstElementChild);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, { capture:true });
      ro?.disconnect();
    };
  }, [open, pointer]);

  useEffect(() => {
    if (!pinned) return;
    const outside = (e:PointerEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !tooltipRef.current?.contains(target)) {
        setPinned(false);
        setDismissed(true);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [pinned]);

  useEffect(() => {
    if (!pinned || !triggerRef.current || typeof IntersectionObserver === "undefined") return;
    const trigger = triggerRef.current;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && entry.intersectionRatio > 0) return;
      setPinned(false);
      setHovered(false);
      setFocused(false);
      setDismissed(true);
    }, { threshold: 0 });
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [pinned]);

  const child = React.Children.only(children);
  const cp = child.props as Record<string, unknown>;
  const native = typeof child.type === "string" ? child.type : "";
  const nativeFocus = ["a", "button", "input", "select", "textarea"].includes(native);
  const triggerProps = disabled
    ? { ...(!cp["aria-label"] ? { "aria-label": stripMinecraftFormatting(content.name) } : {}) }
    : {
        tabIndex: cp.tabIndex ?? 0,
        ...(ariaLabel && !cp["aria-label"] ? { "aria-label": ariaLabel } : {}),
        ...(!interactive && !nativeFocus && !cp.role ? { role:"button" } : {}),
        "aria-describedby": describedBy(cp["aria-describedby"], tooltipId, open),
      };
  const trigger = React.cloneElement(child, triggerProps as React.HTMLAttributes<HTMLElement>);
  if (disabled) return <Wrapper className={wrapperClassName}>{trigger}</Wrapper>;
  const portal = open && typeof document !== "undefined"
    ? createPortal(
        <div
          id={tooltipId}
          ref={tooltipRef}
          role="tooltip"
          data-placement={position?.placement}
          data-pinned={pinned ? "true" : "false"}
          className={`sd-item-tooltip-layer fixed z-[10000] overflow-y-auto overscroll-contain [&>.sd-item-tooltip]:max-w-full ${pinned ? "select-text" : "select-none"}`}
          style={{
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            maxHeight: position?.maxHeight ?? "calc(100vh - 16px)",
            maxWidth: "calc(100% - 16px)",
            visibility: position ? "visible" : "hidden",
            // Ordinary hover remains transparent. A deliberately pinned card
            // becomes a reading surface so its text can be selected and the
            // grid beneath it cannot receive misleading hover states.
            pointerEvents: tooltipSurfacePointerEvents(pinned),
          }}
        >
          <ItemTooltipContent {...content} surfacePinned={pinned} />
        </div>,
        document.body
      )
    : null;

  return (
    <Wrapper
      ref={element => { triggerRef.current = element; }}
      className={wrapperClassName}
      data-item-tooltip-trigger
      data-tooltip-id={tooltipId}
      data-tooltip-pinned={pinned ? "true" : "false"}
      onPointerEnter={(e) => {
        lastPointer.current = e.pointerType;
        if (e.pointerType !== "touch") {
          const nextPointer = { x:e.clientX, y:e.clientY };
          pointerRef.current = nextPointer;
          setPointer(nextPointer);
          activate(nextPointer);
          enter();
        }
      }}
      onPointerMove={(e) => {
        if (e.pointerType === "touch" || pinned || !open || !tooltipRef.current) return;
        const nextPointer = { x:e.clientX, y:e.clientY };
        pointerRef.current = nextPointer;
        if (pointerFrameRef.current !== null) return;
        pointerFrameRef.current = requestAnimationFrame(() => {
          pointerFrameRef.current = null;
          const surface = tooltipRef.current;
          const activePointer = pointerRef.current;
          if (!surface || !activePointer) return;
          // Measuring after every mouse pixel forced layout and made the entire
          // greenhouse feel stuck. ResizeObserver keeps this cache current;
          // pointer frames now do writes only.
          const size = tooltipSizeRef.current ?? (() => {
            const rect = surface.getBoundingClientRect();
            const measured = { width:rect.width, height:surface.scrollHeight };
            tooltipSizeRef.current = measured;
            return measured;
          })();
          const next = positionItemTooltipAtPointer(activePointer, size, {
            width:document.documentElement.clientWidth,
            height:window.innerHeight,
          });
          positionRef.current = next;
          surface.style.top = `${next.top}px`;
          surface.style.left = `${next.left}px`;
          surface.style.maxHeight = `${next.maxHeight}px`;
          surface.dataset.placement = next.placement;
        });
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") leave();
      }}
      onPointerDown={(e) => {
        lastPointer.current = e.pointerType;
        if (e.pointerType === "touch" && !tapDetails) {
          setHovered(false);
          setFocused(false);
          setPinned(false);
          setDismissed(true);
        }
      }}
      onFocusCapture={() => {
        if (lastPointer.current === "touch") return;
        if (lastPointer.current === null) {
          pointerRef.current = null;
          setPointer(null);
        }
        activate(pointerRef.current ?? pointer ?? undefined);
        setDismissed(false);
        setFocused(true);
      }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocused(false);
          setDismissed(false);
        }
      }}
      onKeyDownCapture={(e) => {
        lastPointer.current = null;
        if (e.key === "Escape") {
          e.stopPropagation();
          setPinned(false);
          setDismissed(true);
        }
      }}
      onWheelCapture={(e) => {
        const surface = tooltipRef.current;
        if (!open || !surface || surface.scrollHeight <= surface.clientHeight) return;
        e.preventDefault();
        e.stopPropagation();
        surface.scrollTop += e.deltaY;
      }}
      onClickCapture={(e) => {
        if (disabled) return;
        if (tooltipRef.current?.contains(e.target as Node)) return;
        if (!hoverTooltips || lastPointer.current === "touch") {
          if (!tapDetails) return;
          e.preventDefault();
          e.stopPropagation();
          activate();
          pointerRef.current = null;
          setPointer(null);
          setDismissed(false);
          setPinned(value => !value);
          return;
        }
        if (tooltipRef.current?.contains(e.target as Node)) return;
        if (interactive && lastPointer.current !== "touch") {
          // Let the inventory tile perform its own action, but keep its reading
          // surface open so long lore can be scrolled and links can be used.
          activate(pointerRef.current ?? pointer ?? undefined);
          setDismissed(false);
          setPinned(true);
          return;
        }
        if (shouldInterceptTooltipClick(interactive, lastPointer.current)) {
          activate(pointerRef.current ?? pointer ?? undefined);
          e.preventDefault();
          e.stopPropagation();
          setDismissed(false);
          if (positionRef.current) setPosition(positionRef.current);
          if (interactive) setPinned(true);
          else setPinned((value) => !value);
        }
        if (interactive) return;
        e.preventDefault();
      }}
    >
      {trigger}
      {portal}
    </Wrapper>
  );
};
export default ItemTooltip;
