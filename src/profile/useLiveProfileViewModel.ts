import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  itemResourceVersion,
  requestItemResource,
  resourceNameFor,
  resourceTierFor,
  subscribeItemResource,
} from "../items/itemResource";
import { requestSkillIcons, useSkillIcons } from "../island/skillIcons";
import { requestSkillDefs, useSkillDefs } from "../island/skills";
import { useApiAccess } from "../island/apiKey";
import type { IslandChest } from "../island/types";
import { useNetworth, useParsedProfile, type SkyBlockProfileOption } from "../networth/useNetworth";
import { buildProfileViewModel, type ProfileViewModel } from "./profileViewModel";

const NO_CHESTS: readonly IslandChest[] = [];

export interface LiveProfileViewModel {
  /** Keeps local companion/manual holdings out of public player lookups. */
  scope: "personal" | "public";
  model: ProfileViewModel | null;
  /** Sanitized profile data shared by the secondary Profile tabs. */
  profile: ReturnType<typeof useParsedProfile>;
  /** The existing valuation view without companion-only island chests. */
  networth: ReturnType<typeof useNetworth>;
  status: ReturnType<typeof useParsedProfile>["profileStatus"];
  error: string | null;
  refresh: (force?: boolean) => Promise<void>;
  profiles: readonly SkyBlockProfileOption[];
  selectedProfileId: string | null;
  selectProfile: (profileId: string) => void;
  skillMetadataStatus: "ready" | "loading" | "error";
}

/**
 * One React face for the redesigned profile. It reuses the existing cached
 * profile store and only composes keyless metadata around that one pull.
 */
export const useLiveProfileViewModel = (): LiveProfileViewModel => {
  const { setProfileId } = useApiAccess();
  const profile = useParsedProfile();
  const networth = useNetworth(NO_CHESTS);
  const skills = useSkillDefs();
  const skillIcons = useSkillIcons();
  const resourceVersion = useSyncExternalStore(
    subscribeItemResource,
    itemResourceVersion,
    itemResourceVersion,
  );

  useEffect(() => {
    requestSkillDefs();
    requestSkillIcons();
    requestItemResource();
  }, []);

  const model = useMemo(() => {
    // The lookup functions are stable module functions. The version is the
    // signal that their backing resource changed and this projection must run.
    void resourceVersion;
    if (
      profile.parsed === null ||
      profile.facts === null ||
      profile.apiDetails === null ||
      profile.coverage === null
    ) return null;
    return buildProfileViewModel({
      playerName: profile.playerName,
      playerUuid: profile.playerUuid,
      profileName: profile.profileName,
      gameMode: profile.gameMode,
      fetchedAt: profile.fetchedAt,
      facts: profile.facts,
      apiDetails: profile.apiDetails,
      parsed: profile.parsed,
      gearLoadouts: profile.gearLoadouts,
      coverage: profile.coverage,
      networth: networth.result,
      skillDefs: skills.defs,
      skillIcons: skillIcons.icons,
      itemNameFor: resourceNameFor,
      itemTierFor: resourceTierFor,
    });
  }, [
    profile.parsed,
    profile.facts,
    profile.apiDetails,
    profile.coverage,
    profile.playerName,
    profile.playerUuid,
    profile.profileName,
    profile.gameMode,
    profile.fetchedAt,
    profile.gearLoadouts,
    networth.result,
    skills.defs,
    skillIcons.icons,
    resourceVersion,
  ]);

  return {
    scope: "personal",
    model,
    profile,
    networth,
    status: profile.profileStatus,
    error: profile.error,
    refresh: networth.refresh,
    profiles: profile.profileOptions,
    selectedProfileId: profile.profileId,
    selectProfile: setProfileId,
    skillMetadataStatus: skills.defs ? "ready" : skills.status === "loading" ? "loading" : "error",
  };
};
