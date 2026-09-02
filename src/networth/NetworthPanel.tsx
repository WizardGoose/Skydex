import React, { useState } from "react";
import { ChevronRight, KeyRound, RefreshCw } from "lucide-react";
import { SettingsLink } from "../components/layout/SettingsLink";
import { BTN_QUIET, NUM, PANEL, SectionHead, Stat, Tag, TILE } from "../ui/kit";
import { ago } from "../island/format";
import { useNetworth } from "./useNetworth";
import { CATEGORY_ORDER, categoryLabel, coins, exactCoins } from "./format";
import { NpcSellSection } from "./NpcSellSection";
import type { NpcSellSummary } from "./npcSell";
import type { ChestValue } from "./islandChests";
import type { CategoryResult } from "./types";
import type { SectionProvenance } from "../island/merge";
import type { IslandChest } from "../island/types";

/**
 * The Networth section.
 *
 * ONE RULE ABOVE THE OTHERS: never show a zero that is really a blank. Every
 * category on this panel can be missing for a reason that is not "you own
 * nothing", and each of those reasons has its own sentence. A player whose
 * Inventory API toggle is off must not read a confident 0 next to Inventory and
 * conclude their gear is worthless; they must read that Hypixel is not sharing
 * it and what to do about that.
 *
 * TIDY, WITH SKYCRYPT'S BREAKDOWN AS THE REFERENCE: display the
 * information the way SkyCrypt does, much more tidy; the user does not
 * need a breakdown of each specific item here. So the categories are a
 * plain list now - name left,
 * value right, source chip between - and the per-item slot grids that used to
 * expand out of each row are gone from this panel entirely. The items did not
 * lose their home: the profile page's tabs (Chests, Inventory, Ender Chest,
 * Storage, Gear, Pets) are where stuff is browsed, and a category with no
 * browsing tab (Museum, Essence, Candy, the small bags) states its value here
 * and itemises nowhere, exactly as SkyCrypt does.
 *
 * The NPC sell and per-chest drilldowns survive below the list: they are text
 * ledgers, not item grids, and they answer questions no other tab answers.
 *
 * The provenance chips are the same distinction the rest of the Island page
 * draws: everything here comes from the Hypixel API except Island Chests, which
 * only exists because the companion mod can see inside a chest and the API
 * never has.
 */

/** Which feed a category came from. Only two exist and the difference matters. */
const SOURCE_CHIP: Record<string, { label: string; title: string }> = {
  api: {
    label: "API",
    title: "Read from your Hypixel profile.",
  },
  mod: {
    label: "mod",
    title: "Read by the companion mod. The Hypixel API cannot see inside a chest.",
  },
};

const SourceChip: React.FC<{ source: "api" | "mod" }> = ({ source }) => (
  <Tag title={SOURCE_CHIP[source].title}>{SOURCE_CHIP[source].label}</Tag>
);

/** One summary figure for a tile band. */
export interface BandStat {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}

/**
 * A band of summary tiles: the one shape every headline figure on the profile
 * page wears, exported so the page's always-visible summary band and this
 * panel's coin figures are the same component rather than two markups
 * drifting apart.
 */
export const StatBand: React.FC<{ stats: BandStat[]; className?: string }> = ({ stats, className = "" }) => (
  <div className={`grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5 ${className}`}>
    {stats.map((stat) => (
      <div key={stat.label} className={`${TILE} px-2.5 py-1.5`}>
        <Stat label={stat.label} value={stat.value} accent={stat.accent} align="left" />
      </div>
    ))}
  </div>
);

/**
 * One category, one line. Name, source, value; nothing expands. The exact
 * figure sits behind the abbreviation, the same split as every number here.
 */
const CategoryLine: React.FC<{ name: string; result: CategoryResult; source: "api" | "mod" }> = ({
  name,
  result,
  source,
}) => (
  <div className="flex items-center gap-2 border-b border-white/8 py-1.5 break-inside-avoid">
    <span className="min-w-0 flex-1 truncate text-[12px] text-slate-200">{categoryLabel(name)}</span>
    <SourceChip source={source} />
    <span className={`shrink-0 text-[12px] ${NUM} text-slate-100`} title={exactCoins(result.total)}>
      {coins(result.total)}
    </span>
  </div>
);

