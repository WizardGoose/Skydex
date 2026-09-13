/**
 * Design census: measure a page instead of arguing about it.
 *
 * Deciding whether a layout "fits the site" by trying candidates and looking at
 * them is expensive, because every judgement starts from scratch and nothing
 * from the last attempt carries forward. This rig turns a rendered page into
 * numbers, so the question becomes a diff against a page already agreed to be
 * right rather than a fresh opinion each time.
 *
 * The reference page is whichever route is marked `baseline` below. Every other
 * route is reported as a deviation from it.
 *
 * ---------------------------------------------------------------------------
 * USAGE (one command re-runs everything)
 *
 *   node tools/census.mjs
 *
 * Options:
 *   --out DIR       Report directory. Default: <tmp>/skydex-census.
 *                   Nothing is written inside the repository by default.
 *   --port N        Dev server port. Default 5173.
 *   --routes all    Measure the second-strip tool routes as well as the
 *                   top-nav destinations. Default measures the nav only.
 *   --routes a,b    Measure the named route ids only.
 *   --width N       Viewport width in CSS px. Default 1920.
 *   --height N      Viewport height in CSS px. Default 1080.
 *   --no-seed       Skip localStorage seeding; measure every route cold.
 *   --keep-open     Leave Chrome running for manual inspection.
 *
 * Writes per route: <id>.json (measured facts) and <id>.png (full page).
 * Writes once:      census-summary.json (cross page comparison table).
 *
 * ---------------------------------------------------------------------------
 * HOW IT WORKS
 *
 * A screenshot alone cannot answer "what font sizes are on this page", so this
 * drives Chrome over the DevTools protocol rather than through the plain
 * `--screenshot` flag. Chrome is launched headless with a throwaway profile and
 * a debugging port; the page target is driven directly over one WebSocket, and
 * the measurement pass runs in the page via Runtime.evaluate. Node 22 supplies
 * both `WebSocket` and `fetch` as globals, so this needs no dependencies.
 *
 * The dev server is treated as read only. It is never started, restarted or
 * stopped here. A server that is not answering is reported as an error, because
 * Chrome's own "site cannot be reached" page renders perfectly well and would
 * otherwise be measured as though it were a real, sparse page.
 *
 * ---------------------------------------------------------------------------
 * SEEDING
 *
 * Some routes render an invitation to import data rather than the interface
 * worth measuring. A throwaway browser profile has no such data, so the profile
 * route would otherwise be measured in a state nobody uses.
 *
 * Seeding writes localStorage keys directly through the protocol once the
 * origin is loaded. Writing keys in place is preferable to serving a temporary
 * seed page from the public directory: there is no file to create, therefore no
 * file to forget to delete, and the repository is never touched.
 *
 * Only data already committed to the repository is seeded. No API credential is
 * synthesised. Any route that genuinely needs a live keyed request is measured
 * in whatever state it honestly reaches, and the state is recorded per route in
 * the report so that a sparse page is never confused with a sparse design.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");

/* ------------------------------------------------------------------------ */
/* Configuration                                                             */
/* ------------------------------------------------------------------------ */

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

/**
 * Every top-nav destination, plus the tool routes behind the second strip.
 *
 * `nav: true` marks a destination reachable from the primary tab row; those are
 * the default measurement set. The wordmark links to the dashboard, which is
 * why the dashboard is a nav destination without being a tab.
 *
 * `always: true` marks a state variant of a nav route that is measured by
 * default anyway. A route that opens on a placeholder and fills in only after a
 * selection has two designs in it, and judging the page from the empty one
 * alone would attribute the placeholder's emptiness to the layout.
 */
const ROUTES = [
  { id: "dashboard", path: "/", label: "Dashboard", nav: true },
  { id: "profile", path: "/island", label: "Profile (island)", nav: true, baseline: true },
  { id: "crafting", path: "/items", label: "Crafting (no selection)", nav: true },
  /* `q` is consumed once on load and selects the single matching item, so the
   * filled state of the detail column is reachable from a cold navigation. */
  { id: "crafting-selected", path: "/items?q=Hyperion", label: "Crafting (item selected)", always: true },
  { id: "forge", path: "/forge", label: "Forge", nav: true },
  { id: "greenhouse-planner", path: "/greenhouse/planner", label: "Greenhouse / Planner", nav: true },
  { id: "shards-fusion", path: "/fusion", label: "Shards / Fusion", nav: true },
  { id: "greenhouse-solver", path: "/greenhouse", label: "Greenhouse / Solver" },
  { id: "greenhouse-designer", path: "/greenhouse/designer", label: "Greenhouse / Designer" },
  { id: "shards-recipes", path: "/recipes", label: "Shards / Recipes" },
  { id: "shards-overview", path: "/shards", label: "Shards / Overview" },
  { id: "shards-lines", path: "/fusion-lines", label: "Shards / Lines" },
];

/**
 * The type scale actually in use, in CSS px.
 *
 * Derived by census of the source rather than from intent, because intent and
 * practice drift apart and only practice is on screen. Re-derive after any
 * change to the kit:
 *
 *   grep -rhoE "text-\[[0-9.]+px\]" src/ | sort | uniq -c | sort -rn
 *   grep -rhoE "text-(xs|sm|base|lg|xl|2xl|3xl)\b" src/ | sort | uniq -c
 *
 * The arbitrary values contribute 8 through 20; the named Tailwind sizes
 * contribute 12, 14, 16, 18, 20, 24 and 30. A size outside this set is not
 * automatically wrong, but it is unowned: it belongs to no band anyone chose,
 * and it is usually an inherited default or an unrounded rem calculation.
 */
