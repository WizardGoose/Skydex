import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bug, Coffee, Github, Menu, Settings, X } from "lucide-react";
import { FOCUS } from "../../ui/kit";
import { Wordmark } from "../../ui/Wordmark";
import { parseGreenhouseHash } from "../../greenhouse/route";
import { SETTINGS_PARAM, settingsLocation } from "./settingsRoute";

const BUG_REPORT_URL = `https://github.com/WizardGoose/Skydex/issues/new?${new URLSearchParams({
  title: "Skydex bug report",
  body: `<!-- BUG BUG BUG!!! GROSS FREAKIN' BUG!!! Oh wait, I could be freaking out for no reason if its a suggestion... -->

### What needs'a fixin'?
<!-- Anything other than adding more explosives, that is being taken care of, what would you like to see changed/fixed? -->


### Setup/Settings?
<!-- For calculators, include the item/mutation/shard & other settings if you've changed them.  -->


### Screenshot?
<!-- Providing a screenshot really really helps me understand better as I am more visual, and also providing if you're using an iPhone / Safari or PC / Chrome greatly helps! -->

`,
})}`;

/**
 * The masthead, ported from the design bench (the glass re-vamp).
 *
 * Layout is the design mock, read literally: the wordmark holds
 * the left end, the section tabs run along beside it, the settings cog sits
 * at the right end. The bar is the one piece of chrome every page shares, so
 * every item that earns a place in it costs every page some attention.
 *
 * The glass itself is `.sd-bar`: the shared theme's 76% -> 64% ground tint,
 * strongly blurred with a 2px stroke on
 * the bottom edge. Height is the `--sd-bar-h` token (52px), keeping the
 * wordmark and full-height section targets compact without crowding them.
 *
 * What the bench did not have to carry, and this bar does:
 *
 *   - A working mobile menu. The bench deferred narrow viewports outright.
 *
 * The Ironman/Normal toggle is deliberately NOT here.
 * The full control, with the API-detected mode beside it, already lives on
 * the Settings page (SiteSettingsPage's Profile section); the bar carries
 * only what the mock drew.
 */

interface Section {
  label: string;
  title?: string;
  path: string;
  /** Any route starting with one of these belongs to this section. */
  match: string[];
  tools: { label: string; path: string }[];
}

/*
 * The grouping is deliberate, with the
 * bench's one structural change: NO Dashboard tab. The wordmark IS the
 * dashboard link, and a Dashboard tab was saying the same thing
 * as the logo two inches to its left. The section entry stays in this array
 * so route matching still knows "/" is the dashboard; it is simply never
 * rendered as a tab, which is also what makes the dashboard state read
 * correctly: no section is highlighted, because the logo is what is selected.
 */
const SECTIONS: Section[] = [
  { label: "Dashboard", path: "/", match: ["/", "/dashboard"], tools: [] },
  {
    /* No tools row, deliberately -
       the profile page carries its own tab bar, Accessories included. */
    label: "Profile",
    path: "/profile",
    match: ["/profile", "/pv", "/accessories"],
    tools: [],
  },
  { label: "Recipes", path: "/recipes", match: ["/recipes", "/crafting", "/items", "/forge"], tools: [] },
  {
    label: "Storage",
    path: "/storage",
    match: ["/storage", "/island"],
    tools: [],
  },
  {
    label: "Greenhouse",
    path: "/greenhouse",
    match: ["/greenhouse"],
    tools: [],
  },
  {
    label: "Shards",
    path: "/shards",
    match: ["/fusion", "/shard-recipes", "/shards", "/fusion-lines"],
    tools: [],
  },
];

/** The tabs actually drawn. See the SECTIONS comment: Dashboard is the logo. */
const TAB_SECTIONS = SECTIONS.filter((s) => s.label !== "Dashboard");

const SECTION_WARMUPS: Readonly<Record<string, () => Promise<unknown>>> = {
  "/profile": () => import("../../profile-view/ProfileView"),
  "/recipes": () => import("../../pages/ItemsPage"),
  "/storage": () => import("../../pages/StoragePage"),
  "/greenhouse": () => Promise.all([
    import("../../greenhouse/GreenhouseShell"),
    import("../../greenhouse/pages/PlannerPage"),
  ]),
  "/shards": () => import("../../pages/SettingsPage"),
};
const warmedSections = new Set<string>();

/** Start the existing route import while the pointer is already travelling. */
const warmSection = (path: string) => {
  const load = SECTION_WARMUPS[path];
  if (!load || warmedSections.has(path)) return;
  warmedSections.add(path);
  void load().catch(() => warmedSections.delete(path));
};

/**
 * The section the current route belongs to, or null on a page outside every
 * section (settings, about, the legal pages). "/" matches exactly rather than
 * as a prefix, because `startsWith("//")` is true for no real path.
 */
const sectionFor = (pathname: string): Section | null => {
  const hit = SECTIONS.filter((section) => section.match.some((match) => pathname === match || pathname.startsWith(`${match}/`))).sort(
    (a, b) => Math.max(...b.match.map((m) => m.length)) - Math.max(...a.match.map((m) => m.length))
  )[0];
  return hit ?? null;
};

