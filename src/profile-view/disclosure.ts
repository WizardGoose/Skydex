import { useEffect, useState } from "react";

const DISCLOSURE_KEY = "skydex.devkit.profile-disclosures.v1";

const readDisclosure = (id: string): boolean | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.localStorage.getItem(DISCLOSURE_KEY);
    if (!stored) return undefined;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const value = (parsed as Record<string, unknown>)[id];
    return typeof value === "boolean" ? value : undefined;
  } catch {
    return undefined;
  }
};

const writeDisclosure = (id: string, expanded: boolean): void => {
  if (typeof window === "undefined") return;
  try {
    const stored = window.localStorage.getItem(DISCLOSURE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : {};
    const disclosures = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
    window.localStorage.setItem(DISCLOSURE_KEY, JSON.stringify({ ...disclosures, [id]: expanded }));
  } catch {
    // Storage can be unavailable in private browsing; local state still works.
  }
};

export const usePersistentDisclosure = (id: string, initiallyExpanded: boolean) => {
  const [expanded, setExpanded] = useState(() => readDisclosure(id) ?? initiallyExpanded);
  useEffect(() => writeDisclosure(id, expanded), [expanded, id]);
  return [expanded, setExpanded] as const;
};
