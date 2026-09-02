import React, { useEffect, useState } from "react";
import { KeyRound, RefreshCw, Check, Trash2 } from "lucide-react";
import { useApiAccess } from "./apiKey";
import { useGreenhouseStats } from "./profileStats";
import { useIsland, apiCooldownUntil } from "./useIsland";
import { resolveAccount } from "./hypixel";
import { ago } from "./format";
import { PANEL, LABEL, NUM, INPUT, BTN_PRIMARY, BTN_QUIET, SectionHead } from "../ui/kit";

/**
 * The Hypixel connection settings.
 *
 * Lives under `src/island/` rather than on the settings page because it is only
 * meaningful next to the profile data it fetches. Hosted and local copies both
 * use Skydex's Worker connection. Hypixel cannot expose island chests through
 * this route, which is why the companion mod remains a separate source.
 */
export const HypixelPanel: React.FC = () => {
  const { access, setAccount, setProfileId, clear: clearAccount } = useApiAccess();
  const { refreshApi, apiStatus, apiError, apiProfiles, selectProfile, sources } = useIsland();

  /*
   * Subscribed here for the diagnostic line below.
   *
   * Subscribing is also what asks the store to pull, and that is deliberate
   * rather than a side effect worth apologising for: this panel is where the
   * account is connected, so it is the first place that can ask. It costs nothing
   * extra. The five minute TTL and the floor between attempts are module state
   * in `profileStats.ts`, shared by every subscriber, so adding one more cannot
   * raise the ceiling on requests. It only moves the first pull earlier, which
   * means the planner has its number before it is opened rather than after.
   */
  const greenhouse = useGreenhouseStats();

  const [ign, setIgn] = useState(access.name || access.uuid || "");
  const [resolving, setResolving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const busy = resolving || apiStatus === "loading";

  /*
   * The cooldown, as seconds a person can read.
   *
   * The floor between pulls has always existed and has always been silent: a
   * click inside it started nothing and said nothing, which is exactly what
   * makes somebody click again. Nothing about when a request is allowed changes
   * here. The only change is that the refusal is now visible, so it reads as
   * the site protecting a rate limit rather than as a dead button.
   *
   * The clock is read during render rather than held in state because a stored
   * `now` captured at mount would be
   * minutes stale by the time somebody presses the button and would report a
   * cooldown that never happened. The interval only forces the repaint; it does
   * not carry the time. It exists solely while the cooldown is running and
   * clears itself the moment it is over, so the panel keeps no live timer.
   */
  const [, tick] = useState(0);
  const coolingFor = Math.max(0, Math.ceil((apiCooldownUntil() - Date.now()) / 1000));

  useEffect(() => {
    if (coolingFor <= 0) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [coolingFor]);

  /*
   * A pull is refused while one is in the air or while the floor is closed.
   * Both buttons below trigger the same pull, so both answer to this: letting
   * Connect through during a cooldown would resolve the account and then
   * silently skip the fetch, which is a worse outcome than a button that says
   * what it is waiting for.
   */
  const cooling = coolingFor > 0;

  const connect = async () => {
    setLocalError(null);
    setResolving(true);
    try {
      const found = await resolveAccount(ign);
      if (!found.ok) {
        setLocalError(found.error.message);
        return;
      }
      // A pasted uuid resolves to no name; keep whatever we already had rather
      // than blanking a name the player can read.
      setAccount(found.value.uuid, found.value.name || access.name);
    } finally {
      setResolving(false);
    }
    await refreshApi(true);
  };

  const verdict = (
    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
      <Check className="w-3 h-3" />
      {access.keyState === "valid" && access.checkedAt ? `profile checked ${ago(access.checkedAt)}` : "Skydex connection"}
    </span>
  );

  return (
    <div className={PANEL}>
      <SectionHead
        title="Hypixel API"
        right={
          <span className="inline-flex items-center gap-2">
            {sources.api !== null ? (
              <span className={`text-[10px] ${NUM} text-slate-500`}>pulled {ago(sources.api)}</span>
            ) : (
              <span className={LABEL}>optional</span>
            )}
          </span>
        }
      />

      <div className="p-3 space-y-2.5">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Connect your Minecraft account to load <span className="text-slate-200">sacks, networth, gear and profile data</span> through
          Skydex. Hypixel does not publish island chests, which is why the mod still exists.
        </p>

        <div className="grid gap-2">
          <label className="block">
            <span className={LABEL}>Minecraft username or UUID</span>
            <input
              value={ign}
              onChange={(e) => setIgn(e.target.value)}
              placeholder="Minecraft Username"
              autoComplete="off"
              spellCheck={false}
              className={`${INPUT} w-full mt-1`}
            />
          </label>

        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            className={BTN_PRIMARY}
            onClick={connect}
            disabled={busy || cooling || !ign.trim()}
          >
            <KeyRound className="w-3 h-3" />
            {busy ? "Checking…" : sources.api !== null ? "Reconnect" : "Connect"}
          </button>

          <button
            className={BTN_QUIET}
            onClick={() => void refreshApi(true)}
            disabled={busy || cooling || !access.uuid}
            title="Pulls fresh sack totals. Cached for five minutes; there is no background polling."
          >
            <RefreshCw className={`w-3 h-3 ${apiStatus === "loading" ? "motion-safe:animate-spin" : ""}`} />
            {cooling ? `Just refreshed · ${coolingFor}s` : "Refresh"}
          </button>

          {access.uuid && (
            <button
              className={BTN_QUIET}
              onClick={clearAccount}
              title="Removes only the saved Minecraft account and profile choice."
            >
              <Trash2 className="w-3 h-3" />
              Forget account
            </button>
          )}

          {verdict}
        </div>

        {/*
          The one line, and only while it is true.

          It has to read as the site looking after shared capacity rather than
          as a broken button, which is why it names the reason and not the rule. No
          toast, no modal, no banner: it appears under the buttons that are
          waiting, and it leaves on its own.
        */}
        {cooling && (
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Spacing requests out to protect Skydex&rsquo;s shared Hypixel allowance. Your profile data is already up to date.
          </p>
        )}

        {access.uuid && (
          <p className={`text-[10px] ${NUM} text-slate-500 truncate`}>
            {access.name || "account"} · {access.uuid}
          </p>
        )}

        {/*
          The plot count, interpreted, with the evidence in the tooltip.

          This began as a raw-only diagnostic because nobody had written down
          whether PLOT_LIMIT counts plots (1 to 3) or purchased tiers (0 to 2),
          and being wrong by one halves or doubles every estimate. The question
          is now ANSWERED from documentation: the Desk UI page
          (hypixelskyblock.minecraft.wiki/w/The_Desk/UI) shows the upgrade as
          "Current Tier: 0/2", each tier "+1 Greenhouse Plot", so the field
          counts PURCHASED TIERS, base 1 greenhouse, max 3. An absent key is
          the unpurchased default; Hypixel only materialises it once a tier is
          bought, which the one dumped account (1 plot, no key) is consistent
          with.

          So the line now says what the number MEANS, and keeps what the API
          literally said in the tooltip, because the mapping is wiki-documented
          but not yet observed against an account that has purchased a tier.
          The first such account confirms it from this very tooltip.

          `source === "api"` is the render gate rather than a null check so the
          line only ever describes what Hypixel said: it stays silent when
          nothing was read, and silent if a manual overlay ever relabels the
          stat. A raw value the parser DECLINED (outside 0 to 2, so the field
          is not what we believe it is) falls back to the raw-only sentence,
          which is the one honest thing left to say about it.
        */}
        {greenhouse.plots?.source === "api" ? (
          <p
            className="text-[10px] text-slate-500 leading-relaxed"
            title={`garden_upgrades.PLOT_LIMIT: ${greenhouse.rawPlotLimit ?? "absent"} (wiki-documented mapping, unverified against a purchased account)`}
          >
            Greenhouse plots: <span className={`${NUM} text-slate-400`}>{greenhouse.plots.value}</span>{" "}
            {greenhouse.rawPlotLimit === null
              ? "(base, no upgrades purchased)"
              : `(${greenhouse.rawPlotLimit} purchased)`}
          </p>
        ) : (
          greenhouse.rawPlotLimit !== null && (
            <p className="text-[10px] text-slate-500 leading-relaxed">
              API reports PLOT_LIMIT: <span className={`${NUM} text-slate-400`}>{greenhouse.rawPlotLimit}</span>
            </p>
          )
        )}

        {apiProfiles.length > 1 && (
          <label className="block">
            <span className={LABEL}>Profile</span>
            <select
              value={access.profileId ?? apiProfiles.find((p) => p.selected)?.profileId ?? apiProfiles[0].profileId}
              onChange={(e) => {
                setProfileId(e.target.value);
                selectProfile(e.target.value);
              }}
              className={`${INPUT} w-full mt-1`}
            >
              {apiProfiles.map((p) => (
                <option key={p.profileId} value={p.profileId}>
                  {p.cuteName}
                  {p.gameMode ? ` · ${p.gameMode}` : ""}
                  {p.selected ? " · selected in game" : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        {(apiError || localError) && (
          <p className="text-[11px] text-red-400 border-l-2 border-red-500/50 pl-2" role="alert">
            {localError ?? apiError}
          </p>
        )}

        <p className="text-[10px] text-slate-500 leading-relaxed">
          Skydex sends the account UUID or selected profile ID to api.skydex.ca. Fresh responses are cached for 5 to 30 minutes, with the last good
          snapshot available for up to 24 hours.
        </p>
      </div>
    </div>
  );
};

export default HypixelPanel;
