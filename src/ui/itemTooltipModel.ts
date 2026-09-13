import type { ReactNode } from "react";

export interface ItemTooltipExtra { reforge?: string; stars?: number; ench?: Record<string, number>; recomb?: boolean; }
export type ItemTooltipTone = "default" | "health" | "defense" | "mana" | "damage" | "fortune" | "ability" | "bonus" | "warning" | "muted";
export interface ItemTooltipStat { label: string; value: ReactNode; tone?: ItemTooltipTone; }
export interface ItemTooltipSection { title?: ReactNode; lines: readonly ReactNode[]; tone?: ItemTooltipTone; collapsible?: boolean; }
export interface ItemTooltipMetadata { label: string; value: ReactNode; mono?: boolean; tone?: ItemTooltipTone; }
export interface ItemTooltipValue { label: string; value: ReactNode; }
export interface ItemTooltipProgress {
  label: string;
  value: ReactNode;
  current: number;
  max: number;
}
export interface ItemTooltipRecipeIngredient {
  id?: string | null;
  name: string;
  qty: number;
  alternatives?: readonly { id?: string | null; name: string }[];
}
export interface ItemTooltipRecipe {
  ingredients: readonly ItemTooltipRecipeIngredient[];
  yields?: number | null;
  pending?: boolean;
  unavailable?: boolean;
}
export interface MinecraftTextSegment { text: string; className: string; }

const MC: Record<string, string> = { "0":"text-slate-600", "1":"text-blue-600", "2":"text-stat-dark-green", "3":"text-stat-dark-aqua", "4":"text-stat-dark-red", "5":"text-stat-dark-purple", "6":"text-stat-gold", "7":"text-slate-300", "8":"text-slate-500", "9":"text-stat-blue", a:"text-stat-green", b:"text-stat-aqua", c:"text-stat-red", d:"text-stat-light-purple", e:"text-stat-yellow", f:"text-stat-white" };

// Hypixel's resource pack assigns stat icons to the Unicode private-use area.
// Browser fonts render those slots as tofu, so mirror the readable fallbacks
// carried by the bundled wiki stat data before applying Minecraft colours.
const SKYBLOCK_GLYPH_FALLBACKS: Readonly<Record<string, string>> = {
  "\uE001":"⚔", "\uE002":"๑", "\uE003":"✎", "\uE004":"⚡", "\uE005":"Ⓟ", "\uE006":"❄",
  "\uE007":"☠", "\uE008":"❈", "\uE009":"⚓", "\uE00A":"☠", "\uE00B":"⫽", "\uE00C":"☂",
  "\uE00D":"❁", "\uE00E":"♢", "\uE00F":"▚", "\uE010":"❤", "\uE011":"❣", "\uE012":"♨",
  "\uE013":"♣", "\uE014":"☄", "\uE015":"⸕", "\uE016":"▚", "\uE017":"ʬ", "\uE018":"ൠ",
  "\uE019":"ൠ", "\uE01A":"✯", "\uE01B":"❍", "\uE01C":"✧", "\uE01D":"⚶", "\uE01E":"❁",
  "\uE01F":"❤", "\uE020":"ф", "\uE021":"α", "\uE022":"✦", "\uE023":"∮", "\uE024":"Ⓢ",
  "\uE025":"⛃", "\uE027":"❂", "\uE028":"♨", "\uE02A":"♔", "\uE02B":"☀", "\uE02C":"☣",
  "\uE02D":"ᛷ", "\uE050":"❁", "\uE051":"☘", "\uE053":"☘", "\uE054":"☘", "\uE05B":"☘",
  "\uE077":"❃", "\uE07E":"✿", "\uE07F":"ൠ",
};

export const normalizeSkyBlockGlyphs = (input: string): string =>
  input.replace(/[\uE000-\uF8FF]/g, (glyph) => SKYBLOCK_GLYPH_FALLBACKS[glyph] ?? glyph);

