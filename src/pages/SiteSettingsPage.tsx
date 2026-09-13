import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRightLeft,
  CircleUserRound,
  Database,
  Gem,
  Link2,
  Loader2,
  Paintbrush,
  RefreshCw,
  Settings2,
  Shield,
  Unlink,
  Wifi,
  WifiOff,
} from "lucide-react";
import greenhouseData from "../../public/greenhouse/data.json";
import { HypixelPanel } from "../island/HypixelPanel";
import { useApiAccess } from "../island/apiKey";
import { useIsland } from "../island/useIsland";
import { chooseProfile } from "../island/hypixel";
import { ago } from "../island/format";
import { applyApiGameMode } from "../profile/useProfile";
import { useProfileType, type ProfileType } from "../profile/profileType";
import { usePlannerState } from "../greenhouse/planner/usePlannerState";
import { IslandSnapshotImportPanel } from "../island/IslandSnapshotImportPanel";
import { fetchWikiMutations, readCache, MAX_AGE_MS, SYNC_REFUSED } from "../greenhouse/data/wikiSync";
import { publishWikiSnapshot } from "../greenhouse/data/datasetStore";
import { SITE_NAME } from "../ui/brand";
import {
  PANEL,
  LABEL,
  NUM,
  BTN_QUIET,
  SectionHead,
  ControlGrid,
  ControlRow,
  ToggleRow,
  Tag,
} from "../ui/kit";
import { replayTour } from "../components/layout/tourState";
import { SPAN_COLOURS } from "../components/layout/tourContent";
import { closeSettingsLocation, SETTINGS_SECTION_PARAM } from "../components/layout/settingsRoute";
import { clearManagedInventory } from "../inventory";
import { useCompanionLink } from "../island/companionLink";
import { SettingsAppearancePanel } from "./SettingsAppearancePanel";
import { ShardSettingsPanel } from "./ShardSettingsPanel";
import "./site-settings.css";

/**
 * One place for everything that is a setting.
 *
 * WHY IT IS A ROUTE AND NOT A GEAR IN THE NAV
 * -------------------------------------------
 * `/settings` is reachable, linkable and bookmarkable, and the Island page can
 * point straight at the section it used to own. A nav gear would put the same
 * screen behind a control this pass is not allowed to touch, so the route is
 * both the correct answer and the available one.
 *
 * Note the older `/shards` page is also called SettingsPage in this codebase.
 * It is the Owned-shards editor and has nothing to do with this; the name is
 * inherited from upstream. Hence the file name here.
 *
 * WHAT THIS PAGE OWNS
 * -------------------
 * Nothing. That is the design. Every control on it is a view onto a store that
 * already existed and already had a home:
 *
 *   Hypixel connection      `island/apiKey.ts`            wizardsky.apikey.v1
 *   Profile type            `profile/useProfile.ts`       wizardsky.profile.v1
 *   Wiki mutation cache     `greenhouse/data/wikiSync.ts` wizardsky.wikidata.v1
 *   Island snapshot         `island/useIsland.ts`         its own key
 *   Display preferences     `greenhouse/planner`          wizardsky.planner.v2
 *
 * There is no `skydex.settings.*` key and there should never be one. A
 * settings page that keeps its own copy of a setting is a settings page that
 * will one day disagree with the tool the setting belongs to.
 *
 * THE CONNECTION BOUNDARY
 * -----------------------
 * The existing `HypixelPanel` owns the account connection. Authenticated
 * profile reads use Skydex's narrow Worker and never receive a visitor key.
 */

/* -------------------------------------------------------------------------- */
/* Wiki sync                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Wiki names mapped to the ids this app uses.
 *
 * Built the same way `GreenhouseDataContext` builds it, from the same bundled
 * JSON, with the same normaliser and the same single alias. That is not a
 * coincidence to be tidied away later: `fetchWikiMutations` writes the shared
 * cache, and a map that disagreed with the greenhouse's would file a mutation
 * under a slug nothing recognises, which `applyWikiMutations` would then add as
 * a brand new mutation rather than an update to an existing one. If one of the
 * two changes, the other has to change with it.
 */
const buildKnownNames = (): Map<string, string> => {
  const map = new Map<string, string>();
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [id, c] of Object.entries(greenhouseData.crops)) map.set(norm(c.name), id);
  for (const [id, m] of Object.entries(greenhouseData.mutations)) map.set(norm(m.name), id);
  map.set(norm("Melon Slice"), "melon");
  return map;
};

