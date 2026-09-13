import React from "react";
import type { SectionState } from "./merge";
import { storageTabIndexForKey } from "./storageSelectorModel";
import { ItemIcon } from "../ui/ItemIcon";

export interface StorageDestination {
  id: string;
  label: string;
  summary: string;
  state: SectionState;
  icon: {
    /** The real in-game item name resolved by ItemIcon's wiki/resource ladder. */
    name: string;
    /** Hypixel or vanilla id used by the user's resource-pack override first. */
    id: string;
  };
}

const tabId = (id: string, prefix: string) => `${prefix}-${id}`;

/**
 * The inventory's container picker.
 *
 * Minecraft objects do the recognition work: every destination goes through
 * ItemIcon, including the user's own resource-pack override. It is a horizontal
 * touch strip on narrow screens and the reference's compact left rail from md
 * upward. Both shapes keep one roving tab stop and the standard arrow/Home/End
 * tab keys.
 */
export const StorageSelector: React.FC<{
  items: StorageDestination[];
  active: string;
  onSelect: (id: string) => void;
  panelId: string;
  /** Accessible label for a comparable selector rail, e.g. Minion families. */
  ariaLabel?: string;
  /** Id prefix shared by each tab and its panel's aria-labelledby. */
  tabPrefix?: string;
  /** Extra layout classes for a rail that owns its own scroll area. */
  className?: string;
}> = ({ items, active, onSelect, panelId, ariaLabel = "Inventory storage", tabPrefix = "storage-tab", className = "" }) => (
  <div
    role="tablist"
    aria-label={ariaLabel}
    className={`-mx-3 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-3 pb-1 md:sticky md:top-[calc(var(--sd-bar-h)+0.75rem)] md:mx-0 md:grid md:gap-1 md:overflow-visible md:p-0 ${className}`}
  >
    {items.map((item, index) => {
      const isActive = item.id === active;
      const unavailable = item.state === "absent" || item.state === "hidden";
      return (
        <button
          key={item.id}
          id={tabId(item.id, tabPrefix)}
          type="button"
          role="tab"
          aria-selected={isActive}
          aria-controls={panelId}
          tabIndex={isActive ? 0 : -1}
          data-item-id={item.icon.id}
          onClick={() => onSelect(item.id)}
          onKeyDown={(event) => {
            const next = storageTabIndexForKey(event.key, index, items.length);
            if (next === null) return;
            event.preventDefault();
            const destination = items[next];
            onSelect(destination.id);
            document.getElementById(tabId(destination.id, tabPrefix))?.focus();
          }}
          className={`group flex min-h-12 w-[9.75rem] shrink-0 snap-start items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left transition-[background-color,border-color,color,transform] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/90 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 md:w-full ${
            isActive
              ? "border-cyan-400/45 bg-cyan-500/14 text-slate-50"
              : "border-transparent bg-slate-950/25 text-slate-300 hover:border-white/10 hover:bg-white/[0.06] hover:text-slate-50"
          }`}
        >
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${
              isActive ? "border-cyan-300/30 bg-slate-950/45" : "border-white/8 bg-slate-950/35"
            }`}
            aria-hidden
          >
            <ItemIcon name={item.icon.name} id={item.icon.id} size={28} fallback="blank" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate [font-family:var(--font-chrome)] text-[12px] font-bold tracking-[0.01em]">
              {item.label}
            </span>
            <span
              className={`mt-0.5 block truncate font-mono text-[9px] ${
                unavailable ? "text-amber-300/75" : isActive ? "text-cyan-200/80" : "text-slate-500"
              }`}
            >
              {item.summary}
            </span>
          </span>
        </button>
      );
    })}
  </div>
);

export default StorageSelector;