export function parseMinecraftText(input: string): MinecraftTextSegment[] {
  const normalized = normalizeSkyBlockGlyphs(input);
  const out: MinecraftTextSegment[] = [];
  let colour = "text-slate-300", bold = false, italic = false, underline = false, buffer = "";
  const flush = () => { if (!buffer) return; out.push({ text: buffer, className: [colour, bold ? "font-bold" : "", italic ? "italic" : "", underline ? "underline" : ""].filter(Boolean).join(" ") }); buffer = ""; };
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i] !== "§" || i + 1 >= normalized.length) { buffer += normalized[i]; continue; }
    flush(); const code = normalized[++i].toLowerCase();
    if (MC[code]) { colour = MC[code]; bold = italic = underline = false; }
    else if (code === "l") bold = true;
    else if (code === "o") italic = true;
    else if (code === "n") underline = true;
    else if (code === "r") { colour = "text-slate-300"; bold = italic = underline = false; }
  }
  flush(); return out;
}

/** Remove both Minecraft colour codes and Hypixel's translated-colour placeholders. */
export const stripMinecraftFormatting = (input: string): string => input
  .replace(/§[0-9a-fk-or]/gi, "")
  .replace(/%{1,2}[a-z_]+%%/gi, "");
export const normalTier = (tier?: string | null): string => (tier ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");

export function prepareItemLore(lore: readonly string[] | null | undefined, tier?: string | null): { lines: string[]; typeLine: string | null } {
  const lines = [...(lore ?? [])];
  while (lines.length && stripMinecraftFormatting(lines[lines.length - 1]).trim() === "") lines.pop();
  if (!lines.length || !tier) return { lines, typeLine: null };
  const tierWords = normalTier(tier).replace(/_/g, " ");
  const plain = stripMinecraftFormatting(lines[lines.length - 1]).trim();
  const at = plain.toUpperCase().indexOf(tierWords);
  if (at < 0) return { lines, typeLine: null };
  const typeLine = plain.slice(at).replace(/\s+[A-Za-z]$/, "").trim() || tierWords;
  lines.pop(); while (lines.length && stripMinecraftFormatting(lines[lines.length - 1]).trim() === "") lines.pop();
  return { lines, typeLine };
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
export const romanLevel = (n: number): string => n >= 1 && n < ROMAN.length ? ROMAN[n] : String(n);
export const itemLabel = (id: string): string => id.toLowerCase().split(/[_\s]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
export const compactCoins = (n: number): string => n >= 1e9 ? `${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `${(n/1e6).toFixed(2)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}k` : Math.round(n).toLocaleString("en-US");
export const coinValue = (n: number): string => `${Math.round(n).toLocaleString("en-US")} Coins (${compactCoins(n)})`;

export function itemStatsFromRecord(stats: Record<string, unknown> | null | undefined): ItemTooltipStat[] {
  if (!stats) return [];
  return Object.entries(stats).flatMap(([key, raw]) => {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return [];
    const k = key.toUpperCase(); let tone: ItemTooltipTone = "default";
    if (k.includes("HEALTH")) tone = "health"; else if (k.includes("DEFENSE")) tone = "defense"; else if (k.includes("INTELLIGENCE") || k.includes("MANA")) tone = "mana"; else if (k.includes("FORTUNE") || k.includes("MINING_SPEED")) tone = "fortune"; else if (k.includes("DAMAGE") || k.includes("STRENGTH") || k.includes("FEROCITY")) tone = "damage";
    return [{ label: itemLabel(key), value: `${raw > 0 ? "+" : ""}${raw.toLocaleString("en-US")}`, tone }];
  });
}

export interface TooltipRect { top:number; left:number; right:number; bottom:number; width:number; height:number; }
export interface TooltipPoint { x:number; y:number; }
export type TooltipPlacement = "top" | "bottom" | "left" | "right";
export interface TooltipPosition { top:number; left:number; maxHeight:number; placement:TooltipPlacement; }

/** Keep an ordinary hover card close to the pointer without covering it. */
export function positionItemTooltipAtPointer(
  pointer: TooltipPoint,
  tooltip: Pick<TooltipRect,"width"|"height">,
  viewport:{width:number;height:number},
  padding=8,
  gap=20
): TooltipPosition {
  const width = Math.min(Math.max(1, tooltip.width), Math.max(1, viewport.width - padding * 2));
  const height = Math.min(Math.max(1, tooltip.height), Math.max(1, viewport.height - padding * 2));
  const roomRight = viewport.width - pointer.x - gap - padding;
  const roomLeft = pointer.x - gap - padding;
  const placement: TooltipPlacement = roomRight >= width || roomRight >= roomLeft ? "right" : "left";
  const rawLeft = placement === "right" ? pointer.x + gap : pointer.x - gap - width;
  const left = Math.max(padding, Math.min(rawLeft, viewport.width - width - padding));

  // Keep the Minecraft-style pointer offset until the card reaches a viewport
  // edge. At an edge, move the whole readable surface back into view; only a
  // card taller than the viewport should need its own scrollbar.
  const latestTop = Math.max(padding, viewport.height - padding - height);
  const top = Math.max(padding, Math.min(pointer.y - gap, latestTop));
  return { top, left, maxHeight:height, placement };
}

/**
 * Place a rich card beside its slot whenever a full-width side has room.
 *
 * The clearance is deliberately one trigger-sized slot (with the caller's
 * minimum gap as a floor). That keeps a hover card visually out of the next
 * selectable cell; ordinary hover cards are pointer-transparent in
 * `ItemTooltip`, so this remains safe even when a dense grid has no empty
 * margin to spare. On narrow screens we fall back to the side with the most
 * vertical room and clamp the card into the viewport.
 */
export function positionItemTooltip(
  trigger: TooltipRect,
  tooltip: Pick<TooltipRect,"width"|"height">,
  viewport:{width:number;height:number},
  padding=8,
  gap=8
): TooltipPosition {
  const width = Math.min(Math.max(1, tooltip.width), Math.max(1, viewport.width - padding * 2));
  const clearance = Math.max(gap, Math.min(trigger.width, trigger.height));
  const rightSpace = viewport.width - trigger.right - clearance - padding;
  const leftSpace = trigger.left - clearance - padding;
  const sideHeight = Math.max(1, viewport.height - padding * 2);
  const maxSideHeight = Math.max(96, Math.min(tooltip.height, sideHeight));
  const clampTop = (raw:number, height:number) => Math.max(padding, Math.min(raw, viewport.height - height - padding));
  const clampLeft = (raw:number) => Math.max(padding, Math.min(raw, viewport.width - width - padding));

  let placement: TooltipPlacement;
  if (rightSpace >= width) placement = "right";
  else if (leftSpace >= width) placement = "left";
  else {
    const above = Math.max(0, trigger.top - clearance - padding);
    const below = Math.max(0, viewport.height - trigger.bottom - clearance - padding);
    placement = below > above ? "bottom" : "top";
  }

  if (placement === "right" || placement === "left") {
    const top = clampTop(trigger.top + trigger.height / 2 - maxSideHeight / 2, maxSideHeight);
    const rawLeft = placement === "right"
      ? trigger.right + clearance
      : trigger.left - clearance - width;
    return { top, left: clampLeft(rawLeft), maxHeight:maxSideHeight, placement };
  }

  const above = Math.max(0, trigger.top - clearance - padding);
  const below = Math.max(0, viewport.height - trigger.bottom - clearance - padding);
  const fitsAbove = tooltip.height <= above;
  const fitsBelow = tooltip.height <= below;
  if (fitsAbove && !fitsBelow) placement = "top";
  else if (fitsBelow && !fitsAbove) placement = "bottom";
  else if (fitsAbove && fitsBelow) placement = below > above ? "bottom" : "top";
  else placement = below > above ? "bottom" : "top";

  const available = placement === "top" ? above : below;
  const maxHeight = Math.max(96, Math.min(tooltip.height, available || sideHeight));
  const rawTop = placement === "top"
    ? trigger.top - Math.min(tooltip.height, maxHeight) - clearance
    : trigger.bottom + clearance;
  const rawLeft = trigger.left + trigger.width / 2 - width / 2;
  return { top:clampTop(rawTop, maxHeight), left:clampLeft(rawLeft), maxHeight, placement };
}
/**
 * Hover cards stay pointer-transparent so moving between dense items is
 * immediate. A deliberately pinned card captures the pointer so its text can
 * be selected and the grid beneath it cannot react through the surface.
 */
export const tooltipSurfacePointerEvents = (pinned:boolean): "none" | "auto" => pinned ? "auto" : "none";

/** Whether the wrapper must consume a click to pin the card instead of activating its child. */
export const shouldInterceptTooltipClick = (interactive:boolean, pointerType:string|null): boolean =>
  pointerType !== "touch" && !interactive;
