import { extractLayoutCode } from "./utilities/layoutCode";
import { parseGreenhouseHash } from "./route";

/** Returns the Designer payload from either the canonical fragment or a legacy query. */
export function layoutCodeFromDesignerLocation(hash: string, search: string): string | null {
  const fragment = parseGreenhouseHash(hash);
  if (fragment.tool === "designer" && fragment.search) {
    return extractLayoutCode(fragment.search);
  }
  return new URLSearchParams(search).get("layout");
}

/** Prevents React's development effect replay from importing the same shared layout twice. */
export function nextDesignerLayoutCode(
  lastProcessedCode: string | null,
  hash: string,
  search: string,
): string | null {
  const next = layoutCodeFromDesignerLocation(hash, search);
  return next && next !== lastProcessedCode ? next : null;
}

/** The app destination behind a crawler-visible, stateless share path. */
export function sharedDesignerLocation(layoutCode: string) {
  return {
    pathname: "/greenhouse",
    search: `?layout=${encodeURIComponent(layoutCode)}`,
    hash: "#designer",
  };
}
