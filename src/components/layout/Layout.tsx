import React, { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Navigation } from "./Navigation";
import { SettingsOverlay } from "./SettingsOverlay";
import { WelcomeTour } from "./WelcomeTour";
import { AttributionNotice } from "./AttributionNotice";
import { ErrorBoundary } from "./ErrorBoundary";
import { FOCUS } from "../../ui/kit";
import { BACKDROP_UPDATED_EVENT, loadBackdropUrl } from "../../ui/backdrop";

/*
 * The markup pin, discovered rather than imported.
 *
 * That tool is a local working aid, not part of the released project, so
 * `src/dev-local/` is gitignored and a clone of this repository does not
 * contain it. A static `import` of a file that is not on disk fails the build,
 * which would make the clone unbuildable for everyone else.
 *
 * `import.meta.glob` is resolved at build time against what is actually there:
 * it yields the module's loader when the folder is present and an empty object
 * when it is not, so the same source builds either way. Present, the pin is a
 * lazily loaded chunk mounted only under `import.meta.env.DEV`, which is what
 * the static import did. Absent, the constant is null and nothing renders and
 * nothing is fetched.
 *
 * The loader is read positionally rather than by key because the glob matches
 * at most one file, so the value is the whole answer and no assumption about
 * the shape of the generated key has to be correct.
 *
 * The `import.meta.env.DEV` test wraps the lookup rather than only the render,
 * and that placement is the point. `pnpm run deploy` builds on the maintainer's
 * own machine, which is the one machine where this folder does exist, so a
 * discovery that ran unconditionally would emit the tool as a real chunk into
 * the artifact that gets published. Vite replaces the flag with `false` in a
 * production build, which makes this branch unreachable and drops the glob and
 * its import with it, so the published site carries no copy of the tool whether
 * or not the folder was present when it was built.
 */
const DevMarkup = import.meta.env.DEV
  ? (() => {
      const loader = Object.values(import.meta.glob("../../dev-local/DevMarkup.tsx"))[0] as (() => Promise<{ default: React.ComponentType }>) | undefined;
      return loader ? React.lazy(loader) : null;
    })()
  : null;

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

export const Layout: React.FC = () => {
  const location = useLocation();

  /*
   * The sharp channel (the glass re-vamp). The Profile page is the one page
   * with something to STAND in the sharp left strip of the backdrop, namely
   * the 3D player, so it is the one route that gets a full-bleed main: its own
   * layout puts the player at the viewport's left edge, which a centred shell
   * would pull inboard. The `.sd-channel` class itself (which opens
   * `--sd-split`) is toggled on <html> by IslandPage, and only once a profile
   * is actually loaded: the import pitch has nothing to stand in a channel.
   */
  const channel = location.pathname === "/island" || location.pathname.startsWith("/island/");

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
  const SPLIT_PREFIXES = ["/fusion", "/items", "/forge", "/greenhouse", "/recipes", "/shards", "/fusion-lines"];
  const split = SPLIT_PREFIXES.some((m) => location.pathname === m || location.pathname.startsWith(`${m}/`));

  /*
   * A player-supplied backdrop, applied through the one seam the stylesheet
   * exposes (--sd-bg). Loaded async so the shipped render paints first and
   * the swap is a background-image change, not a flash.
   */
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    const apply = async () => {
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
    void apply();
    window.addEventListener(BACKDROP_UPDATED_EVENT, apply);
    return () => {
      live = false;
      window.removeEventListener(BACKDROP_UPDATED_EVENT, apply);
      if (url) URL.revokeObjectURL(url);
      document.documentElement.style.removeProperty("--sd-bg");
    };
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* The ground has a sharp render and an explicitly blurred copy. The
          copy is clipped to the frost region, so the effect is real even in
          engines which cannot sample a sibling through backdrop-filter. */}
      <div className="sd-backdrop" aria-hidden>
        <div className="sd-backdrop__img" />
        <div className="sd-backdrop__frost" />
        <div className="sd-backdrop__bar-frost" />
        <div className="sd-backdrop__scrim" />
      </div>
      {!curtainless && <div className="sd-curtain" aria-hidden />}

      <div className="relative z-10 flex min-h-[100dvh] flex-col">
        <Navigation />
        <main className={channel || split ? "flex flex-1 flex-col" : "flex-1 px-3 py-3 sm:px-4"}>
          {channel || split ? (
            <ErrorBoundary>
              <Outlet key={location.pathname} />
            </ErrorBoundary>
          ) : (
            <div className="mx-auto w-full max-w-screen-2xl">
              <ErrorBoundary>
                <Outlet key={location.pathname} />
              </ErrorBoundary>
            </div>
          )}
        </main>

      <footer className="sd-footer border-t border-white/10 px-3 py-2 sm:px-4">
        <div className="mx-auto w-full max-w-screen-2xl">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="max-w-[120ch] text-[11px] leading-snug text-slate-300">
              NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT
              <br />
              SKYDEX IS NOT AFFILIATED WITH OR ENDORSED BY HYPIXEL.
            </p>
            <details className="basis-full">
              <summary className={`w-fit cursor-pointer rounded-sm text-[10px] leading-snug text-slate-500 transition-colors marker:text-slate-500 hover:text-sky-300 ${FOCUS}`}>
                <span>Skydex Project Credits</span>
                <span aria-hidden="true"> · </span>
                <span>Thank you to everyone who helped make Skydex possible.</span>
              </summary>
              <p className="mt-1 max-w-[120ch] text-[11px] leading-snug text-slate-300">
                Item, recipe and mutation data and all item images are loaded live from the{" "}
                <a href="https://hypixelskyblock.minecraft.wiki" target="_blank" rel="noopener noreferrer" className={attributionLink}>
                  Hypixel SkyBlock Wiki
                </a>
                , licensed{" "}
                <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="noopener noreferrer" className={attributionLink}>
                  CC BY-NC-SA 3.0
                </a>
                . Prices from the public Hypixel API. Fusion calculator and greenhouse solver forked from{" "}
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
            </details>
          </div>
        </div>
      </footer>
      </div>

      <SettingsOverlay />
      <WelcomeTour />
      <AttributionNotice />
      {/* Dev builds only, and only when src/dev-local/ is present on this
          machine: the markup pin for pointing at elements. Statically
          eliminated from production. */}
      {import.meta.env.DEV && DevMarkup && (
        <Suspense fallback={null}>
          <DevMarkup />
        </Suspense>
      )}
    </div>
  );
};
