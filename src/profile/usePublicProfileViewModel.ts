import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { resolveAccount } from "../island/hypixel";
import { requestSkillIcons, useSkillIcons } from "../island/skillIcons";
import { requestSkillDefs, useSkillDefs } from "../island/skills";
import { itemResourceVersion, requestItemResource, resourceNameFor, resourceTierFor, subscribeItemResource } from "../items/itemResource";
import { RULES_VERSION } from "../networth/constants";
import { calculateNetworth } from "../networth/profileNetworth";
import { pricesState } from "../networth/prices";
import {
  loadProfileSources,
  type NetworthStatus,
  type ParsedProfileView,
  type NetworthView,
  type ProfileSources,
} from "../networth/useNetworth";
import { profileStatusView } from "./profileStatus";
import { buildProfileViewModel } from "./profileViewModel";
import type { LiveProfileViewModel } from "./useLiveProfileViewModel";

interface PublicProfileState {
  status: NetworthStatus;
  sources: ProfileSources | null;
  error: string | null;
}

const EMPTY_STATE: PublicProfileState = { status: "idle", sources: null, error: null };

/**
 * A route-scoped public profile reader. It deliberately owns no localStorage
 * key and never touches useApiAccess, so a lookup cannot change the account
 * behind the visitor's personal /profile page.
 */
export const usePublicProfileViewModel = (
  player: string,
  requestedProfileId: string | null,
  selectProfile: (profileId: string) => void,
): LiveProfileViewModel => {
  const [state, setState] = useState<PublicProfileState>(EMPTY_STATE);
  const requestRef = useRef<AbortController | null>(null);
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

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const input = player.trim();
    if (!input) {
      setState(EMPTY_STATE);
      return;
    }

    setState({ status: "loading", sources: null, error: null });
    const account = await resolveAccount(input, controller.signal);
    if (controller.signal.aborted) return;
    if (!account.ok) {
      setState({ status: "error", sources: null, error: account.error.message });
      return;
    }

    try {
      const sources = await loadProfileSources({
        key: "",
        uuid: account.value.uuid,
        name: account.value.name || input,
        profileId: requestedProfileId,
      }, controller.signal);
      if (controller.signal.aborted) return;
      setState({ status: "ready", sources, error: null });
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({
        status: "error",
        sources: null,
        error: error instanceof Error && error.message.trim()
          ? error.message
          : "That SkyBlock profile could not be loaded.",
      });
    }
  }, [player, requestedProfileId]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  const status = profileStatusView(state.status, state.sources !== null);
  const profile = useMemo<ParsedProfileView>(() => {
    const sources = state.sources;
    return {
      parsed: sources?.items ?? null,
      catalogue: sources?.catalogue ?? null,
      inventoryLayouts: sources?.inventoryLayouts ?? null,
      facts: sources?.facts ?? null,
      gearLoadouts: sources?.gearLoadouts ?? {
        armorSets: [],
        equippedArmorSetId: null,
        equipmentSets: [],
        wornEquipment: [null, null, null, null],
        equippedEquipmentSetId: null,
        loadouts: [],
      },
      apiDetails: sources?.apiDetails ?? null,
      pbc: sources?.pbc ?? null,
      rift: sources?.rift ?? null,
      museumApi: sources?.museumApi ?? null,
      dungeons: sources?.dungeons ?? null,
      crimson: sources?.crimson ?? null,
      garden: sources?.garden ?? null,
      profileCoop: sources?.profileCoop ?? null,
      playerName: sources?.playerName ?? null,
      playerUuid: sources?.playerUuid ?? null,
      profileId: sources?.profileId ?? null,
      profileName: sources?.profileName ?? null,
      gameMode: sources?.gameMode ?? null,
      profileOptions: sources?.profileOptions ?? [],
      minions: sources?.minions ?? null,
      fetchedAt: sources?.fetchedAt ?? null,
      coverage: sources?.coverage ?? null,
      status: state.status,
      error: state.error,
      profileStatus: status,
    };
  }, [state.error, state.sources, state.status, status]);

  const networth = useMemo<NetworthView>(() => {
    const sources = state.sources;
    const priceView = pricesState();
    return {
      result: sources ? calculateNetworth(sources.items, sources.coins, {
        prices: sources.prices,
        catalogue: sources.catalogue,
      }) : null,
      parsed: sources?.items ?? null,
      fetchedAt: sources?.fetchedAt ?? null,
      chests: [],
      status: state.status,
      error: state.error,
      coverage: sources?.coverage ?? null,
      profileStatus: status,
      profileName: sources?.profileName ?? null,
      pricesAt: priceView.snapshot?.fetchedAt ?? null,
      pricesFrom: priceView.snapshot?.from ?? null,
      pricesError: priceView.error,
      pricesLoading: priceView.status === "loading",
      rulesVersion: RULES_VERSION,
      refresh: load,
    };
  }, [load, state.error, state.sources, state.status, status]);

  const model = useMemo(() => {
    void resourceVersion;
    const sources = state.sources;
    if (!sources) return null;
    const result = calculateNetworth(sources.items, sources.coins, {
      prices: sources.prices,
      catalogue: sources.catalogue,
    });
    return buildProfileViewModel({
      playerName: sources.playerName,
      playerUuid: sources.playerUuid,
      profileName: sources.profileName,
      gameMode: sources.gameMode,
      fetchedAt: sources.fetchedAt,
      facts: sources.facts,
      apiDetails: sources.apiDetails,
      parsed: sources.items,
      gearLoadouts: sources.gearLoadouts,
      coverage: sources.coverage,
      networth: result,
      skillDefs: skills.defs,
      skillIcons: skillIcons.icons,
      itemNameFor: resourceNameFor,
      itemTierFor: resourceTierFor,
    });
  }, [resourceVersion, skillIcons.icons, skills.defs, state.sources]);

  return {
    scope: "public",
    model,
    profile,
    networth,
    status,
    error: state.error,
    refresh: load,
    profiles: state.sources?.profileOptions ?? [],
    selectedProfileId: state.sources?.profileId ?? requestedProfileId,
    selectProfile,
    skillMetadataStatus: skills.defs ? "ready" : skills.status === "loading" ? "loading" : "error",
  };
};
