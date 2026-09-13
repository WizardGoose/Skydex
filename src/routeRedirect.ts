import { profileTabFromSearch } from "./profile/profileTabs";

export interface RedirectLocation {
  search?: string;
  hash?: string;
}

/** Keep bookmark state intact while moving a legacy route to its canonical path. */
export const preservedRedirectTarget = (pathname: string, location: RedirectLocation) => ({
  pathname,
  search: location.search ?? "",
  hash: location.hash ?? "",
});

/**
 * The pre-Home Profile lived at `/` and stored its selected section in `tab`.
 * Keep those bookmarks useful without treating unrelated Home query state as a
 * Profile route.
 */
export const legacyProfileRedirectTarget = (location: RedirectLocation) =>
  profileTabFromSearch(location.search ?? "") === null
    ? null
    : preservedRedirectTarget("/profile", location);

export interface LocalReviewLocation {
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
}

/**
 * Keep the local review build on one browser-storage origin.
 *
 * Browsers correctly isolate `localhost` from `127.0.0.1`, but that split made
 * the same port appear to lose its linked companion snapshot depending on how
 * an agent spelled the address. The review server's established cache lives on
 * 127.0.0.1, so only localhost:7070 is folded into that canonical origin.
 */
export const canonicalLocalReviewUrl = (location: LocalReviewLocation): string | null => {
  if (location.hostname !== "localhost" || location.port !== "7070") return null;
  return `${location.protocol}//127.0.0.1:7070${location.pathname}${location.search}${location.hash}`;
};
