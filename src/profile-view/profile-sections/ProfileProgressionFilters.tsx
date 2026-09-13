import React, { useEffect, useRef } from "react";
import { Filter, Search, X } from "lucide-react";
import "./profile-progression-filters.css";

export interface ProfileProgressionFilterOption {
  id: string;
  label: string;
  count: number;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
  accent?: string;
}

export interface ProfileProgressionFilterGroup {
  legend: string;
  options: readonly ProfileProgressionFilterOption[];
}

export interface ProfileProgressionFiltersProps {
  query: string;
  onQueryChange: (value: string) => void;
  searchLabel: string;
  placeholder: string;
  groups: readonly ProfileProgressionFilterGroup[];
  activeCount: number;
  resultCount: number;
  totalCount: number;
  onClear: () => void;
}

/** Shared dense filter grammar for Profile progression collections. */
export const ProfileProgressionFilters: React.FC<ProfileProgressionFiltersProps> = ({
  query,
  onQueryChange,
  searchLabel,
  placeholder,
  groups,
  activeCount,
  resultCount,
  totalCount,
  onClear,
}) => {
  const filtered = query.trim().length > 0 || activeCount > 0;
  return (
    <div className="profile-progression-filterbar">
      <label className="profile-progression-search">
        <Search aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          aria-label={searchLabel}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <ProfileProgressionFilterMenu groups={groups} activeCount={activeCount} onClear={onClear} />
      {filtered && (
        <span className="profile-progression-filter-result" aria-live="polite">
          <span className="profile-number">{resultCount.toLocaleString()} / {totalCount.toLocaleString()}</span>
          <button type="button" onClick={onClear} aria-label="Clear progression filters">
            <X aria-hidden />
            Clear
          </button>
        </span>
      )}
    </div>
  );
};

export const ProfileProgressionFilterMenu: React.FC<Pick<ProfileProgressionFiltersProps, "groups" | "activeCount" | "onClear">> = ({ groups, activeCount, onClear }) => {
  const menuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target) && menuRef.current) menuRef.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menuRef.current?.open) {
        menuRef.current.open = false;
        menuRef.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, []);
  return (
      <details ref={menuRef} className="profile-progression-filter-menu">
        <summary aria-label="Filters" title="Filters">
          <Filter aria-hidden />
          <span className="sr-only">Filters</span>
          {activeCount > 0 && <b className="profile-number">{activeCount}</b>}
        </summary>
        <div className={`profile-progression-filter-popover${groups.length === 1 ? " is-single-group" : ""}`}>
          {groups.map((group) => (
            <fieldset key={group.legend}>
              <legend>{group.legend}</legend>
              <div>
                {group.options.map((option) => (
                  <label
                    className={[
                      option.disabled ? "is-disabled" : "",
                      option.selected ? "is-selected" : "",
                      option.icon ? "has-icon" : "",
                    ].filter(Boolean).join(" ") || undefined}
                    style={{ "--profile-filter-accent": option.accent ?? "#38c7f4" } as React.CSSProperties}
                    title={option.disabled ? "No matches with the current filters" : undefined}
                    key={option.id}
                  >
                    <input
                      type="checkbox"
                      checked={option.selected}
                      disabled={option.disabled}
                      onChange={option.onToggle}
                    />
                    {option.icon && <span className="profile-progression-filter-option-icon" aria-hidden>{option.icon}</span>}
                    <span>{option.label}</span>
                    <small className="profile-number">{option.count.toLocaleString()}</small>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          {activeCount > 0 && (
            <button type="button" onClick={onClear}>
              <X aria-hidden />
              Clear filters
            </button>
          )}
        </div>
      </details>
  );
};

export default ProfileProgressionFilters;