interface WikiState {
  fetchedAt: number | null;
  count: number;
  syncing: boolean;
  error: string | null;
}

/**
 * The wiki cache, read rather than owned.
 *
 * The greenhouse's own `useGreenhouseData` has richer state than this, but it
 * lives behind a provider that is mounted inside the Greenhouse shell, so it is
 * genuinely unavailable here. Reading the cache the provider writes is the
 * honest substitute: same key, same writer, no second source of truth. A
 * refresh from this page is picked up by the Greenhouse the next time it loads,
 * exactly as a refresh from the Greenhouse is picked up here.
 */
const useWikiCache = () => {
  const [state, setState] = useState<WikiState>(() => {
    const cached = readCache();
    return {
      fetchedAt: cached?.fetchedAt ?? null,
      count: cached ? Object.keys(cached.mutations).length : 0,
      syncing: false,
      error: null,
    };
  });

  const knownNames = useRef<Map<string, string> | null>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    setState((prev) => (prev.syncing ? prev : { ...prev, syncing: true, error: null }));
    knownNames.current ??= buildKnownNames();

    fetchWikiMutations(knownNames.current)
      .then((snapshot) => {
        publishWikiSnapshot(snapshot);
        if (!live.current) return;
        setState({
          fetchedAt: snapshot.fetchedAt,
          count: Object.keys(snapshot.mutations).length,
          syncing: false,
          error: null,
        });
      })
      .catch((err: Error) => {
        if (!live.current) return;
        /*
         * A refusal is not a failure. The gate in `wikiSync` turns a second
         * click inside the floor away without asking the wiki, and reporting
         * that as an error would tell somebody their sync broke when in fact
         * the site declined to repeat a request it had just made. The spinner
         * stops and the previous message, if any, stays as it was.
         *
         * `disabled={wiki.syncing}` is still on the button, but it is now only
         * a hint. The guarantee lives at the transport, where two clicks in the
         * same tick cannot both get through.
         */
        if (err.message === SYNC_REFUSED) {
          setState((prev) => ({ ...prev, syncing: false }));
          return;
        }
        // The bundled copy is already in use everywhere, so a failed sync is a
        // note rather than a broken page.
        setState((prev) => ({ ...prev, syncing: false, error: err.message }));
      });
  }, []);

  return { ...state, refresh };
};

/* -------------------------------------------------------------------------- */
/* The page                                                                   */
/* -------------------------------------------------------------------------- */

const MODE_OPTIONS = [
  {
    value: "ironman" as const,
    label: "Ironman",
    title: "Use profile-specific acquisition guidance.",
    icon: Shield,
    tone: SPAN_COLOURS.blue,
  },
  {
    value: "converter" as const,
    label: "Converter",
    title: "Normal, but spiritually undefeated.",
    icon: ArrowRightLeft,
    tone: SPAN_COLOURS.gold,
  },
  {
    value: "normal" as const,
    label: "Normal",
    title: "Use standard acquisition and source guidance.",
    icon: CircleUserRound,
    tone: SPAN_COLOURS.green,
  },
] satisfies ReadonlyArray<{
  value: ProfileType;
  label: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}>;

const ModeControl: React.FC<{ value: ProfileType; onChange: (mode: ProfileType) => void }> = ({ value, onChange }) => (
  <div className="settings-profile-types" role="group" aria-label="Profile type">
    {MODE_OPTIONS.map(({ value: option, label, title, icon: Icon, tone }) => {
      const active = value === option;
      return (
        <button
          key={option}
          type="button"
          title={title}
          aria-pressed={active}
          data-active={active || undefined}
          className="settings-profile-type"
          style={{ "--settings-profile-tone": tone } as React.CSSProperties}
          onClick={() => onChange(option)}
        >
          <Icon aria-hidden />
          <span>{label}</span>
        </button>
      );
    })}
  </div>
);

type SettingsSection = "general" | "shards" | "appearance" | "connections";

const SETTINGS_SECTIONS = [
  { id: "general" as const, label: "General", detail: "Profile and planner", icon: Settings2 },
  { id: "shards" as const, label: "Shards", detail: "Sources and route rules", icon: Gem },
  { id: "appearance" as const, label: "Appearance", detail: "Backdrop and item art", icon: Paintbrush },
  { id: "connections" as const, label: "Data & connections", detail: "Hypixel, mod and cache", icon: Database },
] satisfies ReadonlyArray<{
  id: SettingsSection;
  label: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}>;
