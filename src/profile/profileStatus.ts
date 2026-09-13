/**
 * Truthful rendering state for API-backed Profile data.
 *
 * `hasCache` is intentionally separate from `status`: a refresh can be in
 * flight, or can fail, while the last successful profile is still the only
 * honest data available to render. Consumers should use this view rather than
 * treating an empty parsed object as a successful empty profile.
 */

export type ProfileLoadStatus = "idle" | "needsKey" | "loading" | "ready" | "error";

export type ProfileDataPhase = "no-key" | "loading" | "ready" | "stale" | "error";

export interface ProfileStatusView {
  status: ProfileLoadStatus;
  phase: ProfileDataPhase;
  hasCache: boolean;
  dataVisible: boolean;
  isStale: boolean;
  showSkeleton: boolean;
  showNoKey: boolean;
  showError: boolean;
  /** Copy suitable for a compact status line; null means no status line. */
  label: string | null;
}

/**
 * Derive the shell branch from the request state and cache presence.
 *
 * In particular:
 *   loading + no cache   -> final-layout skeleton
 *   loading + cache      -> cached data with a refresh label
 *   error + cache        -> cached data with stale/error label
 *   error + no cache     -> explicit error, never an empty success shell
 *   needsKey             -> explicit Settings guidance, even when a cache exists
 */
export const profileStatusView = (status: ProfileLoadStatus, hasCache: boolean): ProfileStatusView => {
  if (status === "needsKey") {
    return {
      status,
      phase: hasCache ? "stale" : "no-key",
      hasCache,
      dataVisible: hasCache,
      isStale: hasCache,
      showSkeleton: false,
      showNoKey: true,
      showError: false,
      label: hasCache
        ? "Cached profile data. Connect your Minecraft profile in Settings to refresh."
        : "Connect your Minecraft profile in Settings to load your profile.",
    };
  }

  if (status === "loading") {
    return {
      status,
      phase: hasCache ? "stale" : "loading",
      hasCache,
      dataVisible: hasCache,
      isStale: hasCache,
      showSkeleton: !hasCache,
      showNoKey: false,
      showError: false,
      label: hasCache ? "Refreshing profile data..." : null,
    };
  }

  if (status === "error") {
    return {
      status,
      phase: hasCache ? "stale" : "error",
      hasCache,
      dataVisible: hasCache,
      isStale: hasCache,
      showSkeleton: false,
      showNoKey: false,
      showError: true,
      label: hasCache ? "Showing cached profile data. Refresh failed." : "Profile data could not be loaded.",
    };
  }

  if (status === "ready") {
    return {
      status,
      phase: hasCache ? "ready" : "error",
      hasCache,
      dataVisible: hasCache,
      isStale: false,
      showSkeleton: false,
      showNoKey: false,
      showError: !hasCache,
      label: hasCache ? null : "Profile data is unavailable.",
    };
  }

  // `idle` is only observable for the tick before the first effect. Treat it
  // like loading so a component can never paint a successful-looking blank.
  return {
    status,
    phase: hasCache ? "ready" : "loading",
    hasCache,
    dataVisible: hasCache,
    isStale: false,
    showSkeleton: !hasCache,
    showNoKey: false,
    showError: false,
    label: hasCache ? null : null,
  };
};