const SITE_SCALE = [8, 9, 10, 11, 12, 12.5, 13, 14, 14.5, 15, 16, 18, 20, 24, 30];

/**
 * The palette. Accent values are the span colours the tour format honours; the
 * chrome values are the slate and accent inks used on panels.
 */
const PALETTE = {
  blue: "#6fd0fb",
  gold: "#ffb545",
  green: "#63d97d",
  red: "#f04747",
  pink: "#fa80d5",
  teal: "#5ef3df",
  purple: "#cf7ff0",
  white: "#f5f7fa",
  "slate-100": "#e8edf3",
  "slate-300": "#b2bfce",
  "slate-400": "#93a3b8",
  "accent-400": "#38bdf2",
};

/** Icon and thumbnail sizes that respect the halving rule. */
const ICON_STEPS = [16, 32, 64];

/** Surfaces that count as a panel. */
const PANEL_SELECTOR = ".ws-panel, .sd-glass, .sd-panel";

/** Elements that count as a control for height comparison. */
const CONTROL_SELECTOR =
  'button, input, select, textarea, [role="tab"], [role="button"], [role="switch"], [role="checkbox"]';

/* Settle policy. Wiki backed routes fetch their data at runtime, so a fixed
 * sleep either wastes time or measures a half built page. Quiet time since the
 * last network event is the honest signal. Note that an open event stream never
 * completes, so waiting for zero in-flight requests would hang forever; waiting
 * for quiet does not. */
const SETTLE_QUIET_MS = 1200;
const SETTLE_MAX_MS = 30000;
const SETTLE_MIN_MS = 600;

/* Chrome refuses to capture beyond a certain surface height. Cap rather than
 * fail, and record the cap in the report when it bites. */
const MAX_CAPTURE_HEIGHT = 16384;

/* ------------------------------------------------------------------------ */
/* Argument parsing                                                          */
/* ------------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = argv.indexOf(`--${name}`);
  if (hit === -1) return fallback;
  const next = argv[hit + 1];
  return next && !next.startsWith("--") ? next : true;
};

const OUT_DIR = resolve(String(flag("out", join(tmpdir(), "skydex-census"))));
const PORT = Number(flag("port", 5173));
const WIDTH = Number(flag("width", 1920));
const HEIGHT = Number(flag("height", 1080));
const ROUTE_ARG = flag("routes", "");
const NO_SEED = argv.includes("--no-seed");
const KEEP_OPEN = argv.includes("--keep-open");
const ORIGIN = `http://localhost:${PORT}`;

const selectedRoutes = (() => {
  if (ROUTE_ARG === "all" || ROUTE_ARG === true) return ROUTES;
  if (!ROUTE_ARG) return ROUTES.filter((r) => r.nav || r.always);
  const wanted = new Set(String(ROUTE_ARG).split(",").map((s) => s.trim()));
  const picked = ROUTES.filter((r) => wanted.has(r.id));
  if (!picked.length) {
    console.error(`No route ids matched "${ROUTE_ARG}". Known ids: ${ROUTES.map((r) => r.id).join(", ")}`);
    process.exit(1);
  }
  return picked;
})();

/* ------------------------------------------------------------------------ */
/* DevTools protocol client                                                  */
/* ------------------------------------------------------------------------ */

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.id !== undefined) {
        const slot = this.pending.get(msg.id);
        if (!slot) return;
        this.pending.delete(msg.id);
        if (msg.error) slot.reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else slot.resolve(msg.result);
        return;
      }
      const handlers = this.listeners.get(msg.method);
      if (handlers) for (const fn of handlers) fn(msg.params);
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((res, rej) => {
      socket.addEventListener("open", res, { once: true });
      socket.addEventListener("error", () => rej(new Error(`Cannot open ${url}`)), { once: true });
    });
    return new Cdp(socket);
  }

  send(method, params = {}) {
    const id = ++this.seq;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve_, reject) => this.pending.set(id, { resolve: resolve_, reject }));
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  /** Evaluate a function in the page and return its value. */
  async call(fn, arg) {
    const expression = `(${fn.toString()})(${JSON.stringify(arg ?? null)})`;
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      timeout: 30000,
    });
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error(`page evaluation failed: ${d.exception?.description ?? d.text}`);
    }
    return res.result.value;
  }

  close() {
    try {
      this.socket.close();
    } catch {
      /* already gone */
    }
  }
}

/* ------------------------------------------------------------------------ */
/* The measurement pass (runs inside the page)                               */
/* ------------------------------------------------------------------------ */

/**
 * Collect design facts from the rendered document.
 *
 * Serialised and evaluated in the page, so it must reference nothing outside
 * its own scope and must return only structured clonable values. Every number
 * here is read from layout or computed style; none is inferred from source.
 */