export const Navigation: React.FC = () => {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const active = sectionFor(location.pathname);

  const settingsOpen = new URLSearchParams(location.search).get(SETTINGS_PARAM) === "1";

  /* One font, one size. What differs is only how "current" is drawn: a rule
     under the word. No horizontal padding on the tabs: the first tab's left
     edge has to land exactly on the curtain's edge when the channel is open,
     and 4px of button padding was enough to make the row read as misaligned
     with everything below it. The underline then measures the word rather
     than the word plus padding, which is also the better mark. */
  const tab = (s: Section) => {
    const on = s.label === active?.label;
    return (
      <Link
        key={s.path}
        to={s.path}
        onPointerEnter={() => warmSection(s.path)}
        onFocus={() => warmSection(s.path)}
        onClick={() => setOpen(false)}
        aria-current={on ? "page" : undefined}
        aria-label={s.title}
        title={s.title}
        style={{
          fontFamily: "var(--font-chrome)",
          fontWeight: on ? 800 : 700,
          fontSize: "13px",
          letterSpacing: "0.02em",
        }}
        className={`relative flex h-full cursor-pointer items-center whitespace-nowrap transition-colors duration-150 active:translate-y-px ${FOCUS} ${
          on ? "text-slate-50" : "text-slate-300 hover:text-slate-50"
        }`}
      >
        {s.label}
        {/* Full bar height, rule pinned to the bottom and pulled down by the
            stroke's own 2px, so the mark lands ON the separator instead of
            floating above it as a second line. */}
        <span
          aria-hidden
          className={`absolute -bottom-[2px] left-0 h-[2px] w-full origin-center bg-emerald-400 transition-transform duration-200 motion-reduce:transition-none ${
            on ? "scale-x-100" : "scale-x-0"
          }`}
        />
      </Link>
    );
  };

  return (
    <nav className="sd-masthead-frost sticky top-0 z-[60]">
      <div className="sd-bar relative z-10 w-full" style={{ height: "var(--sd-bar-h)" }}>
        <div className="flex h-full items-center pr-3 sm:pr-5">
          {/* The wordmark's cell is exactly as wide as the page's sharp
              channel, so on a channel page the masthead is columned like the
              page underneath it: logo over the portrait, tabs over the
              content. `minWidth: fit-content` is the guard for every other
              page, where the split is 0 and the cell would otherwise
              collapse onto the logo. */}
          <div
            className="flex h-full shrink-0 items-center"
            style={{
              width: "var(--sd-col)",
              minWidth: "fit-content",
              paddingLeft: "var(--sd-gutter)",
              paddingRight: "1.25rem",
            }}
          >
            <Link
              to="/"
              aria-label="Skydex, dashboard"
              className={`flex w-fit cursor-pointer items-center rounded-sm ${FOCUS}`}
            >
              <Wordmark size={30} />
            </Link>
          </div>

          {/* No `overflow-x-auto` here: the active tab's rule is positioned
              below the button and a scroll container clips it, so the current
              section would silently lose its underline. Narrow viewports use
              the menu instead.

              `h-full` is load bearing rather than decorative. The row is a flex
              item of an `items-center` parent, so without a height of its own
              it takes its content's height, and `h-full` on each tab inside
              then has no definite height to resolve against and collapses to
              the text box. Measured, that made every tab a 19.5px tap target
              in a 68px bar (under the 24px minimum) and left the active rule
              floating mid bar instead of landing on the separator, which is
              the one thing the tab's own comment says it must do. Giving the
              row the bar's height fixes the target and the rule together, and
              moves nothing horizontally. */}
          <div
            className="hidden h-full min-w-0 items-center gap-3 md:flex lg:gap-4"
            style={{ paddingLeft: "var(--sd-inset)" }}
          >
            {TAB_SECTIONS.map(tab)}
          </div>

          <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex">
            <a
              href={BUG_REPORT_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Report a bug on GitHub"
              title="Report a bug on GitHub"
              className={`cursor-pointer rounded-md p-2 text-slate-300 transition-colors hover:bg-white/8 hover:text-slate-50 active:translate-y-px ${FOCUS}`}
            >
              <Bug className="h-[18px] w-[18px]" />
            </a>
            <a
              href="https://github.com/WizardGoose/Skydex"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              title="Skydex on GitHub"
              className={`cursor-pointer rounded-md p-2 text-slate-300 transition-colors hover:bg-white/8 hover:text-slate-50 active:translate-y-px ${FOCUS}`}
            >
              <Github className="h-[18px] w-[18px]" />
            </a>
            <a
              href="https://ko-fi.com/wizardgoose"
              target="_blank"
              rel="noreferrer"
              aria-label="Ko-fi"
              title="Support Skydex on Ko-fi"
              className={`cursor-pointer rounded-md p-2 text-slate-300 transition-colors hover:bg-white/8 hover:text-slate-50 active:translate-y-px ${FOCUS}`}
            >
              <Coffee className="h-[18px] w-[18px]" />
            </a>
            <Link
              to={settingsLocation(location)}
              aria-label="Settings"
              className={`cursor-pointer rounded-md p-2 transition-colors active:translate-y-px ${FOCUS} ${
                settingsOpen ? "bg-emerald-500/15 text-emerald-200" : "text-slate-300 hover:bg-white/8 hover:text-slate-50"
              }`}
            >
              <Settings className="h-[18px] w-[18px]" />
            </Link>
          </div>

          <button
            onClick={() => setOpen(!open)}
            className={`ws-glyph ml-auto cursor-pointer rounded-md p-2 text-slate-300 transition-colors hover:bg-white/8 hover:text-slate-50 md:hidden ${FOCUS}`}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Tools for the current section. Only shown when there is more than
          one. Tint only, never blur: this strip sits over the curtain, whose
          output is already blurred. A second backdrop-filter would cost a
          full-screen pass and return a flat tint. */}
      {active && active.tools.length > 0 && (
        /* `sd-tools` is the hook, not a style: index.css keys the page's
           sticky offset (--sd-chrome-h) off whether this strip is on the page,
           so a rail pinned under the masthead clears the strip too. Height
           comes from the same token the offset adds, so the two cannot
           disagree. */
        <div
          className="sd-tools relative z-10 hidden h-[var(--sd-tools-h)] items-center gap-4 border-b border-white/10 bg-black/25 md:flex"
          style={{ paddingLeft: "calc(var(--sd-col) + var(--sd-inset))" }}
        >
          {active.tools.map((t) => {
            const isActive =
              t.path.startsWith("/greenhouse#")
                ? location.pathname === "/greenhouse" &&
                  t.path === `/greenhouse#${parseGreenhouseHash(location.hash).tool}`
                : location.pathname === t.path;
            return (
              <Link
                key={t.path}
                to={t.path}
                aria-current={isActive ? "page" : undefined}
                className={`flex h-[var(--sd-tools-h)] cursor-pointer items-center border-b-2 text-[13px] transition-colors ${FOCUS} ${
                  isActive ? "border-emerald-500 text-emerald-300" : "border-transparent text-slate-300 hover:text-slate-100"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      )}

      {open && (
        <div className="relative z-10 space-y-2 border-t border-white/10 bg-slate-950/95 px-3 py-2 md:hidden">
          {TAB_SECTIONS.map((s) => (
            <div key={s.path}>
              <Link
                to={s.path}
                onClick={() => setOpen(false)}
                aria-current={s.label === active?.label ? "page" : undefined}
                style={{ fontFamily: "var(--font-chrome)", fontWeight: s.label === active?.label ? 800 : 700, fontSize: "13px" }}
                className={`cursor-pointer rounded-md px-1 py-1 transition-colors ${FOCUS} ${
                  s.label === active?.label ? "text-emerald-200" : "text-slate-300 hover:text-slate-50"
                }`}
              >
                {s.label}
              </Link>
              {s.tools.length > 0 && (
                <div className="flex flex-wrap gap-3 pt-1.5 pl-3">
                  {s.tools.map((t) => (
                    <Link
                      key={t.path}
                      to={t.path}
                      onClick={() => setOpen(false)}
                      className={`cursor-pointer rounded-sm text-[13px] ${FOCUS} ${
                        (t.path.startsWith("/greenhouse#")
                          ? location.pathname === "/greenhouse" &&
                            t.path === `/greenhouse#${parseGreenhouseHash(location.hash).tool}`
                          : location.pathname === t.path)
                          ? "text-emerald-300"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {t.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
          <a href={BUG_REPORT_URL} target="_blank" rel="noreferrer" aria-label="Report a bug on GitHub"
            onClick={() => setOpen(false)}
            className={`flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[13px] text-slate-300 hover:text-slate-50 ${FOCUS}`}>
            <Bug className="h-3.5 w-3.5" />Report a bug
          </a>
          <a
            href="https://github.com/WizardGoose/Skydex"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub"
            onClick={() => setOpen(false)}
            className={`flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[13px] text-slate-300 hover:text-slate-50 ${FOCUS}`}
          >
            <Github className="h-3.5 w-3.5" /> GitHub
          </a>
          <a
            href="https://ko-fi.com/wizardgoose"
            target="_blank"
            rel="noreferrer"
            aria-label="Ko-fi"
            onClick={() => setOpen(false)}
            className={`flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[13px] text-slate-300 hover:text-slate-50 ${FOCUS}`}
          >
            <Coffee className="h-3.5 w-3.5" /> Ko-fi
          </a>
          <Link
            to={settingsLocation(location)}
            onClick={() => setOpen(false)}
            className={`flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[13px] ${FOCUS} ${
              settingsOpen ? "text-emerald-200" : "text-slate-300 hover:text-slate-50"
            }`}
          >
            <Settings className="h-3.5 w-3.5" /> Settings
          </Link>
        </div>
      )}
    </nav>
  );
};
