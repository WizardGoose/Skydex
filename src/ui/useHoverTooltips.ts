import { useEffect, useState } from "react";

// Match the mobile layout and also cover large touch-only displays.
const HOVER_TOOLTIPS_QUERY = "(min-width: 821px) and (hover: hover) and (pointer: fine)";
let hoverQuery: MediaQueryList | undefined;
const subscribers = new Set<(enabled: boolean) => void>();

function getQuery() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
  return hoverQuery ??= window.matchMedia(HOVER_TOOLTIPS_QUERY);
}

function notifySubscribers() {
  const enabled = getQuery()?.matches ?? true;
  // One native callback lets React batch the whole catalogue. A separate
  // MediaQueryList listener per tile commits between callbacks in Chromium.
  for (const notify of subscribers) notify(enabled);
}

export function useHoverTooltips(): boolean {
  const [enabled, setEnabled] = useState(() => getQuery()?.matches ?? true);
  useEffect(() => {
    const query = getQuery();
    if (!query) return;
    if (subscribers.size === 0) query.addEventListener("change", notifySubscribers);
    subscribers.add(setEnabled);
    setEnabled(query.matches);
    return () => {
      subscribers.delete(setEnabled);
      if (subscribers.size === 0) query.removeEventListener("change", notifySubscribers);
    };
  }, []);
  return enabled;
}
