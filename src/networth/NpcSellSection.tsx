import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import { NUM } from "../ui/kit";
import { coins, exactCoins } from "./format";
import type { NpcSellSummary } from "./npcSell";

/**
 * The NPC sell value row.
 *
 * The networth tab should also say what the NPCs would pay
 * for the raw stacks the player holds, found across every place they hold
 * them: chests at base and sacks alike, both found and both counted.
 * One row per item, the sources in the tooltip,
 * items no NPC buys excluded and the exclusion counted.
 *
 * It sits in the networth panel's category list and wears exactly that list's
 * row: hairline, 12px, mono figures. It used to be its own soft tile, which
 * was one of the many bespoke tile styles the profile rebuild
 * retired - a row in a scanned list does not get a private card.
 *
 * Deliberately NOT added to the networth total above it: networth prices the
 * same stacks at market rates, so adding this would count everything twice.
 * The line under the rows says so, because a number this close to a total
 * invites adding.
 */

/** How many rows show before it needs asking again. Same page size the categories used to run on. */
const PAGE = 25;

export const NpcSellSection: React.FC<{ summary: NpcSellSummary | null }> = ({ summary }) => {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  if (!summary) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="h-3 w-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-[12px] text-slate-200">NPC sell value</span>
        <span className="text-[10px] text-slate-500">needs your island data</span>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-800/40"
      >
        <ChevronRight className={`h-3 w-3 shrink-0 text-slate-600 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="min-w-0 flex-1 truncate text-[12px] text-slate-200">NPC sell value</span>
        <span className={`shrink-0 text-[11px] ${NUM} text-slate-500`}>
          {summary.rows.length.toLocaleString("en-US")}
        </span>
        <span className={`shrink-0 w-20 text-right text-[12px] ${NUM} text-slate-100`} title={exactCoins(summary.total)}>
          {coins(summary.total)}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-800/70 bg-slate-950/30">
          {summary.rows.length === 0 ? (
            <p className="px-3 py-1.5 text-[11px] text-slate-500">Nothing you hold has an NPC price.</p>
          ) : (
            <>
              {summary.rows.slice(0, limit).map((row) => (
                <div
                  key={row.id}
                  className="flex items-baseline gap-2 border-t border-slate-800/70 px-3 py-1 first:border-t-0"
                  title={[
                    ...row.sources.map((s) => `${s.label}: ${s.count.toLocaleString("en-US")}`),
                    `${exactCoins(row.unit)} each`,
                  ].join("\n")}
                >
                  <span className="min-w-0 flex-1 truncate text-[12px] text-slate-300">{row.name}</span>
                  <span className={`shrink-0 text-[10px] ${NUM} text-slate-500`}>
                    x{row.count.toLocaleString("en-US")}
                  </span>
                  <span className={`shrink-0 w-20 text-right text-[12px] ${NUM} text-slate-200`} title={exactCoins(row.total)}>
                    {coins(row.total)}
                  </span>
                </div>
              ))}
              {summary.rows.length > limit && (
                <button
                  type="button"
                  onClick={() => setLimit((v) => v + PAGE)}
                  className="w-full cursor-pointer border-t border-slate-800/70 px-3 py-1 text-left text-[10px] text-emerald-300 hover:bg-slate-800/40"
                >
                  Show {Math.min(PAGE, summary.rows.length - limit)} more of{" "}
                  {(summary.rows.length - limit).toLocaleString("en-US")}
                </button>
              )}
            </>
          )}

          <p className="border-t border-slate-800/70 px-3 py-1.5 text-[10px] leading-snug text-slate-500">
            What merchants would pay for held stacks. Not part of the networth total; its valuation is separate.
            {summary.unpricedIds > 0 && (
              <>
                {" "}
                {summary.unpricedIds.toLocaleString("en-US")} item{summary.unpricedIds === 1 ? "" : "s"} you hold
                {summary.unpricedIds === 1 ? " has" : " have"} no NPC price and{" "}
                {summary.unpricedIds === 1 ? "is" : "are"} left out.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
};

export default NpcSellSection;
