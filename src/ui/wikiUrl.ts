const WIKI = "https://hypixelskyblock.minecraft.wiki";

export const wikiArticleName = (name: string): string =>
  name
    .replace(/§[0-9a-fk-or]/gi, "")
    .replace(/%{1,2}[a-z_]+%%/gi, "")
    .replace(/\s+/g, " ")
    .trim();

export const wikiArticleUrl = (name: string): string =>
  `${WIKI}/wiki/${encodeURIComponent(wikiArticleName(name).replace(/ /g, "_"))}`;
