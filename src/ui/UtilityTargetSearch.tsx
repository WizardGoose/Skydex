import React from "react";
import { ChevronDown, Search, X } from "lucide-react";
import "./utility-target-search.css";

/** Shared target shelf control for the three calculators. */
export function UtilityTargetSearch({ query, onQueryChange, expanded, onExpandedChange, placeholder, label, controls, actions }: {
  query: string;
  onQueryChange: (query: string) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  placeholder: string;
  label: string;
  controls?: string;
  actions?: React.ReactNode;
}) {
  return <div className="utility-target-search">
    <Search aria-hidden />
    <input type="search" value={query} placeholder={placeholder} aria-label={label}
      aria-expanded={expanded} aria-controls={controls} autoComplete="off" spellCheck={false}
      onFocus={() => onExpandedChange(true)}
      onChange={event => { onQueryChange(event.target.value); onExpandedChange(true); }}
      onKeyDown={event => { if (event.key === "Escape") { if (query) onQueryChange(""); else onExpandedChange(false); } }} />
    {query && <button type="button" onClick={() => onQueryChange("")} aria-label="Clear target search"><X aria-hidden /></button>}
    {actions}
    <button type="button" className={expanded ? "is-open" : undefined} onClick={() => onExpandedChange(!expanded)}
      aria-label={expanded ? "Hide target previews" : "Show target previews"} aria-expanded={expanded} aria-controls={controls}>
      <ChevronDown aria-hidden />
    </button>
  </div>;
}
