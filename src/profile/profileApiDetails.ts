import { readSlayerLevels } from "../accessories/requirements";

/**
 * The profile facts that are not item blobs and do not belong to the generic
 * skill summary. They are projected while the authenticated member payload is
 * already in hand so profile screens never need a second Hypixel request or a
 * copy of the raw member object.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export interface ProfileSlayerDetail {
  /** Hypixel's own boss key. Unknown future keys remain intact. */
  key: string;
  level: number;
  xp: number | null;
}

export interface ProfileTimecharmDetail {
  /** Hypixel's own trophy type. Unknown future types remain intact. */
  key: string;
  timestamp: number | null;
  visits: number | null;
}

export interface ProfileApiDetails {
  /** Null means the member payload did not expose the section. */
  slayers: ProfileSlayerDetail[] | null;
  /** Null means the Rift gallery was not exposed. An empty array is a real empty gallery. */
  securedTimecharms: ProfileTimecharmDetail[] | null;
}

export const EMPTY_PROFILE_API_DETAILS: ProfileApiDetails = {
  slayers: null,
  securedTimecharms: null,
};

const finiteNonNegative = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export const readProfileApiDetails = (member: unknown): ProfileApiDetails => {
  if (!isRecord(member)) return EMPTY_PROFILE_API_DETAILS;

  const levels = readSlayerLevels(member);
  const slayer = isRecord(member.slayer) ? member.slayer : null;
  const bosses = slayer && isRecord(slayer.slayer_bosses) ? slayer.slayer_bosses : null;
  const slayers = levels === null
    ? null
    : Object.entries(levels).map(([key, level]) => {
        const detail = bosses && isRecord(bosses[key]) ? bosses[key] : null;
        return { key, level, xp: finiteNonNegative(detail?.xp) };
      });

  const rift = isRecord(member.rift) ? member.rift : null;
  const gallery = rift && isRecord(rift.gallery) ? rift.gallery : null;
  const trophies = gallery?.secured_trophies;
  let securedTimecharms: ProfileTimecharmDetail[] | null = null;
  if (Array.isArray(trophies)) {
    const seen = new Set<string>();
    securedTimecharms = [];
    for (const trophy of trophies) {
      if (!isRecord(trophy) || typeof trophy.type !== "string") continue;
      const key = trophy.type.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      securedTimecharms.push({
        key,
        timestamp: finiteNonNegative(trophy.timestamp),
        visits: finiteNonNegative(trophy.visits),
      });
    }
  }

  return { slayers, securedTimecharms };
};
