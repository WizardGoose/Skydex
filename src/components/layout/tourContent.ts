/**
 * The welcome tour's content pipeline.
 *
 * The tour's WORDS live in `tour.md`, one plain Markdown file, so writing the
 * site's introduction needs a text editor and nothing else: edit the file,
 * the dev server hot-reloads, the real tour shows the new words. The Tour Lab
 * (`/tour-lab`, dev builds only) wraps the same parser in a live editor for
 * drafting in the browser.
 *
 * FORMAT, in full:
 *
 *   - Steps are separated by a line that is exactly `---`.
 *   - A step may open with one `# Title` line, which becomes its heading in
 *     the chrome face. A step without one has no heading.
 *   - A line holding one marker becomes a block in that spot. Markers may
 *     carry attributes, written like HTML: [input name="username"
 *     placeholder="- - - - -"]. The markers:
 *
 *       [logo]              the SKYDEX logo ([wordmark] still accepted)
 *       [mode-picker]       the Ironman / Normal choice cards
 *                             ironman= normal= rewrite a card's subline.
 *                             Left off, each keeps its built-in wording
 *                             converter= ADDS a third card, "Converter",
 *                             with this text as its subline. Writing the
 *                             attribute is what puts the card there.
 *                             Converter is functionally Normal: Hypixel's
 *                             API cannot tell a converted profile from a
 *                             normal one, and a converted profile can use
 *                             the Bazaar and the Auction House, so the card
 *                             sets the very same mode the Normal card sets.
 *                             Which of the two words the reader picked is
 *                             remembered on its own, apart from the mode, so
 *                             the choice is a label and never a number
 *       [settings-button]   an "Open Settings" button
 *       [input]             a signature-line text input
 *                             name= a known binding saves for real. "username"
 *                             saves the Minecraft name Settings uses. An
 *                             unknown or missing name is just for fun and
 *                             saves nowhere
 *                             placeholder= the ghost text. The browser draws
 *                             a placeholder itself, as plain text, so a span
 *                             written here keeps its words and loses its
 *                             styling rather than showing its own syntax
 *                             label= a small caption above the line. Backtick
 *                             spans work inside it; nothing else does, an
 *                             attribute being one string rather than a
 *                             document
 *                             line= the line's stroke: dashed (default),
 *                             dotted, solid, or none
 *                             colour= tints the line, either by one of the
 *                             eight span palette names (blue, gold, green,
 *                             red, pink, teal, purple, white) or by a hex
 *                             literal, #ff8800 or #f80
 *                             text= colours the typed value, reading the same
 *                             eight names and hex literals colour= reads.
 *                             Left off, the value is the default slate
 *                             max= a hard cap on length; typing just stops
 *                             pattern= a regular expression checked live as
 *                             the reader types; while the text does not
 *                             match, the line turns red and the invalid=
 *                             message shows. pattern="" turns checking off.
 *                             invalid= the message shown under a failing
 *                             line, in the author's words
 *
 *                             The "username" binding checks the real
 *                             Minecraft rule (2 to 16 characters: letters,
 *                             numbers, underscores) without being asked, and
 *                             only a passing name is saved. pattern=
 *                             overrides that rule; pattern="" removes it.
 *       [slider]            a slider with a live readout
 *                             min= max= the range (defaults 0 and 100)
 *                             label= a small caption above it, taking spans
 *                             the way the [input] label does
 *
 *   - Two markers style the step's FOOTER instead of adding a block:
 *
 *       [next label="I love tutorials!"]   renames that step's Next button
 *       [skip label="Ugh.. tutorials" confirm="I REALLY hate tutorials"]
 *           puts a skip button on the footer's left. With confirm= set it
 *           takes two clicks: the first renames the button to the confirm
 *           text, the second actually skips.
 *
 *   - [page] is the "3 / 5" step counter, and WHERE you write it is what
 *     decides where it lands:
 *
 *       Beside a footer marker, meaning the nearest line with anything on it
 *           above or below is a [skip] or a [next], the counter JOINS THE
 *           FOOTER and sits centred between its buttons. Blank lines in
 *           between do not separate them, so you can space the footer out
 *           and it still reads as one row.
 *       Anywhere else, the counter is a BLOCK IN THE BODY, in that exact
 *           spot, like every other marker.
 *       Nowhere at all, the counter still shows, at the footer's left, which
 *           is where it sat before any of this was authorable.
 *       [page hidden] means NO counter for that step, wherever in the step
 *           you wrote it. Silence is a step-wide instruction, not a
 *           placement, so it takes no zone of its own.
 *
 *   - Everything else is Markdown: paragraphs, **bold**, lists, and links.
 *     A link to a site path (like /island) navigates in-app.
 *
 * An unknown `[marker]` is left in the text as-is rather than swallowed, so a
 * typo is visible in the preview instead of silently deleting a block.
 */

