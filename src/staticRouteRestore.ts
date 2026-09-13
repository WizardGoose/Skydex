interface StaticRouteWindow {
  location: { pathname: string; search: string; hash: string };
  sessionStorage: Pick<Storage, "getItem" | "removeItem">;
  history: Pick<History, "state" | "replaceState">;
}

/** Restore the static host's 404 handoff before the router reads its location. */
export function restoreStaticRoute(target: StaticRouteWindow): void {
  try {
    const pending = target.sessionStorage.getItem("pathToRedirect");
    if (pending === null) return;
    // Consume even an already-restored or stale entry, including on dev reloads.
    target.sessionStorage.removeItem("pathToRedirect");

    const current = target.location.pathname + target.location.search + target.location.hash;
    // 404.html hands off at `/`. An explicit deep link must win over old state.
    if (current !== "/" || pending === "/") return;
    if (
      !pending.startsWith("/")
      || pending.startsWith("//")
      || pending.includes("\\")
      || [...pending].some((character) => character.charCodeAt(0) <= 32)
    ) return;

    target.history.replaceState(target.history.state, "", pending);
  } catch {
    // Blocked storage or an invalid history entry must not stop app startup.
  }
}
