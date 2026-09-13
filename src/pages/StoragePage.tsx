import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ChevronDown, MapPin, Search, WifiOff } from "lucide-react";
import { slotLayout, totalItems } from "../island/aggregate";
import { useApiAccess } from "../island/apiKey";
import { withoutChrome } from "../island/chrome";
import { ago, describeSection, prettify } from "../island/format";
import type { SectionProvenance } from "../island/merge";
import type { IslandChest, IslandItem } from "../island/types";
import { useIsland } from "../island/useIsland";
import {
  itemResourceVersion,
  requestItemResource,
  resourceTierFor,
  subscribeItemResource,
} from "../items/itemResource";
import { useParsedProfile } from "../networth/useNetworth";
import { CharacterStage } from "../profile-view/CharacterStage";
import { ProfileIdentity } from "../profile-view/ProfileIdentity";
import { ItemIcon } from "../ui/ItemIcon";
import { SlotIcon } from "../island/SlotIcon";
import { ProfileItemTile } from "../profile-view/profile-sections/ProfileItemTile";
import { FOCUS, INPUT, recombDisplayTier } from "../ui/kit";
import {
  matches,
  type SlotContext,
  type SlotItem,
} from "../ui/slotGrid";
import "../profile-view/profile.css";
import "./storage-page.css";
import {
  chestIsExpanded,
  readChestDisclosureState,
  toggleChestDisclosure,
  writeChestDisclosureState,
} from "./storageDisclosure";
import { checkStorageIdentity } from "./storageIdentity";

const isObserved = (provenance: SectionProvenance): boolean =>
  provenance.state === "captured" || provenance.state === "empty";

const chestCapacity = (name: string): number => /large|double/i.test(name) ? 54 : 27;

const chestLabel = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed || /^(?:large |double )?chest$/i.test(trimmed)) {
    return chestCapacity(trimmed) === 54 ? "Large Chest" : "Chest";
  }
  return trimmed;
};

const chestKey = (chest: IslandChest): string => chest.pos.join(":");

const summarizeChests = (chests: readonly IslandChest[]) => {
  const itemTypes = new Set<string>();
  let occupiedSlots = 0;
  let totalCapacity = 0;
  let itemUnits = 0;

  for (const chest of chests) {
    const clean = withoutChrome(chest.items);
    occupiedSlots += clean.length;
    totalCapacity += chestCapacity(chest.name);
    for (const item of clean) {
      itemTypes.add(item.id);
      itemUnits += item.count;
    }
  }

  return {
    chests: chests.length,
    occupiedSlots,
    totalCapacity,
    itemTypes: itemTypes.size,
    itemUnits,
  };
};

