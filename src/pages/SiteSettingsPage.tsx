import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Cog, Link2, Loader2, RefreshCw, Unlink, Wifi, WifiOff } from "lucide-react";
import greenhouseData from "../../public/greenhouse/data.json";
import { HypixelPanel } from "../island/HypixelPanel";
import { TexturePackPanel } from "../ui/TexturePackPanel";
import { useApiAccess } from "../island/apiKey";
import { useIsland } from "../island/useIsland";
import { chooseProfile } from "../island/hypixel";
import { ago } from "../island/format";
import { applyApiGameMode, useProfile, type GameMode } from "../profile/useProfile";
import { usePlannerState } from "../greenhouse/planner/usePlannerState";
import { fetchWikiMutations, readCache, MAX_AGE_MS, SYNC_REFUSED } from "../greenhouse/data/wikiSync";
import { SITE_NAME } from "../ui/brand";
import {
  PANEL,
  LABEL,
  NUM,
  BTN_QUIET,
  FOCUS,
  PageHeader,
  SectionHead,
  ControlGrid,
  ControlRow,
  ToggleRow,
  Segmented,
  Tag,
} from "../ui/kit";
import { replayTour } from "../components/layout/WelcomeTour";
import { clearBackdrop, readBackdropFlag, saveBackdrop, type BackdropFlag } from "../ui/backdrop";
import { SETTINGS_SECTION_PARAM } from "../components/layout/settingsRoute";
import { useCompanionLink } from "../island/companionLink";

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
 *   Hypixel connection     `island/apiKey.ts`            wizardsky.apikey.v1
 *   Game mode               `profile/useProfile.ts`       wizardsky.profile.v1
 *   Wiki mutation cache     `greenhouse/data/wikiSync.ts` wizardsky.wikidata.v1
 *   Island snapshot         `island/useIsland.ts`         its own key
 *   Display preferences     `greenhouse/planner`          wizardsky.planner.v2
 *
 * There is no `skyindex.settings.*` key and there should never be one. A
 * settings page that keeps its own copy of a setting is a settings page that
 * will one day disagree with the tool the setting belongs to.
 *
 * THE CONNECTION BOUNDARY
 * -----------------------
 * The existing `HypixelPanel` owns both supported transports. Production uses
 * Skydex's narrow Worker and never receives a visitor key. Local development
 * retains the masked, browser-local key field and direct Hypixel request path.
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

const MODE_OPTIONS: ReadonlyArray<{ value: GameMode; label: string; title: string }> = [
  { value: "ironman", label: "Ironman", title: "No Bazaar and no Auction House. Everything has to be gathered." },
  { value: "normal", label: "Normal", title: "Bazaar and Auction House available, so coin costs are meaningful." },
];

