import React, { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Navigation } from "./Navigation";
import { SettingsOverlay } from "./SettingsOverlay";
import { WelcomeTour } from "./WelcomeTour";
import { ErrorBoundary } from "./ErrorBoundary";
import { X } from "lucide-react";
import { FOCUS } from "../../ui/kit";
import {
  applyBackdropPreferences,
  BACKDROP_PREFERENCES_UPDATED_EVENT,
  BACKDROP_UPDATED_EVENT,
  clearAppliedBackdropPreferences,
  loadBackdropUrl,
} from "../../ui/backdrop";

/**
 * The shell.
 *
 * Since the glass re-vamp the ground is the glass system: a fixed
 * backdrop (the site's hub render, sharp), a near-nothing scrim, and one
 * fixed sheet of frosted glass (.sd-curtain) that the whole app scrolls over.
 * The app content therefore sits in its own `relative z-10` wrapper ABOVE the
 * curtain, and there is still deliberately no background colour on any of
 * these wrappers: an opaque background here would paint straight over the
 * glass, which is exactly the class of bug the old ambient-wash era had.
 *
 * Shell width. `max-w-screen-2xl` is still the class here, but it is no longer
 * a flat 1536px: index.css rebinds that one utility to `--ws-shell`, which
 * steps up at 1920px, 2240px, 2560px and 3200px. The class is left in place on
 * purpose rather than swapped for a bespoke one, because Navigation.tsx uses
 * the same utility and the two must stay on exactly the same width or the
 * wordmark stops lining up with the left edge of the content. One token, three
 * call sites, all of them the page shell. The steps and the reasoning behind
 * each number live next to the rule in index.css.
 */

/**
 * Attribution links. The wiki licence credit and the project credits are not
 * optional and they are not decoration, so they are set at a size a person can
 * actually read rather than the 10px near-black they used to be. Quiet, still
 * legible, still out of the way.
 */
const attributionLink = `text-slate-200 underline decoration-slate-600 underline-offset-2 rounded-sm transition-colors hover:text-emerald-300 hover:decoration-emerald-400/70 ${FOCUS}`;
const FOOTER_DISMISSED_KEY = "skydex.footer.dismissed.v1";

const footerStartsVisible = (): boolean => {
  try {
    return localStorage.getItem(FOOTER_DISMISSED_KEY) !== "true";
  } catch {
    return true;
  }
};

