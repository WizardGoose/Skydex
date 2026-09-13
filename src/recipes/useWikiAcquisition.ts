import { useEffect, useState } from "react";
import {
  fetchLocationGroups,
  groupFromLocation,
  type LocationIndex,
} from "../accessories/locations";
import type { AccessoryGroup } from "../accessories/grouping";
import { fetchWikiFacts } from "../accessories/sources";
import type { WikiAcquisitionFacts } from "./acquisition";

export type WikiAcquisitionState =
  | { status: "idle" | "loading"; facts: null }
  | { status: "ready"; facts: WikiAcquisitionFacts };

const cache = new Map<string, WikiAcquisitionFacts>();
const normalise = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const PARK_FORAGING_ZONES = new Set([
  "thepark",
  "birchpark",
  "sprucewoods",
  "darkthicket",
  "savannawoodland",
  "jungleisland",
  "howlingcave",
]);

export function activityFromWikiLocations(
  locations: readonly string[],
  locationGroups: LocationIndex,
): AccessoryGroup | null {
  const zones = locations.filter((location) => location.startsWith("zone:"));
  const isParkForagingZone = zones.some((location) =>
    PARK_FORAGING_ZONES.has(normalise(location.slice(location.indexOf(":") + 1)))
  );

  // The Park is historically filed by the wiki as a Mining island, but these
  // subzones describe the Foraging activity the player is actually doing.
  if (isParkForagingZone) return "foraging";

  // When an article gives a real zone, that zone owns the activity. Falling
  // through to a merchant elsewhere can confidently put a route in the wrong
  // activity, which is worse than leaving the heading out.
  return groupFromLocation(zones.length > 0 ? zones : locations, locationGroups);
}

const recordValue = <T,>(record: Record<string, T>, name: string): T | undefined => {
  const wanted = normalise(name);
  const exact = Object.entries(record).find(([key]) => normalise(key) === wanted);
  return exact?.[1] ?? Object.values(record)[0];
};

export function useWikiAcquisition(name: string | null): WikiAcquisitionState {
  const [state, setState] = useState<WikiAcquisitionState>(() => {
    if (!name) return { status: "idle", facts: null };
    const known = cache.get(normalise(name));
    return known ? { status: "ready", facts: known } : { status: "loading", facts: null };
  });

  useEffect(() => {
    if (!name) {
      setState({ status: "idle", facts: null });
      return;
    }
    const key = normalise(name);
    const known = cache.get(key);
    if (known) {
      setState({ status: "ready", facts: known });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading", facts: null });
      void fetchWikiFacts([name], controller.signal).then(async (wiki) => {
        if (controller.signal.aborted) return;
        const locations = recordValue(wiki.locations, name) ?? [];
        const locationGroups = await fetchLocationGroups(locations, controller.signal);
        if (controller.signal.aborted) return;
        const facts: WikiAcquisitionFacts = {
          source: recordValue(wiki.sources, name) ?? null,
          locations,
          activity: activityFromWikiLocations(locations, locationGroups),
          event: recordValue(wiki.events, name) ?? null,
        };
        cache.set(key, facts);
        setState({ status: "ready", facts });
      }).catch(() => {
        if (controller.signal.aborted) return;
        const facts: WikiAcquisitionFacts = { source: null, locations: [], activity: null, event: null };
        cache.set(key, facts);
        setState({ status: "ready", facts });
      });

    return () => {
      controller.abort();
    };
  }, [name]);

  return state;
}