/** The per-chest drilldown, which is ours alone: we know where each chest is. */
const ChestBreakdown: React.FC<{ chests: ChestValue[] }> = ({ chests }) => {
  const [open, setOpen] = useState(false);
  const withValue = chests.filter((c) => c.total > 0);
  if (withValue.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5"
      >
        <ChevronRight className={`h-3 w-3 shrink-0 text-slate-600 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="min-w-0 flex-1 truncate text-[12px] text-slate-300">Which chest, by value</span>
        <span className={`shrink-0 text-[11px] ${NUM} text-slate-500`}>{withValue.length}</span>
      </button>
      {open && (
        // A recessed ledger ground: black at low alpha is how the kit sinks a
        // surface into the glass (the input and bar-track treatment), where a
        // slate slab would sit on top of it.
        <div className="border-t border-white/8 bg-black/20">
          {withValue.map((chest) => (
            <div key={chest.key} className="flex items-baseline gap-2 border-t border-white/8 px-3 py-1 first:border-t-0">
              <span className="min-w-0 flex-1 truncate text-[12px] text-slate-400">
                {chest.name || "Chest"}
                <span className={`ml-2 text-[10px] ${NUM} text-slate-500`}>{chest.pos.join(" ")}</span>
              </span>
              <span className={`shrink-0 text-[10px] ${NUM} text-slate-500`}>{ago(chest.lastSeen)}</span>
              <span className={`shrink-0 w-20 text-right text-[12px] ${NUM} text-slate-200`} title={exactCoins(chest.total)}>
                {coins(chest.total)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export interface NetworthPanelProps {
  /** The merged island's chests. Empty when nothing has captured any. */
  chests: readonly IslandChest[];
  /** Why the chest section is in the state it is in, so a blank can explain itself. */
  chestProvenance: SectionProvenance;
  /**
   * The NPC sell aggregation across everything held on the island, or null
   * when there is no island data to aggregate. Computed by the page because
   * only the page holds both the snapshot and the item index.
   */
  npcSell?: NpcSellSummary | null;
}

export const NetworthPanel: React.FC<NetworthPanelProps> = ({ chests, chestProvenance, npcSell = null }) => {
  const view = useNetworth(chests);
  const [busy, setBusy] = useState(false);

  const onRefresh = async () => {
    setBusy(true);
    try {
      await view.refresh(true);
    } finally {
      setBusy(false);
    }
  };

  const priceLine = view.pricesAt ? (
    <span className="text-[10px] text-slate-500" title={new Date(view.pricesAt).toLocaleString()}>
      prices {ago(view.pricesAt)}
      {view.pricesFrom === "storage" && " (cached)"}
    </span>
  ) : (
    <span className="text-[10px] text-slate-500">no prices yet</span>
  );

  const header = (
    <SectionHead
      title="Networth"
      right={
        <span className="flex items-center gap-2">
          {view.pricesLoading ? <span className="text-[10px] text-slate-500">prices loading</span> : priceLine}
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy || view.status === "loading"}
            title="Refetch your profile and the price list. Rate limited, like every other request here."
            className={`${BTN_QUIET} px-1.5 py-1`}
          >
            <RefreshCw className={`h-3 w-3 ${busy || view.status === "loading" ? "animate-spin" : ""}`} />
          </button>
        </span>
      }
    />
  );

  /* --- states where there is no number to show ---------------------------- */

  if (view.status === "needsKey") {
    return (
      <div className={PANEL}>
        {header}
        <div className="space-y-2 p-3">
          <p className="text-[12px] leading-relaxed text-slate-300">
            Networth needs a connected Minecraft account. Everything it values lives on your Hypixel profile.
          </p>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Skydex.ca reads it through the shared Hypixel connection. Prices come from a public file.
          </p>
          <SettingsLink section="hypixel" className={BTN_QUIET}>
            <KeyRound className="h-3 w-3" />
            Connect your profile
          </SettingsLink>
        </div>
      </div>
    );
  }

  if (view.status === "error") {
    return (
      <div className={PANEL}>
        {header}
        <div className="space-y-2 p-3">
          <p className="border-l-2 border-red-500/50 pl-2 text-[11px] text-red-400" role="alert">
            {view.error}
          </p>
          <button type="button" className={BTN_QUIET} onClick={onRefresh} disabled={busy}>
            <RefreshCw className="h-3 w-3" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!view.result) {
    return (
      <div className={PANEL}>
        {header}
        <p className="px-3 py-3 text-[11px] text-slate-500">
          {view.status === "loading" ? "Reading your profile and pricing it." : "Nothing valued yet."}
        </p>
      </div>
    );
  }

  /* --- the numbers -------------------------------------------------------- */

  const { result, coverage } = view;
  const bankShared = coverage?.bankShared ?? false;

  // Only categories with something in them, in the order the panel lists them,
  // then anything new the engine grew that this file has not been told about.
  const known = new Set(CATEGORY_ORDER);
  const extras = Object.keys(result.types).filter((key) => !known.has(key));
  const rows = [...CATEGORY_ORDER, ...extras]
    .map((key) => ({ key, category: result.types[key] }))
    .filter((row): row is { key: string; category: CategoryResult } => !!row.category && row.category.total > 0);

  const chestsMissing = chestProvenance.state === "absent" || chestProvenance.state === "hidden";
  const hasChests = rows.some((row) => row.key === "island_chests");

  /** A dash, never a zero, for a bank Hypixel will not share: an unshared bank is not an empty bank. */
  const band: BandStat[] = [
    { label: "Total", value: coins(result.networth), accent: true },
    { label: "Unsoulbound", value: coins(result.unsoulboundNetworth) },
    { label: "Purse", value: coins(result.purse) },
    { label: "Co-op bank", value: bankShared ? coins(result.bank) : "-" },
    { label: "Personal bank", value: coins(result.personalBank) },
  ];

  return (
    <div className={PANEL}>
      {header}

      <StatBand stats={band} className="p-2" />

      {/*
        The category list, in SkyCrypt's shape and our materials: every
        category on one line, name to value, flowing into two columns where
        the width allows. Multi-column flow rather than a two-column grid so
        the order reads DOWN each column - the same order the keys are ranked
        in - instead of snaking across rows.
      */}
      <div className="border-t border-white/8 px-3 py-1.5 md:columns-2 md:gap-8">
        {rows.map(({ key, category }) => (
          <CategoryLine key={key} name={key} result={category} source={key === "island_chests" ? "mod" : "api"} />
        ))}
        {rows.length === 0 && (
          <p className="py-1.5 text-[11px] text-slate-500">
            Nothing on this profile came back with a price. That is unusual; check the notes below.
          </p>
        )}
      </div>

      {/* The two ledgers no other tab carries. Text drilldowns, not item grids. */}
      <div className="divide-y divide-white/8 border-t border-white/8">
        <NpcSellSection summary={npcSell} />
        <ChestBreakdown chests={view.chests} />
      </div>

      {/* --- what is missing, and what to do about it ------------------------ */}

      <div className="space-y-1.5 border-t border-white/8 px-3 py-2">
        {/* The one honesty note that must not be behind a disclosure: this
            category sits in the same total as categories derived from full item
            data, and a reader has to know it is measured differently. */}
        {hasChests && (
          <p className="text-[10px] leading-snug text-slate-500">
            Island Chests is valued conservatively. The mod sends compact fields rather than full item data, so
            reforges, dungeon stars, enchantments and recombobulators are counted while gemstones, potato books,
            scrolls, dyes, runes and drill or rod parts are not. A modified item in a chest is worth at least what is
            shown, never less.
          </p>
        )}
        {chestsMissing && (
          <p className="text-[10px] leading-snug text-slate-500">
            Island Chests is not in the total: nothing has captured your chests yet. The Hypixel API has never published
            chest contents, so this one needs the companion mod.
          </p>
        )}
        {coverage && !coverage.inventoryShared && (
          <p className="text-[10px] leading-snug text-amber-400/90">
            Hypixel is not sharing your inventory, so Inventory, Ender Chest, Storage, Accessories and the bags are all
            missing rather than empty. Turn Inventory on in game under SkyBlock Menu, Settings, API Settings.
          </p>
        )}
        {coverage && !coverage.bankShared && (
          <p className="text-[10px] leading-snug text-amber-400/90">
            Your co-op bank is not shared, so it is shown as a dash rather than as zero and is not in the total. Turn
            Banking on under the same API Settings menu.
          </p>
        )}
        {coverage && !coverage.museumShared && (
          <p className="text-[10px] leading-snug text-slate-500">
            No museum data. Either this profile has never donated, or the Museum API setting is off.
          </p>
        )}
        {coverage && !coverage.catalogueLoaded && (
          <p className="text-[10px] leading-snug text-amber-400/90">
            Hypixel&rsquo;s item catalogue could not be loaded, so dungeon stars, gemstone slots and prestige costs are
            not being priced. Every number here is low until it loads.
          </p>
        )}
        {view.pricesError && <p className="text-[10px] leading-snug text-amber-400/90">{view.pricesError}</p>}
        <p className="text-[10px] leading-snug text-slate-500">
          Valuation rules ported from SkyHelper-Networth {view.rulesVersion} (MIT), the same rules other SkyBlock tools
          use, so these numbers should line up with theirs. Prices are fetched in this browser and cached for twenty
          minutes; profile reads use the connection and cache described in Settings.
        </p>
      </div>
    </div>
  );
};

export default NetworthPanel;
