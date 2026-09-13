import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DEFAULT_PROFILE_TAB,
  PROFILE_TAB_TTL_MS,
  normaliseProfileTab,
  profileTabFromSearch,
  profileTabStorage,
  readRememberedProfileTab,
  selectProfileTab,
  type ProfileTab,
  type RememberedProfileTab,
} from "./profileTabs";

export interface ProfileTabsView {
  /** Canonical tab id. The `network` id maps to IslandPage's `networth` URL. */
  activeTab: ProfileTab;
  /** The canonical value read from the current URL, if one was supplied. */
  urlTab: ProfileTab | null;
  /** The unexpired session fallback, if one exists. */
  remembered: RememberedProfileTab | null;
  /** True when the active tab came from sessionStorage rather than the URL. */
  fromSession: boolean;
  /** Pushes a history entry and renews the five-minute session timestamp. */
  selectTab: (tab: ProfileTab) => void;
}

/**
 * React Router adapter for the pure Profile tab model.
 *
 * The URL stays authoritative while it exists, so browser back/forward is
 * naturally navigable. When a route arrives without `tab`, the fresh session
 * preference is used only as a fallback, so its five-minute expiry remains real.
 * A direct `?tab=` URL is never silently rewritten.
 */
export const useProfileTabs = (): ProfileTabsView => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [, setExpiryTick] = useState(0);
  const search = searchParams.toString();
  const storage = profileTabStorage();
  const urlTab = profileTabFromSearch(search);
  const remembered = readRememberedProfileTab(storage);
  const rememberedTab = remembered?.tab ?? null;
  const rememberedSelectedAt = remembered?.selectedAt ?? null;
  const activeTab = urlTab ?? rememberedTab ?? DEFAULT_PROFILE_TAB;

  // Make expiry observable for a mounted route that has no URL tab. Without a
  // timer, a preference could stay on screen forever simply because nothing
  // else caused React to render at the five-minute boundary.
  useEffect(() => {
    if (rememberedSelectedAt === null || urlTab) return;
    const delay = Math.max(0, rememberedSelectedAt + PROFILE_TAB_TTL_MS - Date.now());
    const timer = setTimeout(() => setExpiryTick((value) => value + 1), delay + 1);
    return () => clearTimeout(timer);
  }, [rememberedSelectedAt, urlTab]);

  const selectTab = useCallback(
    (tab: ProfileTab) => {
      // `normaliseProfileTab` is a defensive boundary for callers that have
      // bridged a label or legacy id into this callback. The public TypeScript
      // type already prevents invalid values in normal code.
      const canonical = normaliseProfileTab(tab) ?? DEFAULT_PROFILE_TAB;
      const nextSearch = selectProfileTab(search, canonical, storage);
      setSearchParams(new URLSearchParams(nextSearch), { replace: false });
    },
    [search, setSearchParams, storage]
  );

  return {
    activeTab,
    urlTab,
    remembered,
    fromSession: urlTab === null && remembered !== null,
    selectTab,
  };
};
