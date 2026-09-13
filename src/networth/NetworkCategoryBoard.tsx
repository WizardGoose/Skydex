import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import { ItemIcon } from "../ui/ItemIcon";
import { NUM, Tag } from "../ui/kit";
import { coins, exactCoins } from "./format";
import type { NetworkCategoryView } from "./networkModel";

const SOURCE_CHIP: Record<string, { label: string; title: string }> = {
  api: {
    label: "API",
    title: "Read from your Hypixel profile through Skydex.",
  },
  mod: {
    label: "mod",
    title: "Read by the Skydex mod. The Hypixel API cannot see inside a chest.",
  },
};

const SourceChip: React.FC<{ source: "api" | "mod" }> = ({ source }) => (
  <Tag title={SOURCE_CHIP[source].title}>{SOURCE_CHIP[source].label}</Tag>
);

const NetworkItemRow: React.FC<{ item: NetworkCategoryView["items"][number] }> = ({ item }) => (
  <div className="flex items-center gap-2 border-t border-white/8 px-2 py-1.5 first:border-t-0" data-network-item>
    <ItemIcon name={item.name} id={item.id} size={22} fallback="blank" />
    <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300" title={item.name}>
      {item.name}
    </span>
    <span className={`shrink-0 text-[10px] ${NUM} text-slate-400`} title={`${item.count.toLocaleString()} held`}>
      ×{item.count.toLocaleString()}
    </span>
    <span className={`w-16 shrink-0 text-right text-[10px] ${NUM} text-slate-200`} title={exactCoins(item.price)}>
      {coins(item.price)}
    </span>
  </div>
);

const categoryStateTitle = (category: NetworkCategoryView): string => {
  if (category.state === "private") return "The selected profile does not share this category through its API settings.";
  if (category.state === "unavailable") return "No source has supplied this category yet.";
  if (category.state === "empty") return "The selected profile supplied this category and it contains no valued items.";
  return "Valued items from the selected profile snapshot.";
};

const networkCategoryStatusLabel = (category: NetworkCategoryView): string => {
  if (category.state === "private") return "Private";
  if (category.state === "unavailable") return "Unavailable";
  if (category.state === "empty") return "Empty";
  return `${category.itemCount.toLocaleString()} item${category.itemCount === 1 ? "" : "s"}`;
};

/** Sacks-style dense category card: heading disclosure, then compact item rows. */
const NetworkCategoryCard: React.FC<{
  category: NetworkCategoryView;
  open: boolean;
  onToggle: () => void;
}> = ({ category, open, onToggle }) => {
  const visibleItems = category.items.slice(0, 8);
  const remaining = Math.max(0, category.items.length - visibleItems.length);

  return (
    <div
      className={`break-inside-avoid overflow-hidden rounded-md border ${
        category.state === "available" ? "border-white/8 bg-white/5" : "border-white/6 bg-slate-950/25"
      }`}
      data-network-category={category.key}
      data-network-state={category.state}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`network-category-${category.key}`}
        className="flex min-h-12 w-full items-center gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/90 focus-visible:ring-inset"
      >
        <ChevronRight className={`h-3 w-3 shrink-0 text-slate-500 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/8 bg-slate-950/40" aria-hidden>
          <ItemIcon name={category.icon.name} id={category.icon.id} size={24} fallback="blank" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] text-slate-200">{category.label}</span>
          <span className="block truncate text-[10px] text-slate-500">{networkCategoryStatusLabel(category)}</span>
        </span>
        <SourceChip source={category.source} />
        <span
          className={`w-16 shrink-0 text-right text-[11px] ${NUM} ${
            category.state === "available" ? "text-slate-100" : "text-slate-500"
          }`}
          title={category.total === null ? categoryStateTitle(category) : exactCoins(category.total)}
        >
          {category.total === null ? "—" : coins(category.total)}
        </span>
      </button>

      {open && (
        <div id={`network-category-${category.key}`} className="border-t border-white/8 bg-black/15" data-network-category-details>
          {category.state === "private" && (
            <p className="px-2.5 py-2 text-[10px] text-amber-300/80">Private in API settings · not treated as zero.</p>
          )}
          {category.state === "unavailable" && (
            <p className="px-2.5 py-2 text-[10px] text-slate-500">No captured source for this category yet.</p>
          )}
          {category.state === "empty" && (
            <p className="px-2.5 py-2 text-[10px] text-slate-500">Verified empty · no valued items.</p>
          )}
          {category.state === "available" && visibleItems.map((item) => <NetworkItemRow key={`${item.id}-${item.name}`} item={item} />)}
          {category.state === "available" && remaining > 0 && (
            <p className="border-t border-white/8 px-2 py-1.5 text-[10px] text-slate-500">
              +{remaining.toLocaleString()} more valued item{remaining === 1 ? "" : "s"}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export const NetworkCategoryBoard: React.FC<{ categories: readonly NetworkCategoryView[] }> = ({ categories }) => {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = (key: string) => {
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="columns-1 gap-2 p-2 sm:columns-2 xl:columns-3" data-network-category-grid>
      {categories.map((category) => (
        <div key={category.key} className="mb-2">
          <NetworkCategoryCard category={category} open={open.has(category.key)} onToggle={() => toggle(category.key)} />
        </div>
      ))}
    </div>
  );
};

export default NetworkCategoryBoard;
