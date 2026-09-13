import { SECTION_KEYS, type FeedSet, type IslandFeed, type SectionKey, type SectionState } from "./merge";

const absentSections = (): Record<SectionKey, SectionState> =>
  Object.fromEntries(SECTION_KEYS.map((key) => [key, "absent" as const])) as Record<SectionKey, SectionState>;

/**
 * Remove only observed item containers from one persisted feed.
 * Profile identity and non-container snapshot fields, such as greenhouse data,
 * stay available; absent means "no longer captured", never "empty".
 */
export const clearContainerFeed = (feed: IslandFeed): IslandFeed => ({
  ...feed,
  snapshot: {
    ...feed.snapshot,
    sacks: {},
    chests: [],
    inventory: undefined,
    enderChest: undefined,
    storage: undefined,
  },
  sections: absentSections(),
});

/** Apply the same narrow reset to every persisted source without mutating it. */
export const clearContainerFeeds = (feeds: FeedSet): FeedSet => ({
  ...(feeds.mod ? { mod: clearContainerFeed(feeds.mod) } : {}),
  ...(feeds.api ? { api: clearContainerFeed(feeds.api) } : {}),
});
