import React, { useEffect, useState } from "react";
import { ArrowRight, CornerDownLeft, Search } from "lucide-react";

export interface ProfileLookupFormProps {
  initialValue?: string;
  value?: string;
  compact?: boolean;
  iconOnly?: boolean;
  onValueChange?: (value: string) => void;
  onSubmit: (player: string) => void;
}

export const ProfileLookupForm: React.FC<ProfileLookupFormProps> = ({
  initialValue = "",
  value: controlledValue,
  compact = false,
  iconOnly = false,
  onValueChange,
  onSubmit,
}) => {
  const [localValue, setLocalValue] = useState(initialValue);
  const value = controlledValue ?? localValue;

  useEffect(() => {
    if (controlledValue === undefined) setLocalValue(initialValue);
  }, [controlledValue, initialValue]);

  return (
    <form
      className={`profile-lookup-form${compact ? " is-compact" : ""}${iconOnly ? " is-icon-only" : ""}`}
      role="search"
      aria-label="Search SkyBlock profiles"
      onSubmit={(event) => {
        event.preventDefault();
        const player = value.trim();
        if (player) onSubmit(player);
      }}
    >
      <Search aria-hidden />
      <input
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (controlledValue === undefined) setLocalValue(nextValue);
          onValueChange?.(nextValue);
        }}
        placeholder="Minecraft username or UUID"
        aria-label="Minecraft username or UUID"
        autoComplete="off"
        spellCheck={false}
      />
      <button type="submit" disabled={!value.trim()} aria-label="View SkyBlock profile">
        {!iconOnly && <span>{compact ? "View" : "View profile"}</span>}
        {iconOnly ? <CornerDownLeft aria-hidden /> : <ArrowRight aria-hidden />}
      </button>
    </form>
  );
};
