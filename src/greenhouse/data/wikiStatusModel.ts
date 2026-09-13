import { WIKI_REFRESH_BLOCKED } from "./wikiSync";

/** "just now", "3h ago", "2d ago". */
export const wikiAge = (ts: number, now = Date.now()): string => {
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 90) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

/** A truthful short label for the data currently usable by the planner. */
export const wikiStatusLabel = (
  state: { syncing: boolean; error: string | null; fetchedAt: number | null },
  now = Date.now()
): string => {
  if (state.syncing) return "syncing";
  if (state.error === WIKI_REFRESH_BLOCKED) {
    return state.fetchedAt
      ? `wiki data ${wikiAge(state.fetchedAt, now)} · live refresh blocked`
      : "bundled data · live refresh blocked";
  }
  if (state.error) return state.fetchedAt ? `wiki data ${wikiAge(state.fetchedAt, now)} · refresh failed` : "bundled data · refresh failed";
  if (state.fetchedAt) return `wiki ${wikiAge(state.fetchedAt, now)}`;
  return "bundled data";
};
