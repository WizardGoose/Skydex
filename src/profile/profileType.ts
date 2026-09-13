import { useCallback, useSyncExternalStore } from "react";
import { useProfile, type GameMode, type ModeSource } from "./useProfile";

/**
 * Converter is a profile identity, not a third economy model.
 *
 * A converted Ironman can use the Bazaar, Auction House and trading, so every
 * calculation must continue to receive `normal`. The small flavour key keeps
 * the tutorial joke and the Settings selection in step without giving any
 * calculation a value it could accidentally branch on.
 */
export const PROFILE_TYPE_FLAVOUR_KEY = "skydex.mode-flavour.v1";
const CONVERTER = "converter";

export type ProfileType = GameMode | typeof CONVERTER;

const readConverter = (): boolean => {
  try {
    return localStorage.getItem(PROFILE_TYPE_FLAVOUR_KEY) === CONVERTER;
  } catch {
    return false;
  }
};

let converter = readConverter();
const listeners = new Set<() => void>();

const publishConverter = (next: boolean): void => {
  if (converter === next) return;
  converter = next;
  for (const listener of listeners) listener();
};

const writeConverter = (next: boolean): void => {
  try {
    if (next) localStorage.setItem(PROFILE_TYPE_FLAVOUR_KEY, CONVERTER);
    else localStorage.removeItem(PROFILE_TYPE_FLAVOUR_KEY);
  } catch {
    // Losing storage loses only the joke label on the next visit.
  }
  publishConverter(next);
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === PROFILE_TYPE_FLAVOUR_KEY) publishConverter(event.newValue === CONVERTER);
  });
}

export const profileTypeFor = (mode: GameMode, source: ModeSource, converterSelected: boolean): ProfileType =>
  mode === "normal" && source === "manual" && converterSelected ? CONVERTER : mode;

export const useProfileType = () => {
  const profile = useProfile();
  const { setMode, clearOverride: clearModeOverride } = profile;
  const converterSelected = useSyncExternalStore(subscribe, () => converter, () => converter);
  const profileType = profileTypeFor(profile.mode, profile.source, converterSelected);

  const setProfileType = useCallback(
    (next: ProfileType) => {
      writeConverter(next === CONVERTER);
      setMode(next === "ironman" ? "ironman" : "normal");
    },
    [setMode],
  );

  const clearOverride = useCallback(() => {
    writeConverter(false);
    clearModeOverride();
  }, [clearModeOverride]);

  return { ...profile, profileType, setProfileType, clearOverride };
};