function pageCensus(cfg) {
  const round = (n, places = 2) => {
    const f = 10 ** places;
    return Math.round(n * f) / f;
  };
  const styles = new WeakMap();
  const cs = (el) => {
    let v = styles.get(el);
    if (!v) {
      v = getComputedStyle(el);
      styles.set(el, v);
    }
    return v;
  };
  const visible = (el) => {
    if (!el || el.nodeType !== 1) return false;
    if (typeof el.checkVisibility === "function") {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: round(r.x + scrollX, 1),
      y: round(r.y + scrollY, 1),
      w: round(r.width, 1),
      h: round(r.height, 1),
    };
  };
  const px = (v) => round(parseFloat(v) || 0, 1);

  /* A stable description of "what kind of element is this", used to find the
   * repeated unit inside a panel. Class order is normalised so that two rows
   * built by the same component always agree. */
  const signature = (el) => {
    const cls = (typeof el.className === "string" ? el.className : "")
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(".");
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}`;
  };

  /* --- font histogram -------------------------------------------------- */

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TITLE", "TEMPLATE"]);
  const fontBuckets = new Map();
  let totalChars = 0;

  const main = document.querySelector("main") || document.body;
  const mainRect = main.getBoundingClientRect();
  let mainChars = 0;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.nodeValue || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const el = node.parentElement;
    if (!el || SKIP_TAGS.has(el.tagName)) continue;
    if (!visible(el)) continue;

    const style = cs(el);
    const size = round(parseFloat(style.fontSize), 2);
    const weight = String(style.fontWeight);
    const key = String(size);
    let bucket = fontBuckets.get(key);
    if (!bucket) {
      bucket = { size, chars: 0, nodes: 0, weights: {}, colours: {}, samples: [] };
      fontBuckets.set(key, bucket);
    }
    bucket.chars += text.length;
    bucket.nodes += 1;
    bucket.weights[weight] = (bucket.weights[weight] || 0) + 1;
    bucket.colours[style.color] = (bucket.colours[style.color] || 0) + 1;
    if (bucket.samples.length < 4) bucket.samples.push(text.slice(0, 48));
    totalChars += text.length;
    if (main.contains(el)) mainChars += text.length;
  }

  const scaleSet = new Set(cfg.scale);
  const fonts = [...fontBuckets.values()]
    .sort((a, b) => b.chars - a.chars)
    .map((b) => ({
      size: b.size,
      chars: b.chars,
      nodes: b.nodes,
      shareOfChars: totalChars ? round((b.chars / totalChars) * 100, 1) : 0,
      weights: b.weights,
      dominantWeight: Object.entries(b.weights).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
      colours: Object.entries(b.colours)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 3)
        .map(([c, n]) => ({ colour: c, nodes: n })),
      onScale: scaleSet.has(b.size),
      samples: b.samples,
    }));

  /* Hierarchy: how many distinct type levels actually carry the page. A level
   * is a (size, dominant weight) pair holding at least one percent of the
   * visible characters. A page that reads as flat has few of these and a small
   * ratio between its largest and smallest carrying size. */
  const carrying = fonts.filter((f) => f.shareOfChars >= 1);
  const carryingSizes = carrying.map((f) => f.size);
  const levels = new Set(carrying.map((f) => `${f.size}/${f.dominantWeight}`));

  /* --- panels ---------------------------------------------------------- */

  const panels = [...document.querySelectorAll(cfg.panelSelector)]
    .filter(visible)
    .map((el) => {
      const style = cs(el);
      const box = rect(el);
      const descendants = el.querySelectorAll("*");

      /* Find the repeated unit: the longest run of sibling elements sharing a
       * signature. Counting every matching descendant instead would return the
       * leaf art inside a tile rather than the tile, because there is one image
       * per tile and the image sits deeper. The unit that carries information
       * is the sibling, so the search runs over children of each container. */
      let best = null;
      for (const container of [el, ...descendants]) {
        const kids = [...container.children].filter(visible);
        if (kids.length < 4) continue;
        const groups = new Map();
        for (const kid of kids) {
          const sig = signature(kid);
          if (!groups.has(sig)) groups.set(sig, []);
          groups.get(sig).push(kid);
        }
        for (const [sig, list] of groups) {
          if (!best || list.length > best.count) best = { sig, count: list.length, sample: list[0] };
        }
      }
      const repeatSig = best ? best.sig : null;
      const repeatCount = best ? best.count : 0;

      /* What one repeated unit actually carries. "Shows enough information" is
       * a claim about this number, not about the panel as a whole: a long list
       * of one-word rows and a short grid of labelled tiles can hold identical
       * character counts while carrying very different amounts of meaning. */
      let unit = null;
      if (best) {
        let textNodes = 0;
        const utw = document.createTreeWalker(best.sample, NodeFilter.SHOW_TEXT);
        for (let n = utw.nextNode(); n; n = utw.nextNode()) {
          const t = (n.nodeValue || "").replace(/\s+/g, " ").trim();
          if (t && n.parentElement && !SKIP_TAGS.has(n.parentElement.tagName) && visible(n.parentElement)) {
            textNodes += 1;
          }
        }
        const art = [...best.sample.querySelectorAll("img, svg, canvas")].filter(visible).length;
        const sizesInUnit = new Set();
        for (const node of [best.sample, ...best.sample.querySelectorAll("*")]) {
          if (!visible(node)) continue;
          const own = [...node.childNodes].some((n) => n.nodeType === 3 && (n.nodeValue || "").trim());
          if (own) sizesInUnit.add(round(parseFloat(cs(node).fontSize), 2));
        }
        unit = {
          box: rect(best.sample),
          textNodes,
          art,
          datums: textNodes + art,
          typeLevels: sizesInUnit.size,
          fontSizes: [...sizesInUnit].sort((a, b) => b - a),
        };
      }

      /* A panel whose content scrolls inside itself hides most of what it
       * holds. Without this the panel looks small and the page looks empty,
       * and the two facts are the same fact. */
      const scrollers = [el, ...descendants].filter(
        (n) => visible(n) && n.scrollHeight > n.clientHeight + 2 && /auto|scroll/.test(cs(n).overflowY)
      );
      const scroll = scrollers.length
        ? {
            virtual: true,
            clientHeight: scrollers[0].clientHeight,
            scrollHeight: scrollers[0].scrollHeight,
            hiddenPx: scrollers[0].scrollHeight - scrollers[0].clientHeight,
            visibleShare: round((scrollers[0].clientHeight / scrollers[0].scrollHeight) * 100, 1),
          }
        : { virtual: false };

      /* Visible text only, matching the font histogram exactly.
       *
       * Counting every text node instead would fold hover labels and assistive
       * text into the total. An icon grid carries a name per tile that is not
       * drawn until hover, which is enough to make a wall of pictures report as
       * the densest prose on the site and to inflate the baseline that every
       * other page is then judged against. */
      let chars = 0;
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        const t = (n.nodeValue || "").replace(/\s+/g, " ").trim();
        if (!t || !n.parentElement) continue;
        if (SKIP_TAGS.has(n.parentElement.tagName)) continue;
        if (!visible(n.parentElement)) continue;
        chars += t.length;
      }

      const area = box.w * box.h;
      return {
        signature: signature(el),
        surface: el.classList.contains("ws-panel")
          ? "ws-panel"
          : el.classList.contains("sd-glass")
            ? "sd-glass"
            : "sd-panel",
        box,
        padding: {
          top: px(style.paddingTop),
          right: px(style.paddingRight),
          bottom: px(style.paddingBottom),
          left: px(style.paddingLeft),
        },
        gap: px(style.rowGap),
        borderRadius: px(style.borderTopLeftRadius),
        borderWidth: px(style.borderTopWidth),
        display: style.display,
        directChildren: el.childElementCount,
        descendants: descendants.length,
        chars,
        charsPer10kPx: area ? round((chars / area) * 10000, 1) : 0,
        repeatedUnit: repeatSig,
        repeatedCount: repeatCount,
        unit,
        scroll,
      };
    })
    .sort((a, b) => a.box.y - b.box.y);

  /* --- density --------------------------------------------------------- */

  /* Area is taken from the laid out column, not the viewport, so a long page
   * and a short page are compared on the same terms. */
  const mainW = round(main.scrollWidth || mainRect.width, 1);
  const mainH = round(Math.max(main.scrollHeight, mainRect.height), 1);
  const mainArea = mainW * mainH;

  /* Occupancy: where the page is empty, and by how much.
   *
   * "Too big for what it is" is a statement about the ratio between the space a
   * layout claims and the space it fills. Panel area share answers it for the
   * page as a whole; the vertical gap list answers it for the first screen,
   * which is the only part most viewers judge. Both are needed, because a page
   * can be well filled overall and still open on a large empty band. */
  const mainTop = round(mainRect.y + scrollY, 1);
  const mainBottom = mainTop + mainH;
  const spans = panels
    .map((p) => [p.box.y, p.box.y + p.box.h])
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  let coveredPx = 0;
  let largestGap = { from: null, to: null, px: 0 };
  let cursor = mainTop;
  for (const [from, to] of merged) {
    if (from - cursor > largestGap.px) largestGap = { from: round(cursor, 1), to: round(from, 1), px: round(from - cursor, 1) };
    coveredPx += Math.max(0, to - Math.max(from, cursor));
    cursor = Math.max(cursor, to);
  }
  if (mainBottom - cursor > largestGap.px) {
    largestGap = { from: round(cursor, 1), to: round(mainBottom, 1), px: round(mainBottom - cursor, 1) };
  }
  const firstScreenBottom = Math.min(mainTop + cfg.viewportHeight, mainBottom);
  let firstScreenCovered = 0;
  for (const [from, to] of merged) {
    firstScreenCovered += Math.max(0, Math.min(to, firstScreenBottom) - Math.max(from, mainTop));
  }
  const firstScreenPx = Math.max(1, firstScreenBottom - mainTop);
  const occupancy = {
    mainTop,
    mainBottom: round(mainBottom, 1),
    panelRowsCoveredPx: round(coveredPx, 1),
    verticalCoverage: round((coveredPx / Math.max(1, mainH)) * 100, 1),
    largestEmptyBand: largestGap,
    firstScreenCoverage: round((firstScreenCovered / firstScreenPx) * 100, 1),
    lowestPanelBottom: merged.length ? round(merged[merged.length - 1][1], 1) : null,
    /* Widest panel against the column it sits in. A narrow content strip in a
     * wide column reads as emptiness even when the strip itself is dense. */
    widestPanelShareOfColumn: panels.length
      ? round((Math.max(...panels.map((p) => p.box.w)) / Math.max(1, mainW)) * 100, 1)
      : null,
  };

  /* --- controls -------------------------------------------------------- */

  const controlBuckets = new Map();
  for (const el of document.querySelectorAll(cfg.controlSelector)) {
    if (!visible(el)) continue;
    const style = cs(el);
    const box = rect(el);
    const role = el.getAttribute("role");
    const kind = role ? `[role=${role}]` : el.tagName.toLowerCase() + (el.type ? `[type=${el.type}]` : "");
    let bucket = controlBuckets.get(kind);
    if (!bucket) {
      bucket = { kind, count: 0, heights: {}, fontSizes: {}, samples: [] };
      controlBuckets.set(kind, bucket);
    }
    bucket.count += 1;
    const h = round(box.h, 1);
    bucket.heights[h] = (bucket.heights[h] || 0) + 1;
    /* The size of the text that is actually drawn, not the element's own
     * font-size. A control whose label lives in a child span inherits an
     * unused value, and reporting it would describe type that is not on
     * screen: a row can compute at 16px while every glyph in it renders 12px. */
    let textEl = null;
    const ctw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = ctw.nextNode(); n && !textEl; n = ctw.nextNode()) {
      if ((n.nodeValue || "").trim() && n.parentElement && visible(n.parentElement)) textEl = n.parentElement;
    }
    const fsz = round(parseFloat(cs(textEl || el).fontSize), 2);
    bucket.fontSizes[fsz] = (bucket.fontSizes[fsz] || 0) + 1;
    if (bucket.samples.length < 3) {
      bucket.samples.push({
        text: (el.textContent || el.value || "").replace(/\s+/g, " ").trim().slice(0, 32),
        h,
        w: round(box.w, 1),
        fontSize: fsz,
        paddingX: px(style.paddingLeft) + px(style.paddingRight),
        paddingY: px(style.paddingTop) + px(style.paddingBottom),
      });
    }
  }
  const modeOf = (obj) => {
    const hit = Object.entries(obj).sort((a, b) => b[1] - a[1])[0];
    return hit ? Number(hit[0]) : null;
  };
  const controls = [...controlBuckets.values()]
    .map((b) => ({ ...b, modalHeight: modeOf(b.heights), modalFontSize: modeOf(b.fontSizes) }))
    .sort((a, b) => b.count - a.count);

  /* --- media ----------------------------------------------------------- */

  const media = [];
  const mediaIssues = [];
  for (const el of document.querySelectorAll("img, svg, canvas")) {
    if (!visible(el)) continue;
    const box = rect(el);
    const w = Math.round(box.w);
    const h = Math.round(box.h);
    const natural =
      el.tagName === "IMG" && el.naturalWidth
        ? { w: el.naturalWidth, h: el.naturalHeight }
        : null;
    const entry = {
      tag: el.tagName.toLowerCase(),
      rendered: { w, h },
      natural,
      scale: natural && natural.w ? round(box.w / natural.w, 3) : null,
      src: el.tagName === "IMG" ? String(el.currentSrc || el.src || "").slice(-72) : null,
    };
    /* Icon sized art is expected to land on the halving rule. Larger art is
     * free to be any size, so only small boxes are judged against it. */
    const small = Math.max(w, h) <= 96 && Math.max(w, h) > 0;
    if (small && w === h && !cfg.iconSteps.includes(w)) {
      entry.offGrid = true;
      mediaIssues.push({ reason: "icon size off the 16/32/64 rule", size: w, src: entry.src });
    }
    if (entry.scale !== null && entry.scale !== 1) {
      const inv = 1 / entry.scale;
      const cleanUp = Math.abs(entry.scale - Math.round(entry.scale)) < 0.001;
      const cleanDown = Math.abs(inv - Math.round(inv)) < 0.001;
      if (!cleanUp && !cleanDown) {
        entry.fractionalScale = true;
        mediaIssues.push({
          reason: "non integer scaling",
          scale: entry.scale,
          rendered: entry.rendered,
          natural,
          src: entry.src,
        });
      }
    }
    media.push(entry);
  }

  /* --- colour census ---------------------------------------------------- */

  const toHex = (value) => {
    const m = String(value).match(/rgba?\(([^)]+)\)/);
    if (!m) return { value: String(value), alpha: 1 };
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    const [r, g, b] = parts;
    const alpha = parts.length > 3 ? parts[3] : 1;
    const hex = "#" + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
    return { value: hex, alpha };
  };

  const inks = new Map();
  const fills = new Map();
  for (const el of document.querySelectorAll("*")) {
    if (SKIP_TAGS.has(el.tagName)) continue;
    if (!visible(el)) continue;
    const style = cs(el);

    const hasOwnText = [...el.childNodes].some(
      (n) => n.nodeType === 3 && (n.nodeValue || "").trim().length > 0
    );
    if (hasOwnText) {
      const ink = toHex(style.color);
      const key = ink.alpha === 1 ? ink.value : `${ink.value}@${round(ink.alpha, 2)}`;
      inks.set(key, (inks.get(key) || 0) + 1);
    }

    const fill = toHex(style.backgroundColor);
    if (fill.alpha > 0) {
      const key = fill.alpha === 1 ? fill.value : `${fill.value}@${round(fill.alpha, 2)}`;
      fills.set(key, (fills.get(key) || 0) + 1);
    }
  }

  const known = new Set(Object.values(cfg.palette).map((h) => h.toLowerCase()));
  const rank = (map) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({
        value,
        count,
        inPalette: known.has(value.split("@")[0].toLowerCase()),
      }));

  /* --- page ------------------------------------------------------------- */

  const panelArea = panels.reduce((sum, p) => sum + p.box.w * p.box.h, 0);

  return {
    page: {
      url: location.href,
      title: document.title,
      htmlClass: document.documentElement.className,
      scrollHeight: document.documentElement.scrollHeight,
      viewport: { w: innerWidth, h: innerHeight },
      mainColumn: { w: mainW, h: mainH, x: round(mainRect.x + scrollX, 1) },
      panelCount: panels.length,
      panelAreaShareOfMain: mainArea ? round((panelArea / mainArea) * 100, 1) : 0,
    },
    density: {
      visibleChars: totalChars,
      mainChars,
      mainArea: Math.round(mainArea),
      charsPer10kPx: mainArea ? round((mainChars / mainArea) * 10000, 1) : 0,
      panelsPerScreen: round(panels.length / Math.max(1, mainH / cfg.viewportHeight), 2),
      /* Characters against panel surface rather than against the column. This
       * is the density a viewer actually experiences, because the empty column
       * around a panel is not something they read.
       *
       * Null, not 0, when there is no panel surface to measure. A page can
       * legitimately render no panels, and 0 here does not mean "empty
       * panels", it means the ratio has no denominator. Reported as 0 it
       * becomes a real -100% against the baseline in the very table used to
       * rule on sparseness, which is a measurement the run never took. */
      charsPer10kPanelPx: (() => {
        const panelArea = panels.reduce((sum, p) => sum + p.box.w * p.box.h, 0);
        const panelChars = panels.reduce((sum, p) => sum + p.chars, 0);
        return panelArea ? round((panelChars / panelArea) * 10000, 1) : null;
      })(),
    },
    occupancy,
    hierarchy: {
      distinctSizes: fonts.length,
      carryingSizes: carryingSizes,
      carryingLevels: levels.size,
      largestCarrying: carryingSizes.length ? Math.max(...carryingSizes) : null,
      smallestCarrying: carryingSizes.length ? Math.min(...carryingSizes) : null,
      spread: carryingSizes.length
        ? round(Math.max(...carryingSizes) / Math.min(...carryingSizes), 2)
        : null,
      offScale: fonts.filter((f) => !f.onScale).map((f) => ({ size: f.size, chars: f.chars, nodes: f.nodes })),
    },
    fonts,
    panels,
    controls,
    media: {
      count: media.length,
      renderedSizes: media.reduce((acc, m) => {
        const k = `${m.rendered.w}x${m.rendered.h}`;
        acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {}),
      issues: mediaIssues.slice(0, 40),
      issueCount: mediaIssues.length,
    },
    colours: {
      inks: rank(inks),
      fills: rank(fills).slice(0, 40),
      inkCount: inks.size,
      fillCount: fills.size,
      offPaletteInks: rank(inks).filter((c) => !c.inPalette).length,
    },
  };
}

/**
 * Report what state the page reached, so a sparse measurement is never read as
 * a sparse design. Runs in the page alongside the census.
 */
function pageState() {
  const main = document.querySelector("main") || document.body;
  const text = (main.textContent || "").replace(/\s+/g, " ").trim();
  /* Signals quote the phrase that fired them.
   *
   * A bare boolean is not reviewable and reads as a verdict. Loose wording
   * makes this worse: a populated page that merely mentions an optional key, or
   * explains what it could not classify, trips a naive "error" or "api key"
   * probe and is then filed as broken. Patterns are anchored to phrasing that
   * only an actual empty or blocked state uses, and the matched text travels
   * with the flag so the call can be checked rather than trusted. */
  const probes = [
    { key: "importPrompt", re: /\b(no inventory imported|paste a|import your|no snapshot)\b/i },
    { key: "apiKeyBlocked", re: /\b(set up your api key|invalid key|key required|no api key)\b/i },
    { key: "loading", re: /\b(loading|fetching|please wait)\b/i },
    { key: "error", re: /\b(failed to|went wrong|unable to load|could not load)\b/i },
    { key: "emptyResult", re: /\b(no results|nothing here|no data|pick an item|choose an item)\b/i },
  ];
  const signals = {};
  const evidence = {};
  for (const p of probes) {
    const hit = text.match(p.re);
    signals[p.key] = Boolean(hit);
    if (hit) {
      const at = Math.max(0, hit.index - 40);
      evidence[p.key] = text.slice(at, hit.index + hit[0].length + 60);
    }
  }

  const heading = document.querySelector("main h1, main h2, h1");
  /* A hero page can hold no text nodes at all: wordmark drawn as vector, the
   * only words a placeholder attribute. Recording that keeps a legitimate zero
   * from being read as a failed measurement. */
  const placeholders = [...document.querySelectorAll("input[placeholder], textarea[placeholder]")]
    .map((el) => el.getAttribute("placeholder"))
    .filter(Boolean)
    .slice(0, 6);

  return {
    signals,
    evidence,
    firstHeading: heading ? (heading.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80) : null,
    mainTextLength: text.length,
    mainTextHead: text.slice(0, 220),
    placeholders,
  };
}

/* ------------------------------------------------------------------------ */
/* Chrome lifecycle                                                          */
/* ------------------------------------------------------------------------ */

const freePort = () =>
  new Promise((res, rej) => {
    const srv = createServer();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function waitForEndpoint(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  throw new Error(`Chrome debugging endpoint never opened on port ${port}`);
}

async function firstPageTarget(port) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await res.json();
    const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    if (page) return page;
    await sleep(150);
  }
  throw new Error("Chrome exposed no page target");
}

/* ------------------------------------------------------------------------ */
/* Navigation and settle                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Navigate and wait for the page to stop changing.
 *
 * Quiet time since the last network event is the signal rather than in-flight
 * count reaching zero, because a route holding an open event stream keeps one
 * request in flight for as long as the page lives.
 */
async function gotoAndSettle(cdp, url, net) {
  net.lastEvent = Date.now();
  net.loaded = false;
  await cdp.send("Page.navigate", { url });

  const started = Date.now();
  await sleep(SETTLE_MIN_MS);
  while (Date.now() - started < SETTLE_MAX_MS) {
    const quiet = Date.now() - net.lastEvent;
    if (net.loaded && quiet > SETTLE_QUIET_MS) break;
    await sleep(120);
  }
  /* One more frame so any layout scheduled by the last response is committed. */
  await cdp.call(
    () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res(true))))
  );
  return {
    settleMs: Date.now() - started,
    hitSettleCap: Date.now() - started >= SETTLE_MAX_MS,
  };
}

async function captureFullPage(cdp, path) {
  const metrics = await cdp.send("Page.getLayoutMetrics");
  const content = metrics.cssContentSize || metrics.contentSize;
  const fullHeight = Math.min(Math.ceil(content.height), MAX_CAPTURE_HEIGHT);
  const clipped = Math.ceil(content.height) > MAX_CAPTURE_HEIGHT;

  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: fullHeight,
    deviceScaleFactor: 1,
    mobile: false,
  });
  /* Give the taller viewport a frame to settle any size dependent layout. */
  await sleep(250);
  const shot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  writeFileSync(path, Buffer.from(shot.data, "base64"));
  return { height: fullHeight, clipped };
}

/* ------------------------------------------------------------------------ */
/* Seeding                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * Build the localStorage payload from data committed to the repository.
 *
 * The island snapshot fixture is the companion mod's export contract, which is
 * exactly the shape the storage layer validates, so it can be stored verbatim.
 * The stored envelope is the current two feed shape; section provenance is left
 * out because the reader re-derives it from the snapshot when absent.
 */
function buildSeed() {
  const fixture = join(REPO, "src", "island", "__tests__", "fixtures", "island-ref.json");
  const entries = [
    /* Any non null value suppresses the welcome tour, which would otherwise
     * cover the first route measured and nothing after it. */
    { key: "skydex.welcome.v1", value: "1", note: "welcome tour suppressed" },
  ];

  if (existsSync(fixture)) {
    const snapshot = JSON.parse(readFileSync(fixture, "utf8"));
    entries.push({
      key: "wizardsky.island.v1",
      value: JSON.stringify({
        v: 2,
        feeds: { mod: { receivedAt: snapshot.exportedAt ?? 0, snapshot } },
      }),
      note: `island snapshot from repository fixture (schema ${snapshot.schema})`,
    });
  }
  return entries;
}

/* ------------------------------------------------------------------------ */
/* Comparison                                                                */
/* ------------------------------------------------------------------------ */

const pct = (value, base) =>
  base === 0 || base === null || value === null ? null : Math.round(((value - base) / base) * 100);

/** Reduce a full route report to the row that goes in the comparison table. */
function summarise(report) {
  const fonts = report.census.fonts;
  const dominant = fonts.slice(0, 3).map((f) => ({ size: f.size, share: f.shareOfChars }));
  const panels = report.census.panels;
  const pads = panels.map((p) => p.padding.top).filter((n) => n > 0).sort((a, b) => a - b);
  const median = (arr) => (arr.length ? arr[Math.floor(arr.length / 2)] : null);
  const buttons = report.census.controls.find((c) => c.kind === "button" || c.kind.startsWith("button"));

  /* The panel holding the longest repeated run is the one the page is really
   * about, so its unit is the fair thing to compare between pages. */
  const listPanel = report.census.panels.reduce(
    (bestSoFar, p) => (!bestSoFar || p.repeatedCount > bestSoFar.repeatedCount ? p : bestSoFar),
    null
  );

  return {
    occupancy: report.census.occupancy,
    charsPer10kPanelPx: report.census.density.charsPer10kPanelPx,
    listUnit: listPanel && listPanel.unit
      ? {
          panel: `${listPanel.box.w}x${listPanel.box.h}`,
          count: listPanel.repeatedCount,
          unitBox: `${listPanel.unit.box.w}x${listPanel.unit.box.h}`,
          datums: listPanel.unit.datums,
          typeLevels: listPanel.unit.typeLevels,
          fontSizes: listPanel.unit.fontSizes,
        }
      : null,
    id: report.route.id,
    label: report.route.label,
    path: report.route.path,
    baseline: Boolean(report.route.baseline),
    state: report.state.summary,
    dominantFontSizes: dominant,
    medianPanelPaddingTop: median(pads),
    panelCount: report.census.page.panelCount,
    charsPer10kPx: report.census.density.charsPer10kPx,
    mainChars: report.census.density.mainChars,
    scrollHeight: report.census.page.scrollHeight,
    /* The most common button kind differs between pages: a list of row buttons
     * and a toolbar of icon buttons are both "button". The kind travels with
     * the height so the comparison is not read as like for like when it is
     * not; `controlHeights` carries every kind for an honest comparison. */
    buttonHeight: buttons ? buttons.modalHeight : null,
    buttonKind: buttons ? buttons.kind : null,
    controlHeights: report.census.controls.map((c) => ({
      kind: c.kind,
      count: c.count,
      height: c.modalHeight,
      fontSize: c.modalFontSize,
    })),
    controlKinds: report.census.controls.length,
    carryingLevels: report.census.hierarchy.carryingLevels,
    typeSpread: report.census.hierarchy.spread,
    offScaleSizes: report.census.hierarchy.offScale.map((o) => o.size),
    offPaletteInks: report.census.colours.offPaletteInks,
    mediaIssues: report.census.media.issueCount,
  };
}

/* ------------------------------------------------------------------------ */
/* Main                                                                      */
/* ------------------------------------------------------------------------ */

async function main() {
  /* The dev server is a precondition, never a side effect. Probe before Chrome
   * is launched so a missing server costs one request rather than a browser and
   * a directory of screenshots of an error page. */
  try {
    const probe = await fetch(`${ORIGIN}/`, { method: "GET" });
    if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
  } catch (err) {
    console.error(
      `Dev server is not answering at ${ORIGIN} (${err.message}).\n` +
        "This tool does not start one. Start the dev server and run again."
    );
    process.exit(1);
  }

  const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chrome) {
    console.error("No Chrome binary found. Checked:\n  " + CHROME_CANDIDATES.join("\n  "));
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const profileDir = join(OUT_DIR, "chrome-profile");
  /* A throwaway profile, rebuilt every run so that one run's cached data cannot
   * silently become the next run's starting state. */
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });

  const debugPort = await freePort();
  const child = spawn(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      /* Software raster still runs the backdrop filter pass. Without this flag
       * newer Chrome declines the SwiftShader fallback and glass surfaces
       * render as a flat fill, which would quietly make the colour census
       * describe a surface that is not on screen. */
      "--enable-unsafe-swiftshader",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${debugPort}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      "--force-device-scale-factor=1",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  let closed = false;
  const shutdown = () => {
    if (closed) return;
    closed = true;
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  };
  process.on("exit", shutdown);
  process.on("SIGINT", () => {
    shutdown();
    process.exit(130);
  });

  await waitForEndpoint(debugPort);
  const target = await firstPageTarget(debugPort);
  const cdp = await Cdp.connect(target.webSocketDebuggerUrl);

  const net = { lastEvent: Date.now(), loaded: false };
  cdp.on("Network.requestWillBeSent", () => (net.lastEvent = Date.now()));
  cdp.on("Network.responseReceived", () => (net.lastEvent = Date.now()));
  cdp.on("Network.loadingFinished", () => (net.lastEvent = Date.now()));
  cdp.on("Network.loadingFailed", () => (net.lastEvent = Date.now()));
  cdp.on("Page.loadEventFired", () => (net.loaded = true));

  await cdp.send("Page.enable");
  await cdp.send("Network.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });

  /* --- seed ------------------------------------------------------------- */

  const seedEntries = NO_SEED ? [] : buildSeed();
  let seedResult = { applied: false, keys: [], note: "seeding skipped" };
  if (seedEntries.length) {
    await gotoAndSettle(cdp, `${ORIGIN}/`, net);
    const applied = await cdp.call((entries) => {
      const done = [];
      for (const e of entries) {
        try {
          localStorage.setItem(e.key, e.value);
          done.push({ key: e.key, bytes: e.value.length });
        } catch (err) {
          done.push({ key: e.key, error: String(err) });
        }
      }
      return done;
    }, seedEntries);
    seedResult = {
      applied: true,
      keys: applied,
      notes: seedEntries.map((e) => `${e.key}: ${e.note}`),
    };
    console.log(`seeded ${applied.length} localStorage keys`);
  }

  /* --- measure ---------------------------------------------------------- */

  const cfg = {
    scale: SITE_SCALE,
    palette: PALETTE,
    iconSteps: ICON_STEPS,
    panelSelector: PANEL_SELECTOR,
    controlSelector: CONTROL_SELECTOR,
    viewportHeight: HEIGHT,
  };

  const reports = [];
  for (const route of selectedRoutes) {
    const url = `${ORIGIN}${route.path}`;
    process.stdout.write(`measuring ${route.id.padEnd(20)} ${route.path} ... `);

    const settle = await gotoAndSettle(cdp, url, net);
    const census = await cdp.call(pageCensus, cfg);
    const state = await cdp.call(pageState);
    const shot = await captureFullPage(cdp, join(OUT_DIR, `${route.id}.png`));

    /* One sentence describing what was actually on screen, so every row of the
     * comparison carries its own caveat. */
    const active = Object.entries(state.signals)
      .filter(([, on]) => on)
      .map(([k]) => k);
    state.summary =
      census.page.panelCount === 0
        ? `no panels rendered; signals: ${active.join(", ") || "none"}`
        : active.length
          ? `${census.page.panelCount} panels; signals: ${active.join(", ")}`
          : `${census.page.panelCount} panels; populated`;

    const report = { route, url, viewport: { w: WIDTH, h: HEIGHT }, settle, capture: shot, state, census };
    writeFileSync(join(OUT_DIR, `${route.id}.json`), JSON.stringify(report, null, 2));
    reports.push(report);
    /* A dash where panel density has no denominator, so the line never shows a
     * number the run did not measure. */
    const panelDensity =
      census.density.charsPer10kPanelPx === null ? "-" : census.density.charsPer10kPanelPx;
    console.log(
      `${census.page.panelCount} panels, ${census.density.charsPer10kPx} chars/10k px, ` +
        `${panelDensity} chars/10k panel px, ${settle.settleMs}ms`
    );
  }

  /* --- summarise -------------------------------------------------------- */

  const rows = reports.map(summarise);
  const base = rows.find((r) => r.baseline) ?? rows[0];
  for (const row of rows) {
    row.vsBaseline = {
      charsPer10kPx: pct(row.charsPer10kPx, base.charsPer10kPx),
      charsPer10kPanelPx: pct(row.charsPer10kPanelPx, base.charsPer10kPanelPx),
      panelPaddingTop: pct(row.medianPanelPaddingTop, base.medianPanelPaddingTop),
      buttonHeight: pct(row.buttonHeight, base.buttonHeight),
      carryingLevels: pct(row.carryingLevels, base.carryingLevels),
      typeSpread: pct(row.typeSpread, base.typeSpread),
      panelCount: pct(row.panelCount, base.panelCount),
      firstScreenCoverage: pct(row.occupancy.firstScreenCoverage, base.occupancy.firstScreenCoverage),
      verticalCoverage: pct(row.occupancy.verticalCoverage, base.occupancy.verticalCoverage),
      unitDatums:
        row.listUnit && base.listUnit ? pct(row.listUnit.datums, base.listUnit.datums) : null,
      unitTypeLevels:
        row.listUnit && base.listUnit ? pct(row.listUnit.typeLevels, base.listUnit.typeLevels) : null,
    };
  }

  const summary = {
    origin: ORIGIN,
    viewport: { w: WIDTH, h: HEIGHT },
    baseline: base.id,
    scale: SITE_SCALE,
    seed: seedResult,
    routes: rows,
  };
  writeFileSync(join(OUT_DIR, "census-summary.json"), JSON.stringify(summary, null, 2));

  console.log(`\nwrote ${reports.length} route reports to ${OUT_DIR}`);
  console.log(`baseline: ${base.label} (${base.path})`);

  if (!KEEP_OPEN) {
    cdp.close();
    shutdown();
  }
}

main().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