export const SiteSettingsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [settingsParams] = useSearchParams();
  const { profileType, source, setProfileType, clearOverride } = useProfileType();
  const { access } = useApiAccess();
  const { status, sources, modVersion, apiProfiles, snapshot, clearInventorySnapshot } = useIsland();
  const { linked: companionLinked, link: linkCompanion, unlink: unlinkCompanion } = useCompanionLink();
  const wiki = useWikiCache();
  const [companionBusy, setCompanionBusy] = useState(false);
  const [companionError, setCompanionError] = useState<string | null>(null);
  const companionAbort = useRef<AbortController | null>(null);

  useEffect(() => () => companionAbort.current?.abort(), []);

  const onLinkCompanion = async () => {
    companionAbort.current?.abort();
    const controller = new AbortController();
    companionAbort.current = controller;
    setCompanionBusy(true);
    setCompanionError(null);
    const ok = await linkCompanion(controller.signal);
    if (controller.signal.aborted) return;
    setCompanionBusy(false);
    if (!ok) {
      setCompanionError("Skydex could not reach the mod. Make sure Minecraft is running, silly!");
    }
  };

  const onUnlinkCompanion = () => {
    companionAbort.current?.abort();
    setCompanionBusy(false);
    setCompanionError(null);
    unlinkCompanion();
  };

  const settingsSection = settingsParams.get(SETTINGS_SECTION_PARAM);
  const requestedSection: SettingsSection =
    settingsSection === "appearance" || settingsSection === "texture-pack"
      ? "appearance"
      : settingsSection === "shards"
        ? "shards"
        : settingsSection === "hypixel"
        ? "general"
        : "general";
  const [activeSection, setActiveSection] = useState<SettingsSection>(requestedSection);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const scrollToTarget = useCallback((target: HTMLElement, behavior: ScrollBehavior) => {
    const scrollRoot = contentRef.current;
    if (!scrollRoot) return;
    const top = scrollRoot.scrollTop
      + target.getBoundingClientRect().top
      - scrollRoot.getBoundingClientRect().top
      - 8;
    scrollRoot.scrollTo({ top: Math.max(0, top), behavior });
  }, []);

  const scrollToSection = useCallback((id: SettingsSection) => {
    const target = document.getElementById(`settings-panel-${id}`);
    if (!target) return;
    setActiveSection(id);
    scrollToTarget(
      target,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    );
  }, [scrollToTarget]);

  useEffect(() => {
    const scrollRoot = contentRef.current;
    if (!scrollRoot) return;

    const updateActiveSection = () => {
      const marker = scrollRoot.getBoundingClientRect().top + Math.min(120, scrollRoot.clientHeight * 0.22);
      let next: SettingsSection = "general";
      for (const { id } of SETTINGS_SECTIONS) {
        const section = document.getElementById(`settings-panel-${id}`);
        if (section && section.getBoundingClientRect().top <= marker) next = id;
      }
      if (scrollRoot.scrollHeight - scrollRoot.scrollTop - scrollRoot.clientHeight <= 2) {
        next = "connections";
      }
      setActiveSection((current) => (current === next ? current : next));
    };

    updateActiveSection();
    scrollRoot.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);
    return () => {
      scrollRoot.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, []);

  useEffect(() => {
    if (!settingsSection) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(settingsSection)
        ?? document.getElementById(`settings-panel-${requestedSection}`);
      if (target) scrollToTarget(target, "auto");
      setActiveSection(requestedSection);
    });
    return () => cancelAnimationFrame(frame);
  }, [requestedSection, scrollToTarget, settingsSection]);

  const [resetPending, setResetPending] = useState(false);
  const resetInventoryData = () => {
    clearManagedInventory();
    clearInventorySnapshot();
    setResetPending(false);
  };

  /*
   * The planner's own hook, used the way the Dashboard already uses it, rather
   * than a second copy of these three flags.
   *
   * `usePlannerState` is now the shared store rather than per-component state,
   * so this page and the Dashboard read the same object and a flag toggled here
   * moves on both at once instead of on whichever one happened to remount. The
   * round trip through `wizardsky.planner.v2` still happens when the first
   * consumer subscribes, and is still lossless by construction: unmodelled
   * fields are captured by `foreignFields` and merged back in behind ours.
   */
  const { state: planner, setOption } = usePlannerState();

  /** The profile Hypixel would show, which is the one whose mode we trust. */
  const detected = useMemo(
    () => (apiProfiles.length > 0 ? chooseProfile(apiProfiles, access.profileId) : null),
    [apiProfiles, access.profileId]
  );

  /*
   * Auto-fill, on the data this page was already rendering.
   *
   * `applyApiGameMode` holds the precedence, so this is allowed to fire on
   * every pull without thinking about it: a mode the player set by hand is
   * never touched, and an unrecognised `game_mode` is never guessed at.
   */
  useEffect(() => {
    if (detected) applyApiGameMode(detected.gameMode);
  }, [detected]);

  /** True when the API has an opinion the player has overridden. */
  const overridden = source === "manual" && detected !== null;

  const followProfile = () => {
    clearOverride();
    applyApiGameMode(detected?.gameMode ?? null);
  };

  const wikiStale = wiki.fetchedAt !== null && Date.now() - wiki.fetchedAt > MAX_AGE_MS;

  return (
    <div className="profile-settings-page sd-toolkit">
      <header className="profile-settings-hero">
        <span className="profile-settings-eyebrow">{SITE_NAME}</span>
        <h1>Settings</h1>
        <p>Make {SITE_NAME} yours. Changes save in this browser.</p>
      </header>

      <div className="profile-settings-workspace">
        <nav className="profile-settings-nav" aria-label="Settings sections">
          {SETTINGS_SECTIONS.map(({ id, label, detail, icon: Icon }, index) => (
            <button
              key={id}
              type="button"
              id={`settings-link-${id}`}
              aria-current={activeSection === id ? "location" : undefined}
              aria-controls={`settings-panel-${id}`}
              className="profile-settings-nav-item"
              data-active={activeSection === id || undefined}
              onClick={() => scrollToSection(id)}
              onKeyDown={(event) => {
                let nextIndex: number | null = null;
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  nextIndex = (index + 1) % SETTINGS_SECTIONS.length;
                } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                  nextIndex = (index - 1 + SETTINGS_SECTIONS.length) % SETTINGS_SECTIONS.length;
                } else if (event.key === "Home") {
                  nextIndex = 0;
                } else if (event.key === "End") {
                  nextIndex = SETTINGS_SECTIONS.length - 1;
                }
                if (nextIndex === null) return;
                event.preventDefault();
                const next = SETTINGS_SECTIONS[nextIndex].id;
                scrollToSection(next);
                document.getElementById(`settings-link-${next}`)?.focus();
              }}
            >
              <Icon aria-hidden />
              <span>
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
            </button>
          ))}
          <span className="profile-settings-save-note">Preferences save automatically</span>
        </nav>

        <div ref={contentRef} className="profile-settings-content">
          <section
            id="settings-panel-general"
            aria-labelledby="settings-link-general"
            className="profile-settings-tab-panel"
          >
              <section id="hypixel" className="scroll-mt-4">
                <HypixelPanel />
              </section>

              <div className={PANEL}>
                <SectionHead
                  title="Profile preferences"
                  right={detected ? <Tag>{detected.cuteName}</Tag> : <span className={LABEL}>local</span>}
                />
                <div className="p-3">
                  <ControlGrid>
                    <ControlRow
                      label="Profile type"
                      hint="Changes acquisition guidance for coins and gathered materials. A manual choice wins over the profile value."
                    >
                      <ModeControl value={profileType} onChange={setProfileType} />
                    </ControlRow>
                    {detected && (
                      <ControlRow
                        label="Profile reports"
                        value={<span>{detected.gameMode === "ironman" ? "Ironman" : "Normal"}</span>}
                      />
                    )}
                  </ControlGrid>
                  {overridden && (
                    <div className="settings-inline-action">
                      <span>Manual override active.</span>
                      <button className={BTN_QUIET} onClick={followProfile}>
                        Follow profile
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className={PANEL}>
                <SectionHead title="Planner preferences" />
                <div className="p-3">
                  <ControlGrid>
                    <ToggleRow
                      label="Show base crops"
                      checked={planner.options.showBaseCrops}
                      onChange={(v) => setOption("showBaseCrops", v)}
                      hint="List the plain crops a mutation is grown from."
                    />
                    <ToggleRow
                      label="Hide finished mutations"
                      checked={planner.options.hideCompleted}
                      onChange={(v) => setOption("hideCompleted", v)}
                      hint="Collapse mutations whose plantings are complete."
                    />
                    <ToggleRow
                      label="Show time estimates"
                      checked={planner.options.showTime}
                      onChange={(v) => setOption("showTime", v)}
                      hint="Show growth-time estimates beside planting counts."
                    />
                    <ControlRow label="Welcome introduction">
                      <button type="button" onClick={() => {
                        navigate(closeSettingsLocation(location), { replace: true });
                        replayTour();
                      }} className={BTN_QUIET}>
                        Replay
                      </button>
                    </ControlRow>
                  </ControlGrid>
                </div>
              </div>
          </section>

          <section
            id="settings-panel-shards"
            aria-labelledby="settings-link-shards"
            className="profile-settings-tab-panel"
          >
              <ShardSettingsPanel />
          </section>

          <section
            id="settings-panel-appearance"
            aria-labelledby="settings-link-appearance"
            className="profile-settings-tab-panel"
          >
              <SettingsAppearancePanel />
          </section>

          <section
            id="settings-panel-connections"
            aria-labelledby="settings-link-connections"
            className="profile-settings-tab-panel"
          >
              <div className={PANEL}>
                <SectionHead
                  title="Skydex mod"
                  right={
                    companionLinked && status === "live" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                        <Wifi className="h-3 w-3" /> live
                      </span>
                    ) : companionLinked ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                        <WifiOff className="h-3 w-3" /> offline
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                        <WifiOff className="h-3 w-3" /> not linked
                      </span>
                    )
                  }
                />
                <div className="space-y-2 p-3">
                  <ControlGrid>
                    <ControlRow
                      label="Inventory source"
                      value={<span className={NUM}>{sources.mod === null ? "never" : ago(sources.mod)}</span>}
                      hint="Chests, inventory and ender chest can only come from the mod."
                    />
                    <ControlRow
                      label="Sack source"
                      value={<span className={NUM}>{sources.api === null ? "never" : ago(sources.api)}</span>}
                    />
                    {modVersion && <ControlRow label="Mod version" value={<span className={NUM}>{modVersion}</span>} />}
                    {snapshot?.profile.name && (
                      <ControlRow label="Snapshot profile" value={<span>{snapshot.profile.name}</span>} />
                    )}
                  </ControlGrid>

                  <div className="settings-inline-action">
                    {companionLinked ? (
                      <button type="button" className={BTN_QUIET} onClick={onUnlinkCompanion}>
                        <Unlink className="h-3 w-3" /> Unlink mod
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={BTN_QUIET}
                        onClick={() => void onLinkCompanion()}
                        disabled={companionBusy}
                      >
                        {companionBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                        {companionBusy ? "Checking…" : "Link mod"}
                      </button>
                    )}
                  </div>

                  {companionError && <p className="text-[11px] leading-snug text-red-300">{companionError}</p>}

                  <details className="settings-disclosure">
                    <summary>Inventory import and reset</summary>
                    <div className="settings-disclosure-body">
                      <IslandSnapshotImportPanel title="Import inventory snapshot" />
                      <div className="settings-reset-row" data-reset-inventory-data>
                        <span>Remove imported inventory, sacks, chests, ender chest and storage data.</span>
                        {!resetPending ? (
                          <button type="button" className={BTN_QUIET} onClick={() => setResetPending(true)}>
                            Reset inventory data
                          </button>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2" role="alert">
                            <span className="text-amber-200">Are you sure?</span>
                            <button type="button" className={BTN_QUIET} onClick={resetInventoryData}>Reset</button>
                            <button type="button" className={BTN_QUIET} onClick={() => setResetPending(false)}>Cancel</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                </div>
              </div>

              <div className={PANEL}>
                <SectionHead
                  title="Wiki data"
                  right={<span className={`text-[10px] ${NUM} text-slate-400`}>{wiki.fetchedAt ? ago(wiki.fetchedAt) : "bundled"}</span>}
                />
                <div className="p-3">
                  <ControlGrid>
                    <ControlRow label="Cached mutations" value={<span>{wiki.count || "-"}</span>} />
                    <ControlRow
                      label="Last synced"
                      value={
                        <span className={wikiStale ? "text-amber-300" : ""}>
                          {wiki.fetchedAt ? ago(wiki.fetchedAt) : "never"}
                        </span>
                      }
                      hint="Automatically refreshed when more than twelve hours old."
                    >
                      <button className={BTN_QUIET} onClick={wiki.refresh} disabled={wiki.syncing}>
                        <RefreshCw className={`h-3 w-3 ${wiki.syncing ? "motion-safe:animate-spin" : ""}`} />
                        {wiki.syncing ? "Syncing…" : "Sync"}
                      </button>
                    </ControlRow>
                  </ControlGrid>
                  {wiki.error && <p className="mt-2 text-[11px] text-amber-300">{wiki.error}</p>}
                </div>
              </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default SiteSettingsPage;
