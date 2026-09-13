export interface PublicPageMetadata {
  path: `/${string}`;
  label: string;
  description: string;
}

export const PUBLIC_PAGE_METADATA: readonly PublicPageMetadata[] = [
  {
    path: "/profile",
    label: "Profile",
    description:
      "View Hypixel SkyBlock profiles, stats, accessories, island progress, and net worth.",
  },
  {
    path: "/recipes",
    label: "Recipes",
    description: "Compare Hypixel SkyBlock crafting, Forge, shop, market, and acquisition routes with Skydex.",
  },
  {
    path: "/storage",
    label: "Storage",
    description: "Browse inventory, sacks, backpacks, and island chests captured by the Skydex mod.",
  },
  {
    path: "/forge",
    label: "Forge",
    description:
      "Plan Hypixel SkyBlock Forge recipes, materials, costs, and timers.",
  },
  {
    path: "/greenhouse",
    label: "Greenhouse",
    description:
      "Plan, solve, and share Hypixel SkyBlock Greenhouse mutation layouts.",
  },
  {
    path: "/shards",
    label: "Shards",
    description:
      "Track shards, plan fusions, and browse Hypixel SkyBlock shard recipes.",
  },
] as const;

const METADATA_START = "<!-- SKYDEX_PAGE_METADATA_START -->";
const METADATA_END = "<!-- SKYDEX_PAGE_METADATA_END -->";
const SITE_ORIGIN = "https://skydex.ca";
const SITE_ICON = `${SITE_ORIGIN}/favicon/favicon.png`;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const pageMetadataBlock = (page: PublicPageMetadata): string => {
  const pageTitle = `${page.label} Page`;
  const browserTitle = `${pageTitle} — Skydex`;
  const canonicalUrl = `${SITE_ORIGIN}${page.path}`;
  const title = escapeHtml(pageTitle);
  const description = escapeHtml(page.description);

  return `${METADATA_START}
    <title>${escapeHtml(browserTitle)}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta property="og:site_name" content="Skydex" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${SITE_ICON}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="128" />
    <meta property="og:image:height" content="128" />
    <meta property="og:image:alt" content="Skydex icon" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="twitter:image" content="${SITE_ICON}" />
    ${METADATA_END}`;
};

export const renderPageMetadataHtml = (
  html: string,
  page: PublicPageMetadata,
): string => {
  const start = html.indexOf(METADATA_START);
  const end = html.indexOf(METADATA_END);

  if (start === -1 || end === -1 || end < start) {
    throw new Error("Skydex page metadata markers are missing from index.html");
  }

  const afterEnd = end + METADATA_END.length;
  return `${html.slice(0, start)}${pageMetadataBlock(page)}${html.slice(afterEnd)}`;
};