export type TourBlock =
  | { kind: "md"; text: string }
  | { kind: "wordmark" }
  | {
      kind: "mode-picker";
      /** Replacement subline for the Ironman card, or null for the built-in wording. */
      ironman: string | null;
      /** Replacement subline for the Normal card, or null for the built-in wording. */
      normal: string | null;
      /**
       * The third card's subline, or null for no third card. Non-null is what
       * puts the card on screen, so writing the attribute IS asking for it.
       *
       * The card is a joke about a real thing, and it has to stay honest about
       * that thing. A converted profile can use the Bazaar and the Auction
       * House, and Hypixel's API exposes nothing that separates one from a
       * normal profile, so there is no third economy for a third card to
       * select. It therefore sets the same mode the Normal card sets, and the
       * word the reader picked is remembered somewhere no calculation reads.
       */
      converter: string | null;
    }
  | { kind: "settings-button" }
  | { kind: "page"; hidden: boolean }
  | {
      kind: "input";
      name: string | null;
      placeholder: string;
      label: string | null;
      line: InputLine;
      /** A SPAN_COLOURS name, or null for the default stroke. */
      colour: string | null;
      /**
       * The typed value's colour, as a SPAN_COLOURS name or hex literal, or
       * null for the default slate. Separate from `colour` because the line
       * and the writing on it are separate marks: a gold line under slate
       * handwriting is a real thing to ask for, and one attribute doing both
       * could not say it.
       */
      text: string | null;
      /** Hard length cap, or null for uncapped. */
      max: number | null;
      /** Authored check; null means unset (a known binding may supply one), "" means checked off. */
      pattern: string | null;
      /** The author's failure message, or null for the built-in wording. */
      invalid: string | null;
    }
  | { kind: "slider"; name: string | null; label: string | null; min: number; max: number };

/** The strokes an [input] line can wear. Unknown spellings fall back to dashed. */
export type InputLine = "dashed" | "dotted" | "solid" | "none";

const LINE_STYLES: Record<string, true> = { dashed: true, dotted: true, solid: true, none: true };

export interface TourSkip {
  label: string;
  /** Second-click text; null skips on the first click. */
  confirm: string | null;
}

export interface TourStep {
  title: string | null;
  blocks: TourBlock[];
  /** Footer overrides, lifted out of the block stream. */
  nextLabel: string | null;
  skip: TourSkip | null;
  /**
   * A [page] written beside [skip] or [next]: the counter belongs to the
   * footer, centred between its buttons, and no page block was emitted.
   */
  pageInFooter: boolean;
  /**
   * Any [page hidden] in the step, wherever it sat. One flag rather than a
   * search through the blocks, because "no counter" is a fact about the whole
   * step and both the footer and the body have to honour it. A silenced page
   * never sets `pageInFooter`: there is nothing to place.
   */
  hiddenPage: boolean;
}

/**
 * Did the author say where the counter goes, or say to drop it?
 *
 * The footer's default counter is for steps that never mentioned [page] at
 * all. Anything else, a body block, a footer counter, or a deliberate
 * silence, is an instruction the default must not talk over.
 */
export const hasAuthoredPage = (step: TourStep): boolean =>
  step.pageInFooter || step.hiddenPage || step.blocks.some((b) => b.kind === "page");