export const SiteSettingsPage: React.FC = () => {
  const [settingsParams] = useSearchParams();
  const { mode, source, setMode, clearOverride } = useProfile();
  const { access } = useApiAccess();
  const { status, sources, modVersion, apiProfiles, snapshot } = useIsland();
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
      setCompanionError(
        "Skydex could not reach the mod. Start Minecraft in Locally hosted mode, then allow local-device access when your browser asks.",
      );
    }
  };

  const onUnlinkCompanion = () => {
    companionAbort.current?.abort();
    setCompanionBusy(false);
    setCompanionError(null);
    unlinkCompanion();
  };

  const settingsSection = settingsParams.get(SETTINGS_SECTION_PARAM);
  useEffect(() => {
    if (!settingsSection) return;
    document.getElementById(settingsSection)?.scrollIntoView({ block: "nearest" });
  }, [settingsSection]);

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

  /* The custom backdrop's flag mirrors localStorage; re-read after every
     save/clear so the panel always states what is actually stored. */
  const [backdrop, setBackdrop] = useState<BackdropFlag | null>(() => readBackdropFlag());
  const [backdropError, setBackdropError] = useState<string | null>(null);
  const [backdropBusy, setBackdropBusy] = useState(false);
  const onBackdropFile = async (file: File | undefined) => {
    if (!file) return;
    setBackdropBusy(true);
    setBackdropError(null);
    try {
      await saveBackdrop(file);
      setBackdrop(readBackdropFlag());
    } catch (e) {
      setBackdropError(e instanceof Error ? e.message : "That image could not be stored.");
    } finally {
      setBackdropBusy(false);
    }
  };
  const onBackdropClear = async () => {
    setBackdropBusy(true);
    setBackdropError(null);
    try {
      await clearBackdrop();
      setBackdrop(null);
    } finally {
      setBackdropBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <PageHeader
        title="Settings"
        icon={Cog}
        sub={`Everything ${SITE_NAME} remembers, in one place. Local choices stay in this browser; connected profile reads use the privacy boundary described below.`}
      />

      {/* ---- Hypixel connection ------------------------------------------ */}
      {/*
        The anchor the Island page links to. It is a plain id rather than
        scroll-into-view machinery: the browser already does this correctly,
        including for a link pasted from somewhere else.
      */}
      <section id="hypixel" className="scroll-mt-4">
        <HypixelPanel />
      </section>

      {/* ---- Profile ------------------------------------------------------ */}
      <div className={PANEL}>
        <SectionHead
          title="Profile"
          right={detected ? <Tag>{detected.cuteName}</Tag> : <span className={LABEL}>no profile yet</span>}
        />
        <div className="space-y-2 p-3">
          <ControlGrid>
            <ControlRow
              label="Game mode"
              source={source}
              hint="On Ironman there is no Bazaar and no Auction House, so nothing can be bought and every tree has to bottom out in what you gather."
            >
              <Segmented options={MODE_OPTIONS} value={mode} onChange={setMode} ariaLabel="Game mode" />
            </ControlRow>

            <ControlRow
              label="Hypixel says"
              value={
                detected ? (
                  <span className="text-slate-300">{detected.gameMode ?? "normal"}</span>
                ) : (
                  <span className="text-slate-400">unknown</span>
                )
              }
              hint="Read from game_mode on the profile response. A normal profile does not carry the field at all, which is why an absent value reads as normal."
            />
          </ControlGrid>

          {overridden && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <p className="text-[11px] leading-snug text-slate-400">
                You set this by hand, so it stays where you put it. Nothing from the API will move it.
              </p>
              <button className={BTN_QUIET} onClick={followProfile} title="Hand the setting back to your Hypixel profile.">
                Follow my profile
              </button>
            </div>
          )}

          {!overridden && (
            <p className="text-[11px] leading-snug text-slate-400">
              Filled in from your Hypixel profile when there is one. Pick a mode yourself and your choice wins from
              then on.
            </p>
          )}
        </div>
      </div>

      {/* ---- Wiki data ---------------------------------------------------- */}
      <div className={PANEL}>
        <SectionHead
          title="Wiki data"
          right={
            <span className={`text-[10px] ${NUM} text-slate-400`}>
              {wiki.fetchedAt ? ago(wiki.fetchedAt) : "bundled copy"}
            </span>
          }
        />
        <div className="space-y-2 p-3">
          <p className="text-[11px] leading-relaxed text-slate-400">
            Mutation figures are read from the wiki itself and laid over the copy shipped with the app, so the numbers
            follow a game update without waiting for a release. The bundled copy is always there underneath, which is
            why a failed sync costs nothing.
          </p>

          <ControlGrid>
            <ControlRow
              label="Mutations in cache"
              value={<span className="text-slate-200">{wiki.count || "-"}</span>}
            />
            <ControlRow
              label="Last synced"
              value={
                <span className={wikiStale ? "text-amber-300" : "text-slate-300"}>
                  {wiki.fetchedAt ? ago(wiki.fetchedAt) : "never"}
                </span>
              }
              hint="Refreshed automatically when it is more than twelve hours old."
            />
          </ControlGrid>

          <div className="flex flex-wrap items-center gap-2">
            <button className={BTN_QUIET} onClick={wiki.refresh} disabled={wiki.syncing}>
              <RefreshCw className={`h-3 w-3 ${wiki.syncing ? "motion-safe:animate-spin" : ""}`} />
              {wiki.syncing ? "Syncing…" : "Sync now"}
            </button>
            {wiki.error && <span className="text-[11px] text-amber-300">{wiki.error}</span>}
          </div>
        </div>
      </div>

      {/* ---- Texture pack ------------------------------------------------- */}
      {/*
        Custom texture pack support, cached on the user's side so nothing
        is ever redistributed: the user's own downloaded pack,
        parsed and stored in this browser, winning over the wiki icon
        wherever ItemIcon renders. It sits by the Wiki data block because
        both are about where item pictures come from. All of its state
        lives in items/texturePack.ts, per this page's rule of owning
        nothing.
      */}
      <TexturePackPanel />

      {/* ---- Island ------------------------------------------------------- */}
      <div className={PANEL}>
        <SectionHead
          title="Island connection"
          right={
            companionLinked && status === "live" ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                <Wifi className="h-3 w-3" />
                mod live
              </span>
            ) : companionLinked ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                <WifiOff className="h-3 w-3" />
                mod offline
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                <WifiOff className="h-3 w-3" />
                not linked
              </span>
            )
          }
        />
        <div className="space-y-2 p-3">
          <ControlGrid>
            <ControlRow
              label="Companion mod"
              value={<span className={NUM}>{sources.mod === null ? "never" : ago(sources.mod)}</span>}
              hint="Chests, inventory and ender chest can only come from the mod. Hypixel does not publish them at any privacy setting."
            />
            <ControlRow
              label="Hypixel API"
              value={<span className={NUM}>{sources.api === null ? "never" : ago(sources.api)}</span>}
              hint="Sack totals, and nothing else."
            />
            {modVersion && <ControlRow label="Mod version" value={<span className={NUM}>{modVersion}</span>} />}
            {snapshot?.profile.name && (
              <ControlRow label="Snapshot profile" value={<span className="text-slate-300">{snapshot.profile.name}</span>} />
            )}
          </ControlGrid>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
            {companionLinked ? (
              <button type="button" className={BTN_QUIET} onClick={onUnlinkCompanion}>
                <Unlink className="h-3 w-3" />
                Unlink companion mod
              </button>
            ) : (
              <button
                type="button"
                className={BTN_QUIET}
                onClick={() => void onLinkCompanion()}
                disabled={companionBusy}
              >
                {companionBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                {companionBusy ? "Checking…" : "Link companion mod"}
              </button>
            )}
            <span className="text-[11px] leading-snug text-slate-400">
              Linking is the only action that asks your browser for access to the mod on this device.
            </span>
          </div>

          {companionError && <p className="text-[11px] leading-snug text-red-300">{companionError}</p>}

          <p className="text-[11px] leading-snug text-slate-400">
            The snapshot itself, and the button that clears it, stay on the{" "}
            <Link
              to="/island"
              className={`rounded-sm text-slate-300 underline decoration-slate-600 underline-offset-4 transition-colors hover:text-emerald-300 hover:decoration-emerald-400/70 ${FOCUS}`}
            >
              Island page
            </Link>
            , next to the data they belong to.
          </p>
        </div>
      </div>

      {/* ---- Display ------------------------------------------------------ */}
      <div className={PANEL}>
        <SectionHead title="Appearance" />
        <div className="space-y-2 p-3">
          <p className="text-[12px] leading-relaxed text-slate-300">
            The image behind the glass. Yours is kept in this browser only and can be any picture up to
            12&nbsp;MB; the frosted surfaces adapt to whatever is behind them.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className={`${BTN_QUIET} ${backdropBusy ? "pointer-events-none opacity-40" : ""}`}>
              Use your own image
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  void onBackdropFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {backdrop && (
              <button type="button" className={BTN_QUIET} onClick={() => void onBackdropClear()} disabled={backdropBusy}>
                Reset to the hub render
              </button>
            )}
            <span className="text-[11px] text-slate-400">
              {backdrop
                ? `${backdrop.name} (${(backdrop.size / 1024 / 1024).toFixed(1)} MB)`
                : "currently: the hub render"}
            </span>
          </div>
          {backdropError && <p className="text-[11px] text-red-400">{backdropError}</p>}
        </div>
      </div>

      <div className={PANEL}>
        <SectionHead title="Display" right={<span className={LABEL}>planner</span>} />
        <div className="p-3">
          <ControlGrid>
            <ToggleRow
              label="Show base crops"
              checked={planner.options.showBaseCrops}
              onChange={(v) => setOption("showBaseCrops", v)}
              hint="List the plain crops a mutation is grown from, not only the mutations themselves."
            />
            <ToggleRow
              label="Hide finished mutations"
              checked={planner.options.hideCompleted}
              onChange={(v) => setOption("hideCompleted", v)}
              hint="Collapse mutations whose plantings are all done."
            />
            <ToggleRow
              label="Show time estimates"
              checked={planner.options.showTime}
              onChange={(v) => setOption("showTime", v)}
              hint="Growth-time estimates next to each planting count."
            />
          </ControlGrid>
          <div className="mt-3 border-t border-white/10 pt-3">
            <button type="button" onClick={replayTour} className={BTN_QUIET}>
              Show the welcome tour again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SiteSettingsPage;