export const Layout: React.FC = () => {
  const location = useLocation();
  const [footerVisible, setFooterVisible] = useState(footerStartsVisible);
  const [rememberFooterDismissal, setRememberFooterDismissal] = useState(false);

  const hideFooter = () => {
    if (rememberFooterDismissal) {
      try {
        localStorage.setItem(FOOTER_DISMISSED_KEY, "true");
      } catch {
        // The current visit can still honour the dismissal without storage.
      }
    }
    setFooterVisible(false);
  };

  const showFooter = () => {
    try {
      localStorage.removeItem(FOOTER_DISMISSED_KEY);
    } catch {
      // The footer can still reopen when browser storage is unavailable.
    }
    setRememberFooterDismissal(false);
    setFooterVisible(true);
  };

  /*
   * The sharp channel (the glass re-vamp). Profile puts the 3D player in its
   * left strip; Storage puts its container picker there. Both therefore need a
   * full-bleed main so the rail reaches the viewport edge instead of being
   * pulled inside the centred shell. The route surface toggles `.sd-channel`
   * on <html> when it has content for that strip.
   */
  const channel =
    location.pathname === "/profile" ||
    location.pathname.startsWith("/profile/") ||
    location.pathname === "/pv" ||
    location.pathname.startsWith("/pv/") ||
    location.pathname === "/storage" ||
    location.pathname.startsWith("/storage/") ||
    location.pathname === "/island" ||
    location.pathname.startsWith("/island/");

  /*
   * The dashboard runs WITHOUT the curtain: the backdrop shows sharp, and
   * each piece of information carries its own frosted pane (.sd-glass)
   * instead of sharing one sheet. Data-dense pages keep the curtain, because
   * a hundred rows each paying for their own backdrop-filter is a slideshow,
   * and one sheet is cheaper and calmer to read on.
   */
  const curtainless = location.pathname === "/";

  /*
   * Tool pages share the Profile page's split: rail under the logo, results
   * under the tabs (SplitPage in the kit). That alignment needs the full
   * viewport, so these routes escape the centred shell the way the channel
   * does. Pages outside every section (about, legal) keep the shell.
   */
  const SPLIT_PREFIXES = ["/fusion", "/recipes", "/crafting", "/items", "/forge", "/greenhouse", "/shard-recipes", "/shards", "/fusion-lines"];
  const split = SPLIT_PREFIXES.some((m) => location.pathname === m || location.pathname.startsWith(`${m}/`));

  /*
   * A player-supplied backdrop, applied through the one seam the stylesheet
   * exposes (--sd-bg). Loaded async so the shipped render paints first and
   * the swap is a background-image change, not a flash.
   */
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    const applyImage = async () => {
      const next = await loadBackdropUrl();
      if (!live) {
        if (next) URL.revokeObjectURL(next);
        return;
      }
      if (url) URL.revokeObjectURL(url);
      url = next;
      if (next) document.documentElement.style.setProperty("--sd-bg", `url("${next}")`);
      else document.documentElement.style.removeProperty("--sd-bg");
    };
    const applyPreferences = () => applyBackdropPreferences();
    applyPreferences();
    void applyImage();
    window.addEventListener(BACKDROP_UPDATED_EVENT, applyImage);
    window.addEventListener(BACKDROP_PREFERENCES_UPDATED_EVENT, applyPreferences);
    return () => {
      live = false;
      window.removeEventListener(BACKDROP_UPDATED_EVENT, applyImage);
      window.removeEventListener(BACKDROP_PREFERENCES_UPDATED_EVENT, applyPreferences);
      if (url) URL.revokeObjectURL(url);
      document.documentElement.style.removeProperty("--sd-bg");
      clearAppliedBackdropPreferences();
    };
  }, []);

  return (
    <div className={`flex min-h-[100dvh] flex-col${curtainless ? " sd-home-shell" : ""}`}>
      {/* The ground has a sharp render and an explicitly blurred copy. The
          copy is clipped to the frost region, so the effect is real even in
          engines which cannot sample a sibling through backdrop-filter. */}
      <div className="sd-backdrop" aria-hidden>
        <div className="sd-backdrop__img" />
        <div className="sd-backdrop__frost" />
        <div className="sd-backdrop__scrim" />
      </div>
      {!curtainless && <div className="sd-curtain" aria-hidden />}

      <div className="relative z-10 flex min-h-[100dvh] flex-col">
        <Navigation />
        <main className={channel || split ? "flex flex-1 flex-col" : "flex-1 px-3 py-3 sm:px-4"}>
          {channel || split ? (
            <ErrorBoundary key={location.pathname} route={location.pathname + location.search}>
              <Outlet key={location.pathname} />
            </ErrorBoundary>
          ) : (
            <div className="mx-auto w-full max-w-screen-2xl">
              <ErrorBoundary key={location.pathname} route={location.pathname + location.search}>
                <Outlet key={location.pathname} />
              </ErrorBoundary>
            </div>
          )}
        </main>

        <footer
          className="sd-footer sd-toolkit px-3 py-2 sm:px-4"
          aria-label="Skydex sources, credits and Minecraft notice"
        >
          {footerVisible && (
            <div className="sd-footer-bar mx-auto w-full max-w-screen-2xl">
              <div className="sd-footer-copy">
                <p className="sd-footer-source">
                  Item, recipe and mutation data and all item images are loaded live from the{" "}
                  <a href="https://hypixelskyblock.minecraft.wiki" target="_blank" rel="noopener noreferrer" className={attributionLink}>
                    Hypixel SkyBlock Wiki
                  </a>
                  , licensed{" "}
                  <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noopener noreferrer" className={attributionLink}>
                    CC BY-NC-SA 3.0
                  </a>
                  . Prices from the public Hypixel API.
                </p>

                <details className="sd-footer-credits">
                  <summary className={`rounded-sm ${FOCUS}`}>
                    <span>Skydex Project Credits</span>
                  </summary>
                  <div className="sd-footer-credit-copy">
                    <p>Thank you to everyone who helped make Skydex possible.</p>
                    <p>
                      Fusion calculator and greenhouse solver forked from{" "}
                      <a href="https://github.com/Campionnn/SkyShards" target="_blank" rel="noopener noreferrer" className={attributionLink}>
                        SkyShards
                      </a>{" "}
                      by Campion and xKapy. Product and interface inspiration from{" "}
                      <a href="https://cupcake.shiiyu.moe" target="_blank" rel="noopener noreferrer" className={attributionLink}>
                        SkyCrypt
                      </a>{" "}
                      and{" "}
                      <a href="https://github.com/meowdding/SkyOcean" target="_blank" rel="noopener noreferrer" className={attributionLink}>
                        SkyOcean
                      </a>
                      . Thanks to{" "}
                      <a href="https://mc-heads.net" target="_blank" rel="noopener noreferrer" className={attributionLink}>
                        MCHeads
                      </a>{" "}
                      for providing Minecraft avatars.
                    </p>
                  </div>
                </details>
              </div>

              <div className="sd-footer-controls">
                <label className="sd-footer-remember">
                  <input
                    type="checkbox"
                    checked={rememberFooterDismissal}
                    onChange={(event) => setRememberFooterDismissal(event.target.checked)}
                  />
                  <span>Don&rsquo;t show details again</span>
                </label>
                <button
                  type="button"
                  className={`sd-footer-hide ${FOCUS}`}
                  onClick={hideFooter}
                  aria-label={rememberFooterDismissal ? "Collapse footer details and remember this choice" : "Collapse footer details"}
                  title={rememberFooterDismissal ? "Keep footer details collapsed" : "Collapse footer details for this visit"}
                >
                  <X aria-hidden />
                </button>
              </div>
            </div>
          )}
          <div className="sd-footer-required mx-auto w-full max-w-screen-2xl">
            {!footerVisible && (
              <button type="button" className={`sd-footer-show ${FOCUS}`} onClick={showFooter}>
                Sources: Hypixel Wiki · CC BY-NC-SA 3.0
              </button>
            )}
            <span className="sd-footer-disclaimer">
              NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
            </span>
          </div>
        </footer>
      </div>

      <SettingsOverlay />
      <WelcomeTour />
    </div>
  );
};
