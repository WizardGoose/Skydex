import React, { useState } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { useGreenhouseData } from "../context";
import { NUM } from "../../ui/kit";
import { wikiStatusLabel } from "./wikiStatusModel";
/**
 * Where the mutation data came from, and a way to pull it again.
 *
 * The site reads the wiki itself on load, so this is the honest label for how
 * current the numbers are. When the wiki has moved, the changes are listed
 * rather than applied silently.
 */
export const WikiStatus: React.FC = () => {
  const { wikiSync } = useGreenhouseData();
  const [open, setOpen] = useState(false);

  const label = wikiStatusLabel(wikiSync);
  const tone = wikiSync.error ? "text-amber-400" : wikiSync.fetchedAt ? "text-slate-500" : "text-slate-500";

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        {wikiSync.changes.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="greenhouse-wiki-changes"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-amber-300 border border-amber-500/30 bg-amber-500/10 cursor-pointer hover:bg-amber-500/20"
            title="The wiki differs from the bundled data"
          >
            <TriangleAlert className="w-2.5 h-2.5" />
            {wikiSync.changes.length} changed
          </button>
        )}

        <span className={`text-[11px] ${tone} ${NUM}`}>{label}</span>

        <button
          type="button"
          onClick={wikiSync.refresh}
          disabled={wikiSync.syncing}
          aria-label={wikiSync.syncing ? "Refreshing wiki data" : wikiSync.error ? "Retry wiki data refresh" : "Refresh wiki data"}
          title={wikiSync.error ?? "Fetch the wiki again"}
          className="p-1 rounded text-slate-500 hover:text-emerald-300 hover:bg-slate-800 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-3 h-3 ${wikiSync.syncing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {open && wikiSync.changes.length > 0 && (
        <div id="greenhouse-wiki-changes" className="absolute right-0 top-7 z-20 w-80 rounded-md border border-slate-700 bg-slate-950 p-2 shadow-xl">
          <p className="text-[11px] text-slate-400 mb-1.5">The wiki differs from the copy shipped with the app. Wiki values are in use.</p>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {wikiSync.changes.map((c, i) => (
              <div key={`${c.id}-${c.field}-${i}`} className="text-[11px]">
                <span className="text-slate-200">{c.name}</span> <span className="text-slate-500">{c.field}</span>
                <div className={`${NUM} text-slate-500`}>
                  <span className="line-through">{c.from}</span> <span className="text-emerald-400">{c.to}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
