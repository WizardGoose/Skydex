import React from "react";
import { FOCUS, LABEL, NUM, RADIUS } from "../../ui/kit";
import { ItemIcon } from "../../ui/ItemIcon";
import { SOURCE_CHIP, SOURCE_HINT, SOURCE_LABEL, SOURCE_ORDER } from "./sourceMeta";
import type { SourceCategory } from "./types";

/**
 * Where an accessory comes from, as a chip.
 *
 * Deliberately not the kit's `Tag`. `Tag` applies a complete colour triplet in
 * both of its branches, so a caller passing a hue would be relying on which of
 * two equally specific utilities Tailwind happens to emit last, which is not a
 * thing to rely on. This carries the same geometry as `Tag` (chip radius, mono,
 * 11px, the same padding: the site's one tag shape) and takes its colours as
 * one literal string.
 *
 * See sourceMeta.ts for why these are allowed to be coloured at all, and for
 * the measured hue and contrast figures behind each one.
 */
export const SourceTag: React.FC<{ source: SourceCategory; className?: string }> = ({
  source,
  className = "",
}) => (
  <span
    title={SOURCE_HINT[source]}
    className={
      `inline-flex max-w-full shrink-0 items-center border px-1.5 py-px font-mono text-[11px] leading-[1.5] tracking-tight ` +
      `${RADIUS.chip} ${SOURCE_CHIP[source]} ${className}`
    }
  >
    <span className="truncate">{SOURCE_LABEL[source]}</span>
  </span>
);

/**
 * The key, which is also the filter.
 *
 * A colour code nobody can decode is decoration, so this has to exist. Making
 * it the filter as well is not a trick to save space: the question a legend
 * provokes is "show me only those", and answering it in the same control is
 * fewer pixels and one less thing to learn.
 *
 * Selection is drawn in verdigris, never in the category's own hue. The chip
 * colour says what the thing is; the ring says you clicked it. Those are
 * different claims and the colour lock exists so they never get mixed up.
 *
 * A category with nothing in it stays listed and goes quiet: the key still has
 * to decode every colour on the page, but there is nothing to filter to.
 *
 * TWO JOBS NOW, AND THE WORDING HAS TO KEEP THEM APART. Since the actionable
 * border change, a tile's coloured border no longer restates its source
 * category; it means "you can act on this right now" (craft, buy from an NPC
 * shop, or an event that is currently running - see `ACTIONABLE_TILE`). The
 * chips here remain source-category FILTERS, and three of their hues double
 * as the border code, so the legend carries one line of plain words saying
 * which job is which. Without that line the green chip reads as "green border
 * = craftable category", which is only two-thirds true and the wrong third
 * misleads.
 */
export interface SourceLegendExample {
  name: string;
  id: string;
}

/** Compact visual decoder: real catalogue icons make the border meaning scannable without prose. */
export const SourceLegend: React.FC<{
  counts: Record<SourceCategory, number>;
  selected: readonly SourceCategory[];
  onToggle: (source: SourceCategory) => void;
  examples?: Partial<Record<SourceCategory, SourceLegendExample>>;
}> = ({ counts, selected, onToggle, examples = {} }) => (
  <div className="px-2.5 py-2" aria-label="Accessory source legend" data-accessory-source-legend>
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`${LABEL} mr-0.5`}>Source</span>
      {SOURCE_ORDER.map((source) => {
        const count = counts[source] ?? 0;
        const active = selected.includes(source);
        const example = examples[source];
        const label = source === "wiki" ? "Unknown / Wiki" : SOURCE_LABEL[source];
        return (
          <button
            key={source}
            type="button"
            disabled={count === 0}
            aria-pressed={active}
            aria-label={`${label} source, ${count} entries`}
            title={SOURCE_HINT[source]}
            onClick={() => onToggle(source)}
            className={
              `inline-flex items-center gap-1.5 border px-1.5 py-1 transition-colors duration-150 ` +
              `${RADIUS.control} ${FOCUS} ` +
              (count === 0
                ? "cursor-not-allowed border-white/8 bg-transparent opacity-45"
                : active
                  ? "cursor-pointer border-cyan-500/50 bg-cyan-500/10"
                  : "cursor-pointer border-white/12 bg-white/5 hover:border-white/20 hover:bg-white/8")
            }
          >
            <span className={`grid h-7 w-7 place-items-center rounded-sm border ${SOURCE_CHIP[source]}`} aria-hidden>
              {example ? <ItemIcon name={example.name} id={example.id} size={22} fallback="blank" /> : <span className="text-[10px]">?</span>}
            </span>
            <span className="min-w-0 text-left">
              <span className="block max-w-[7rem] truncate text-[10px] font-semibold text-slate-200">{label}</span>
              <span className={`block text-[9px] ${NUM} ${active ? "text-cyan-200" : "text-slate-400"}`}>{count}</span>
            </span>
          </button>
        );
      })}
    </div>
  </div>
);