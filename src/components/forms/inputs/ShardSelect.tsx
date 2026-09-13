import React, { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { FOCUS } from "../../../ui/kit";
import "./shard-select.css";

export type ShardSelectTone =
  | "neutral"
  | "teal"
  | "green"
  | "blue"
  | "violet"
  | "amber"
  | "orange"
  | "red"
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary";

export interface ShardSelectOption {
  value: string;
  label: string;
  icon: LucideIcon;
  tone?: ShardSelectTone;
}

interface ShardSelectProps {
  id?: string;
  value: string;
  options: readonly ShardSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * A real Skydex menu rather than a skinned native select.
 *
 * Native option popups are painted by the operating system, which is why the
 * old controls changed to a white/grey rectangle as soon as they opened. This
 * keeps the trigger and every option inside the same themed surface while
 * retaining button/listbox keyboard semantics.
 */
export const ShardSelect: React.FC<ShardSelectProps> = ({
  value,
  options,
  onChange,
  ariaLabel,
  id,
  className = "",
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];
  const SelectedIcon = selected?.icon;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>(".shards-select-trigger")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const moveOptionFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
    const optionButtons = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    if (optionButtons.length === 0) return;
    event.preventDefault();
    const currentIndex = optionButtons.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? optionButtons.length - 1
        : event.key === "ArrowDown"
          ? Math.min(optionButtons.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex < 0 ? optionButtons.length - 1 : currentIndex - 1);
    optionButtons[nextIndex]?.focus();
  };

  return (
    <div className={`shards-select${open ? " is-open" : ""}${className ? ` ${className}` : ""}`} ref={rootRef} onKeyDown={moveOptionFocus}>
      <button
        id={id}
        type="button"
        className={`shards-select-trigger ${FOCUS}`}
        aria-label={`${ariaLabel}: ${selected?.label ?? value}`}
        aria-haspopup="listbox"
        aria-controls={menuId}
        aria-expanded={open}
        data-tone={selected?.tone ?? "neutral"}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setOpen(true);
          window.requestAnimationFrame(() => {
            const optionButtons = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
            const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
            optionButtons[selectedIndex]?.focus();
          });
        }}
      >
        <span className="shards-select-glyph">{SelectedIcon && <SelectedIcon aria-hidden />}</span>
        <span className="shards-select-value">{selected?.label ?? value}</span>
        <ChevronDown className="shards-select-chevron" aria-hidden />
      </button>

      {open && (
        <div id={menuId} className="shards-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => {
            const Icon = option.icon;
            const optionSelected = option.value === value;
            return (
              <button
                type="button"
                role="option"
                aria-selected={optionSelected}
                className={optionSelected ? "is-selected" : ""}
                data-tone={option.tone ?? "neutral"}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                key={option.value}
              >
                <span className="shards-select-glyph"><Icon aria-hidden /></span>
                <span>{option.label}</span>
                {optionSelected && <Check className="shards-select-check" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