/** `[name key="value" key2="value2"]`, or null when the line is not a marker. */
const readMarker = (line: string): { name: string; attrs: Record<string, string> } | null => {
  const m = /^\[([a-z-]+)((?:\s+[a-z]+(?:="[^"]*")?)*)\s*\]$/.exec(line);
  if (!m) return null;
  const attrs: Record<string, string> = {};
  /* A bare word is a flag: [page hidden] means hidden="true". */
  for (const [, key, value] of m[2].matchAll(/([a-z]+)(?:="([^"]*)")?/g)) attrs[key] = value ?? "true";
  return { name: m[1], attrs };
};

const num = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * The nearest line in one direction that has anything on it, given as its
 * marker name. Null when that line is prose, or when the step runs out first.
 *
 * Blank lines are stepped over rather than treated as a break, because an
 * author spacing their footer markers apart is still looking at one footer
 * row, and the parser should agree with what they see.
 */
const neighbourMarker = (lines: string[], from: number, step: 1 | -1): string | null => {
  for (let i = from + step; i >= 0 && i < lines.length; i += step) {
    if (!lines[i].trim()) continue;
    return readMarker(lines[i].trim())?.name ?? null;
  }
  return null;
};

/** A [page] with a footer marker for a neighbour is part of the footer row. */
const isFooterPage = (lines: string[], at: number): boolean =>
  [neighbourMarker(lines, at, -1), neighbourMarker(lines, at, 1)].some((n) => n === "skip" || n === "next");

export const parseTour = (raw: string): TourStep[] => {
  const steps: TourStep[] = [];

  for (const chunk of raw.split(/^---\s*$/m)) {
    const lines = chunk.split("\n");
    let title: string | null = null;
    let nextLabel: string | null = null;
    let skip: TourSkip | null = null;
    let pageInFooter = false;
    let hiddenPage = false;
    const blocks: TourBlock[] = [];
    let md: string[] = [];

    const flush = () => {
      const text = md.join("\n").trim();
      if (text) blocks.push({ kind: "md", text });
      md = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const bare = line.trim();
      if (title === null && blocks.length === 0 && md.every((l) => !l.trim()) && bare.startsWith("# ")) {
        title = bare.slice(2).trim();
        continue;
      }

      const marker = readMarker(bare);
      if (marker) {
        const { name, attrs } = marker;
        if (name === "logo" || name === "wordmark") {
          flush();
          blocks.push({ kind: "wordmark" });
          continue;
        }
        if (name === "page") {
          const hidden = attrs.hidden === "true";
          /* Silence travels with the step, not with the spot it was typed in. */
          if (hidden) hiddenPage = true;
          if (isFooterPage(lines, i)) {
            /* Lifted out of the blocks the way [skip] and [next] are, so the
               surrounding prose closes over the gap instead of splitting. A
               silenced one claims no zone: `hiddenPage` already said enough. */
            if (!hidden) pageInFooter = true;
            continue;
          }
          flush();
          blocks.push({ kind: "page", hidden });
          continue;
        }
        if (name === "mode-picker") {
          flush();
          /* No fallbacks to run: every one of these is a subline, and any
             string is a usable subline. There is nothing an author can spell
             wrongly here, so an attribute nobody wrote is null and the card's
             built-in wording stands. */
          blocks.push({
            kind: "mode-picker",
            ironman: attrs.ironman ?? null,
            normal: attrs.normal ?? null,
            converter: attrs.converter ?? null,
          });
          continue;
        }
        if (name === "settings-button") {
          flush();
          blocks.push({ kind: "settings-button" });
          continue;
        }
        if (name === "input") {
          flush();
          /* Junk attribute values fall back rather than fail, matching the
             slider's numbers: a typo'd line style is the default stroke, a
             typo'd colour on either colour channel is no tint, a nonsense cap
             is no cap. The pattern is the exception and passes through
             untouched, because "" is a meaningful spelling (checking off)
             rather than a mistake. */
          const cap = Math.floor(Number(attrs.max));
          blocks.push({
            kind: "input",
            name: attrs.name ?? null,
            placeholder: attrs.placeholder ?? "",
            label: attrs.label ?? null,
            line: attrs.line !== undefined && LINE_STYLES[attrs.line] ? (attrs.line as InputLine) : "dashed",
            colour: attrs.colour !== undefined && isColour(attrs.colour) ? attrs.colour : null,
            text: attrs.text !== undefined && isColour(attrs.text) ? attrs.text : null,
            max: Number.isFinite(cap) && cap > 0 ? cap : null,
            pattern: attrs.pattern ?? null,
            invalid: attrs.invalid ?? null,
          });
          continue;
        }
        if (name === "slider") {
          flush();
          blocks.push({
            kind: "slider",
            name: attrs.name ?? null,
            label: attrs.label ?? null,
            min: num(attrs.min, 0),
            max: num(attrs.max, 100),
          });
          continue;
        }
        if (name === "next") {
          if (attrs.label) nextLabel = attrs.label;
          continue;
        }
        if (name === "skip") {
          skip = { label: attrs.label ?? "Skip", confirm: attrs.confirm ?? null };
          continue;
        }
        /* Unknown marker: fall through to markdown so the typo stays visible. */
      }

      md.push(line);
    }
    flush();

    /* Footer markers count as content: a chunk holding only a [skip] is a
       deliberate step, not an empty one. A lifted [page] counts for the same
       reason, and it has to be named here because it leaves no block behind:
       "[page]" beside a bare "[next]" would otherwise drop the whole step. */
    if (title !== null || blocks.length > 0 || nextLabel !== null || skip !== null || pageInFooter || hiddenPage) {
      steps.push({ title, blocks, nextLabel, skip, pageInFooter, hiddenPage });
    }
  }

  return steps;
};

/* -------------------------------------------------------------------------- *
 * Inline styling spans
 * -------------------------------------------------------------------------- */

/**
 * The colour-and-type channel: a backtick span whose text starts with style
 * tokens and a colon, like `gold:blood partially required` or
 * `hl+bold:read this`. Tokens combine with `+`. A span with no colon, or any
 * token this table has never heard of, is NOT a styling span and renders as
 * ordinary code, so a typo shows up mono instead of vanishing.
 *
 * The colours are the site's own: the accent step and the game-data hues.
 * They are the names worth typing rather than the only colours available; a
 * hex literal is a colour token too, so the palette is a shortcut and never a
 * ceiling.
 */
export const SPAN_TOKENS: Record<string, true> = {
  blue: true,
  gold: true,
  green: true,
  red: true,
  pink: true,
  teal: true,
  purple: true,
  white: true,
  hl: true,
  chrome: true,
  mono: true,
  bold: true,
  italic: true,
  big: true,
  small: true,
};

/**
 * A colour written out rather than named: `#ff8800` or its three-digit short
 * hand. Case is not meaningful to CSS and is not made meaningful here.
 */
const HEX_COLOUR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const isHexColour = (token: string): boolean => HEX_COLOUR.test(token);

export const parseSpan = (raw: string): { tokens: string[]; text: string } | null => {
  const at = raw.indexOf(":");
  if (at <= 0) return null;
  const tokens = raw.slice(0, at).split("+").map((t) => t.trim().toLowerCase());
  /* A hex literal is a token like any other and combines like one, so
     `#ff8800+bold:loud` needs no special spelling. Everything else still has
     to be a name this file knows: an unreadable token means the whole span is
     not a span, and honest code beats a guess at what was meant. */
  if (tokens.length === 0 || tokens.some((t) => !SPAN_TOKENS[t] && !isHexColour(t))) return null;
  return { tokens, text: raw.slice(at + 1) };
};

/** One run of an attribute string: a styling span, or the text between them. */
export interface InlinePiece {
  /** The span's source, `tokens:text` without its backticks, or null for text. */
  span: string | null;
  /** What this piece says: the span's words, or the literal run as typed. */
  text: string;
}

/**
 * Split a plain string into styling spans and the text around them.
 *
 * Attributes carry one channel of the tour's markup and only one: the backtick
 * span. There is no **bold** and there are no links inside a label, because an
 * attribute is a single string in a marker rather than a document, and running
 * a Markdown parser over it would promise block structure that has nowhere to
 * go. The span channel is enough to colour a word, and it is the channel the
 * toolbar already writes.
 *
 * A pair of backticks that does not hold a readable span is not a span, and
 * both backticks and everything between them survive as text: the same
 * bargain the body makes, where a typo shows itself instead of disappearing.
 */
export const splitSpans = (raw: string): InlinePiece[] => {
  const pieces: InlinePiece[] = [];
  let plain = "";
  let i = 0;

  while (i < raw.length) {
    const open = raw.indexOf("`", i);
    if (open < 0) break;
    const close = raw.indexOf("`", open + 1);
    if (close < 0) break;

    const inner = raw.slice(open + 1, close);
    const span = inner.includes("\n") ? null : parseSpan(inner);
    if (span) {
      plain += raw.slice(i, open);
      if (plain) pieces.push({ span: null, text: plain });
      plain = "";
      pieces.push({ span: inner, text: span.text });
    } else {
      /* Not a span: the pair stays as typed. Reading resumes past the closing
         backtick rather than at it, so one backtick cannot serve as both the
         end of a failed pair and the start of the next. */
      plain += raw.slice(i, close + 1);
    }
    i = close + 1;
  }

  plain += raw.slice(i);
  if (plain) pieces.push({ span: null, text: plain });
  return pieces;
};

/**
 * The same string with every span reduced to its words.
 *
 * For the places that can hold text but not styling, of which a native
 * placeholder is the whole list: the browser draws that text itself and no
 * markup reaches it. Showing the author's syntax there would be the worst of
 * the three outcomes, so the words come through and the colour is dropped.
 * A span that never parsed is left exactly as typed, since that one IS a
 * typo and hiding it would hide the mistake.
 */
export const stripSpans = (raw: string): string => splitSpans(raw).map((p) => p.text).join("");

/**
 * The hues behind the eight colour tokens: the accent step and the game-data
 * palette. One table serves every channel that speaks colour, the backtick
 * spans and the [input] colour= and text= attributes, so the names can never
 * mean two different colours.
 *
 * The accent and the gold read their theme variables rather than a copy of
 * the hex, so a retint of the accent reaches the tour too. The six game-data
 * hues stay literal: those are the game's colours, not the interface's, and
 * they are deliberately not on the retint path.
 */
export const SPAN_COLOURS: Record<string, string> = {
  blue: "var(--color-emerald-300)",
  gold: "var(--color-stat-gold)",
  green: "#63d97d",
  red: "#f04747",
  pink: "#fa80d5",
  teal: "#5ef3df",
  purple: "#cf7ff0",
  white: "#f5f7fa",
};

/**
 * Whether a written colour is one the format can honour: a palette name or a
 * hex literal. Every channel that speaks colour, spans and the [input]
 * colour= and text= attributes, asks this same question, so none of them can
 * accept a spelling the others reject.
 */
export const isColour = (raw: string): boolean => SPAN_COLOURS[raw] !== undefined || isHexColour(raw);

/**
 * The CSS colour behind a written one. A name is looked up; a hex literal is
 * already the answer. Storing what the author typed and resolving it here
 * keeps the parsed block readable as the file that produced it.
 */
export const colourOf = (raw: string): string => SPAN_COLOURS[raw] ?? raw;

/* -------------------------------------------------------------------------- *
 * Input checking
 * -------------------------------------------------------------------------- */

/** Minecraft's own name rule: 2 to 16 characters, letters, digits, underscores. */
export const USERNAME_PATTERN = "[A-Za-z0-9_]{2,16}";

/**
 * The check an [input] actually runs. An authored pattern= always wins, with
 * "" spelling "no check at all"; left unset, the "username" binding gets the
 * Minecraft rule so the common case needs no attributes; anything else is
 * unchecked.
 */
export const inputRule = (input: { name: string | null; pattern: string | null }): string | null => {
  if (input.pattern !== null) return input.pattern === "" ? null : input.pattern;
  return input.name === "username" ? USERNAME_PATTERN : null;
};

/**
 * Whether typed text passes a rule. Empty text always passes: an untouched
 * line is not a mistake, and scolding a blank signature would be rude. The
 * rule must cover the whole value, not merely appear in it. A rule that is
 * not valid regular-expression syntax checks nothing, so an author's broken
 * pattern leaves the line calm instead of flagging every keystroke.
 */
export const inputValid = (value: string, rule: string | null): boolean => {
  if (!value || !rule) return true;
  try {
    return new RegExp(`^(?:${rule})$`).test(value);
  } catch {
    return true;
  }
};
