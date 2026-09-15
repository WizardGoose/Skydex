export type GreenhouseTool = "planner" | "solver" | "designer";

const TOOLS = new Set<GreenhouseTool>(["planner", "solver", "designer"]);

export function parseGreenhouseHash(
  hash: string,
): { tool: GreenhouseTool; search: string } {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  const queryAt = fragment.indexOf("?");
  const rawTool = queryAt === -1 ? fragment : fragment.slice(0, queryAt);
  const search = queryAt === -1 ? "" : fragment.slice(queryAt);
  const tool = TOOLS.has(rawTool as GreenhouseTool)
    ? (rawTool as GreenhouseTool)
    : "planner";
  return { tool, search };
}

const targetFromSearch = (search: string): string | null => {
  const match = search.match(/[?&]target=([^&]*)/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
};

/** Reads the Planner target carried by either form of a Greenhouse deep link. */
export function greenhouseTargetFromLocation(
  hash: string,
  search = "",
): string | null {
  const route = parseGreenhouseHash(hash);
  if (route.tool !== "planner") return null;
  return targetFromSearch(route.search) ?? targetFromSearch(search);
}

export function greenhouseHref(tool: GreenhouseTool, search = ""): string {
  const suffix = search && !search.startsWith("?") ? `?${search}` : search;
  return `/greenhouse#${tool}${suffix}`;
}

export function legacyGreenhouseHref(
  pathname: string,
  search: string,
): string | null {
  if (pathname === "/greenhouse/planner") {
    return greenhouseHref("planner", search);
  }
  if (pathname === "/greenhouse/designer") {
    return greenhouseHref("designer", search);
  }
  return null;
}

/*
 * Lives here rather than in designerRoute because App.tsx needs it on the
 * entry path: designerRoute also exports the layout decoders, which pull in
 * designEncoding and pako. Keeping this pure location builder beside the
 * other dependency-free href helpers keeps that compression stack out of the
 * startup bundle.
 */
export function sharedDesignerLocation(layoutCode: string) {
  return {
    pathname: "/greenhouse",
    search: `?layout=${encodeURIComponent(layoutCode)}`,
    hash: "#designer",
  };
}
