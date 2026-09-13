import { useEffect, useState, useSyncExternalStore } from "react";
import { itemResourceVersion, requestItemResource, subscribeItemResource } from "./itemResource";
import { cachedItemLore, itemLoreId, loadItemLore, type GameItemLore } from "./itemLore";

/** Mounted with the open tooltip, so browsing a shelf never fetches every item's lore. */
export function useItemLore(id: string | null, name: string, tier?: string | null) {
  useSyncExternalStore(subscribeItemResource, itemResourceVersion, itemResourceVersion);
  const key = id ? itemLoreId(id, name) : null;
  const identity = `${key ?? ""}|${tier ?? ""}`;
  const [resolved, setResolved] = useState<{ key: string; item: GameItemLore | null } | null>(null);
  useEffect(() => {
    if (!key) return;
    let current = true;
    requestItemResource();
    void loadItemLore(key, tier).then(item => { if (current) setResolved({ key: identity, item }); });
    return () => { current = false; };
  }, [key, identity, tier]);
  const item = key ? cachedItemLore(key, tier) ?? (resolved?.key === identity ? resolved.item : null) : null;
  return { item, loading: Boolean(key && !item && resolved?.key !== identity), unavailable: Boolean(key && !item && resolved?.key === identity) };
}