const rolledItems = (items: readonly IslandItem[]): SlotItem[] =>
  [...totalItems(withoutChrome(items))]
    .map(([id, value]) => ({ id, name: value.name || prettify(id), count: value.count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));

const useSlotContext = (provenance: SectionProvenance, live: boolean): SlotContext => {
  const source = describeSection(provenance, live);
  const resourceVersion = useSyncExternalStore(
    subscribeItemResource,
    itemResourceVersion,
    itemResourceVersion,
  );

  useEffect(() => {
    requestItemResource();
  }, []);

  return useMemo(() => {
    void resourceVersion;
    return {
      tierOf: resourceTierFor,
      priceOf: () => null,
      provenance: source || null,
    };
  }, [resourceVersion, source]);
};

const StorageState: React.FC<{ provenance: SectionProvenance }> = ({ provenance }) => {
  const copy = provenance.state === "hidden"
    ? "Island chests are not shared by the current profile settings."
    : provenance.state === "empty"
      ? "Island chests were captured and are empty."
      : "Open an island chest in Minecraft and Skydex will capture it here.";
  return <p className="storage-empty-state" role="status">{copy}</p>;
};

const ContainerGrid: React.FC<{
  items: readonly IslandItem[];
  capacity: number;
  needle: string;
  context: SlotContext;
}> = ({ items, capacity, needle, context }) => {
  const clean = useMemo(() => withoutChrome(items), [items]);
  const cells = useMemo(() => slotLayout(clean, capacity), [capacity, clean]);
  const packed = useMemo(() => rolledItems(clean), [clean]);

  const slots = cells ?? packed;
  return <div className="storage-item-grid" aria-label={cells ? "Captured chest slots" : "Captured items, slot positions unavailable"}>
    {slots.map((item, index) => item ? <div key={index} className={needle && !matches(item, needle) ? "storage-slot is-dimmed" : "storage-slot"}>
      <ProfileItemTile id={item.id} name={item.name || prettify(item.id)} count={item.count} extra={item.extra}
        tier={recombDisplayTier(context.tierOf(item.id), item.extra?.recomb ?? false)} tierIsDisplayed provenance={context.provenance}
        iconElement={<SlotIcon id={item.id} name={item.name || prettify(item.id)} skin={item.extra?.skin} size={34} />}
        ariaLabel={`${item.name || prettify(item.id)}, ${item.count.toLocaleString()}: show item details`} />
    </div> : <div key={index} className="storage-slot is-empty" aria-label="Empty slot" />)}
  </div>;
};

const ChestCard: React.FC<{
  chest: IslandChest;
  needle: string;
  context: SlotContext;
  expanded: boolean;
  onToggle: () => void;
}> = ({ chest, needle, context, expanded, onToggle }) => {
  const clean = useMemo(() => withoutChrome(chest.items), [chest.items]);
  const searching = needle !== "";
  const hit = searching && clean.some((item) => matches(item, needle));
  const open = hit || expanded;
  const capacity = chestCapacity(chest.name);
  const total = clean.reduce((sum, item) => sum + item.count, 0);
  const key = chest.pos.join("-");
  const bodyId = `storage-chest-${key}`;

  return (
    <article className={`storage-chest-card profile-glass${open ? " is-open" : ""}${hit ? " is-hit" : ""}`}>
      <button
        type="button"
        className={`storage-chest-trigger ${FOCUS}`}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span className="storage-chest-icon" aria-hidden>
          <ItemIcon name={chestLabel(chest.name)} id="CHEST" size={32} fallback="blank" />
        </span>
        <span className="storage-chest-copy">
          <strong>{chestLabel(chest.name)}</strong>
          <small>
            <MapPin aria-hidden />
            {chest.pos.join(", ")} · {ago(chest.lastSeen)}
          </small>
        </span>
        <span className="storage-chest-count">
          {clean.length <= capacity ? `${clean.length} / ${capacity} slots` : `${clean.length} stacks`}
          <small>{total.toLocaleString()} items</small>
        </span>
        <ChevronDown aria-hidden />
      </button>
      {open && (
        <div id={bodyId} className="storage-slot-pane">
          {clean.length > 0 ? (
            <ContainerGrid items={chest.items} capacity={capacity} needle={needle} context={context} />
          ) : (
            <p className="storage-card-empty">Empty.</p>
          )}
        </div>
      )}
    </article>
  );
};

const ChestsPanel: React.FC<{
  chests: readonly IslandChest[];
  provenance: SectionProvenance;
  needle: string;
  live: boolean;
  persistenceScope: string;
}> = ({ chests, provenance, needle, live, persistenceScope }) => {
  const context = useSlotContext(provenance, live);
  const summary = useMemo(() => summarizeChests(chests), [chests]);
  const [disclosure, setDisclosure] = useState(() => readChestDisclosureState(persistenceScope));
  const visible = useMemo(() => {
    const ordered = [...chests].sort((left, right) => right.lastSeen - left.lastSeen);
    if (!needle) return ordered;
    return ordered.filter((chest) => {
      const location = chest.pos.join(" ");
      return chestLabel(chest.name).toLowerCase().includes(needle)
        || location.includes(needle)
        || withoutChrome(chest.items).some((item) => matches(item, needle));
    });
  }, [chests, needle]);
  const isExpanded = useCallback(
    (key: string) => chestIsExpanded(disclosure, key),
    [disclosure],
  );
  const toggleChest = useCallback((key: string) => {
    setDisclosure((current) => toggleChestDisclosure(current, key));
  }, []);
  const collapseAll = useCallback(() => {
    setDisclosure({ openByDefault: false, exceptions: new Set<string>() });
  }, []);
  const expandAll = useCallback(() => {
    setDisclosure({ openByDefault: true, exceptions: new Set<string>() });
  }, []);
  const anyOpen = visible.some((chest) => isExpanded(chestKey(chest)));

  useEffect(() => {
    writeChestDisclosureState(persistenceScope, disclosure);
  }, [disclosure, persistenceScope]);

  if (!isObserved(provenance) || chests.length === 0) {
    return <StorageState provenance={provenance} />;
  }

  return (
    <section className="storage-section profile-glass" aria-labelledby="storage-chests-title">
      <header className="storage-section-heading">
        <h2 id="storage-chests-title">Island Chests</h2>
        <div className="storage-section-actions">
          <dl className="storage-section-metrics" aria-label="Island chest totals">
            <div>
              <dt>Chests</dt>
              <dd>{visible.length.toLocaleString()}{needle ? ` / ${summary.chests.toLocaleString()}` : ""}</dd>
            </div>
            <div>
              <dt>Occupied</dt>
              <dd>{summary.occupiedSlots.toLocaleString()} / {summary.totalCapacity.toLocaleString()}</dd>
            </div>
            <div><dt>Types</dt><dd>{summary.itemTypes.toLocaleString()}</dd></div>
            <div><dt>Items</dt><dd>{summary.itemUnits.toLocaleString()}</dd></div>
          </dl>
          <span className="storage-section-source">{describeSection(provenance, live)}</span>
          <button
            type="button"
            className={`storage-disclosure-all ${FOCUS}`}
            onClick={anyOpen ? collapseAll : expandAll}
          >
            {anyOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </header>
      {visible.length > 0 ? (
        <div className="storage-chest-board">
          {visible.map((chest) => (
            <ChestCard
              key={chestKey(chest)}
              chest={chest}
              needle={needle}
              context={context}
              expanded={isExpanded(chestKey(chest))}
              onToggle={() => toggleChest(chestKey(chest))}
            />
          ))}
        </div>
      ) : (
        <p className="storage-empty-state">No island chest matches this search.</p>
      )}
    </section>
  );
};

export const StoragePage: React.FC = () => {
  const { snapshot, sections, sources, status, lastError } = useIsland();
  const parsedProfile = useParsedProfile();
  const { access, setProfileId } = useApiAccess();
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const live = status === "live";
  const modStatus = live
    ? "Mod live"
    : sources.mod
      ? `Snapshot ${ago(sources.mod)}`
      : "Mod offline";
  const storageIdentity = useMemo(() => checkStorageIdentity(snapshot, {
    playerUuids: [parsedProfile.playerUuid, access.uuid],
    profileName: parsedProfile.profileName,
    hasConnectedAccount: Boolean(
      access.key
      || access.name
      || access.uuid
      || access.profileId
      || parsedProfile.playerName
      || parsedProfile.playerUuid
      || parsedProfile.profileId
      || parsedProfile.profileName,
    ),
  }), [
    access.key,
    access.name,
    access.profileId,
    access.uuid,
    parsedProfile.playerName,
    parsedProfile.playerUuid,
    parsedProfile.profileId,
    parsedProfile.profileName,
    snapshot,
  ]);
  const showSnapshot = snapshot !== null && (
    storageIdentity.state === "match"
    || (!storageIdentity.hasExpectedIdentity && storageIdentity.state === "unknown")
  );
  const trustedSnapshot = showSnapshot ? snapshot : null;

  useEffect(() => {
    document.documentElement.classList.add("sd-channel");
    return () => document.documentElement.classList.remove("sd-channel");
  }, []);

  const characterPlayer = useMemo(() => {
    const uuid = parsedProfile.playerUuid || access.uuid || trustedSnapshot?.player.uuid;
    if (!uuid) return null;
    return {
      name: parsedProfile.playerName || access.name || trustedSnapshot?.player.name || "Player",
      uuid,
      profileName: parsedProfile.profileName || trustedSnapshot?.profile.name || "Profile",
      gameMode: parsedProfile.gameMode ?? trustedSnapshot?.profile.gameMode ?? "Normal",
      fetchedAt: parsedProfile.fetchedAt ?? trustedSnapshot?.exportedAt ?? 0,
    };
  }, [
    access.name,
    access.uuid,
    parsedProfile.fetchedAt,
    parsedProfile.gameMode,
    parsedProfile.playerName,
    parsedProfile.playerUuid,
    parsedProfile.profileName,
    trustedSnapshot,
  ]);
  const characterProfiles = useMemo(() => {
    if (parsedProfile.profileOptions.length > 0) return parsedProfile.profileOptions;
    if (!characterPlayer) return [];
    return [{
      id: parsedProfile.profileId ?? access.profileId ?? characterPlayer.profileName,
      name: characterPlayer.profileName,
      gameMode: trustedSnapshot?.profile.gameMode ?? parsedProfile.gameMode,
    }];
  }, [
    access.profileId,
    characterPlayer,
    parsedProfile.gameMode,
    parsedProfile.profileId,
    parsedProfile.profileOptions,
    trustedSnapshot?.profile.gameMode,
  ]);
  const selectedCharacterProfile = parsedProfile.profileId ?? access.profileId ?? characterProfiles[0]?.id ?? "profile";
  const chestDisclosureScope = `${characterPlayer?.uuid ?? access.uuid ?? "anonymous"}:${selectedCharacterProfile}`;

  return (
    <div className="profile-view-root profile-view-root--frosted storage-view-root">
      <div className="profile-shell storage-shell">
        {characterPlayer ? (
          <CharacterStage
            player={characterPlayer}
            sourceStatus={modStatus}
            profiles={characterProfiles}
            selectedProfileId={selectedCharacterProfile}
            onProfileChange={setProfileId}
            showProfilePicker
          />
        ) : (
          <aside className="profile-character-stage" aria-label="Character preview" />
        )}

        <main className="profile-workspace storage-workspace">
          <ProfileIdentity
            playerName={characterPlayer?.name ?? access.name ?? "Player"}
            playerUuid={characterPlayer?.uuid ?? parsedProfile.playerUuid ?? access.uuid}
            profiles={characterProfiles}
            selectedProfileId={selectedCharacterProfile}
            gameMode={characterPlayer?.gameMode ?? "Normal"}
            onProfileChange={setProfileId}
            fetchedAt={characterPlayer?.fetchedAt ?? parsedProfile.fetchedAt}
            sourceStatus={modStatus}
            className="storage-identity"
          />

          <div className="storage-toolbar">
            <label className="storage-search">
              <Search aria-hidden />
              <span className="sr-only">Search captured island chests</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search captured items"
                className={`${INPUT} w-full pl-8`}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>

          {lastError && <p className="storage-error" role="alert">{lastError}</p>}

          {trustedSnapshot ? (
            <ChestsPanel
              key={chestDisclosureScope}
              chests={trustedSnapshot.chests}
              provenance={sections.chests}
              needle={needle}
              live={live}
              persistenceScope={chestDisclosureScope}
            />
          ) : snapshot ? (
            <StorageState provenance={{ ...sections.chests, state: "absent", source: null, at: null }} />
          ) : (
            <section className="storage-offline profile-glass">
              <WifiOff aria-hidden />
              <div>
                <h2>No storage captured yet</h2>
                <p>Skydex could not reach the mod. Make sure Minecraft is started, silly!</p>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default StoragePage;
