import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Copy, RotateCcw } from "lucide-react";
import currentFile from "../components/layout/tour.md?raw";
import { SPAN_COLOURS, hasAuthoredPage, parseSpan, parseTour, type TourStep } from "../components/layout/tourContent";
import { TourStepView } from "../components/layout/TourStepView";
import { FOCUS, LABEL, PANEL, PageHeader, SectionHead } from "../ui/kit";

/**
 * The Tour Lab: write the site's introduction with the real thing rendering
 * beside every keystroke.
 *
 * Dev builds only (the route is registered behind `import.meta.env.DEV`), so
 * none of this ships. The draft autosaves to this browser; the file on disk
 * is only changed by pasting the draft into `src/components/layout/tour.md`,
 * which the Copy button carries to the clipboard. Editing that file directly
 * in any text editor works exactly as well: the dev server hot-reloads the
 * live tour either way.
 *
 * Every change to the text goes through `replaceRange`, which is what makes
 * this an editor rather than a form: the browser's own undo history is the
 * only history the page keeps, and a toolbar click, a chord and a typed
 * character all sit in it as equals. See that function for why.
 */

const DRAFT_KEY = "skyindex.tourlab.v1";

const loadDraft = (): string | null => {
  try {
    return localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
};

/* -------------------------------------------------------------------------- *
 * The previewed footer
 * -------------------------------------------------------------------------- */

/*
 * TourBody's footer controls, restated because they are private to that file.
 * The skip reads as a quiet aside and Back as the same weight without the
 * underline, which leaves Next the only filled thing on the row, so the eye
 * lands on the control that moves the tour on.
 *
 * FOCUS rides along on all three exactly as it does there: a preview that
 * drops the focus ring stops showing what ships. These strings are the only
 * part of the footer this page copies rather than imports, so a change to the
 * live footer's look has to be repeated here or the preview quietly lies.
 */
const FOOT_QUIET = `cursor-pointer text-[12px] text-slate-400 transition-colors hover:text-slate-100 ${FOCUS}`;
const FOOT_SKIP = `${FOOT_QUIET} underline decoration-white/20 underline-offset-4 hover:decoration-emerald-400/60`;
const FOOT_NEXT =
  `cursor-pointer rounded-md bg-emerald-500/18 px-3.5 py-1.5 text-[12.5px] font-semibold text-emerald-100 ` +
  `transition-colors hover:bg-emerald-500/28 active:translate-y-px ${FOCUS}`;

/**
 * The preview's footer, faithful to TourBody's three zones: the skip (or Back
 * when the step authored no skip) on the left, the counter in the middle when
 * the step put its [page] beside the footer markers, and Next on the right,
 * with Back joining it there whenever a skip has taken the left.
 *
 * Nothing here navigates or dismisses. The skip's two-click rename does run,
 * so the confirm text can be read in place, and it disarms when the previewed
 * step changes rather than carrying an armed state onto a step it was never
 * aimed at.
 */
const FooterPreview: React.FC<{ step: TourStep; index: number; count: number }> = ({ step, index, count }) => {
  const [armed, setArmed] = useState(false);
  useEffect(() => setArmed(false), [step]);
  const last = index === count - 1;

  const counter = (
    <span className={LABEL}>
      {index + 1} / {count}
    </span>
  );
  /* One Back, placed in whichever zone is free, mirroring the live footer. */
  const back =
    index > 0 ? (
      <button type="button" className={FOOT_QUIET}>
        Back
      </button>
    ) : null;

  return (
    /* Three zones. The outer two are `flex-1` so they take an equal share of
       the row, which is what centres the middle one whatever the skip is
       called and however long the authored Next label runs. */
    <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
      <span className="flex flex-1 items-center gap-3">
        {/* Only a step that never mentions [page] gets the default counter
            here; any authored placement, or a deliberate silence, speaks for
            itself and the preview must not talk over it either. */}
        {!hasAuthoredPage(step) && counter}
        {step.skip ? (
          <button
            type="button"
            className={FOOT_SKIP}
            onClick={() => step.skip?.confirm && setArmed((a) => !a)}
            title="In the live tour the second click skips."
          >
            {armed && step.skip.confirm ? step.skip.confirm : step.skip.label}
          </button>
        ) : (
          back
        )}
      </span>

      {step.pageInFooter && <span className="shrink-0">{counter}</span>}

      <div className="flex flex-1 items-center justify-end gap-2">
        {step.skip && back}
        <button type="button" className={FOOT_NEXT}>
          {step.nextLabel ?? (last ? "Start grinding" : "Next")}
        </button>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- *
 * The lab's own chrome
 * -------------------------------------------------------------------------- */

/*
 * The lab speaks the language the tour's own footer speaks: a fill and a
 * weight say what a control is, and nothing is drawn around it.
 *
 * An outlined chip reads as a box that has been switched off, so a toolbar
 * built out of them makes live controls look disabled and makes every word in
 * the room look pressable. The fill alone still answers "can I press this",
 * and a whole toolbar of them stops shouting.
 *
 * FOCUS rides on all of them: taking the outline away must not take away the
 * keyboard's only clue about where it is.
 */
const LAB_BTN = `cursor-pointer rounded-md transition-colors active:translate-y-px ${FOCUS}`;

/* Idle and lit, as fills. The lit one is the emerald the tour's own Next
   wears, so "this style is on your selection" and "this is the button that
   moves things along" are recognisably the same kind of statement. */
const LAB_IDLE = "bg-white/6 text-slate-300 hover:bg-white/12 hover:text-slate-100";
const LAB_LIT = "bg-emerald-500/18 text-emerald-100 hover:bg-emerald-500/28";

/* Toolbar chip: the style tokens, and the one word that opens the insert
   menu. Source text still wears the editor's own face wherever it is offered,
   which is now inside that menu rather than along a row of its own. */
const CHIP = `${LAB_BTN} px-2 py-0.5 text-[11px]`;
const CHIP_IDLE = `${CHIP} ${LAB_IDLE}`;
const CHIP_LIT = `${CHIP} ${LAB_LIT}`;

/* The two whole-draft actions. Same fill, more room around the words, which
   is the only rank the language keeps now that outlines are gone. */
const LAB_ACTION = `${LAB_BTN} inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium ${LAB_IDLE}`;

/* Step picker: a chip one size up, since it names a whole step rather than a
   token. */
const LAB_TAB = `${LAB_BTN} px-2.5 py-1 text-[12px]`;
const LAB_TAB_IDLE = `${LAB_TAB} ${LAB_IDLE}`;
const LAB_TAB_LIT = `${LAB_TAB} ${LAB_LIT}`;

/*
 * The colour swatches are samples of paint rather than chips, so they keep a
 * hairline to hold the pale end of the palette against a dark panel: white
 * paint with no edge at all is a hole in the row.
 *
 * It is a ring and not a border because a ring is drawn outside the box: the
 * disc stays a full disc at full colour, and the hairline reads as a halo
 * around the paint instead of a frame around a button.
 */
const DOT = `h-5 w-5 cursor-pointer rounded-full transition-transform hover:scale-110 ${FOCUS}`;
const DOT_IDLE = `${DOT} ring-1 ring-white/20`;
const DOT_LIT = `${DOT} ring-2 ring-white/70`;

/*
 * The ninth dot is not a ninth colour, it is the rest of them: the eight named
 * ones are the shades worth a single click and this opens everything else. A
 * wheel of the palette's own hues is a picture of what pressing it does, which
 * is the only label a swatch can wear. It never lights, because it stands for
 * no one token that could be on.
 */
const WHEEL = `conic-gradient(${["red", "gold", "green", "teal", "blue", "purple", "pink", "red"]
  .map((token) => SPAN_COLOURS[token])
  .join(", ")})`;

/*
 * The insert menu. Ten snippet chips said ten things at once and made the
 * toolbar a wall; one word that opens a list says the same thing and leaves
 * the room quiet, which is the whole argument for a menu over a row.
 *
 * The panel is the only thing in the lab that floats over the page, so it is
 * the one place a hairline earns its keep: an edgeless panel on a dark page
 * reads as a hole in whatever it covers rather than as a thing above it.
 *
 * It hangs from the trigger's left edge, which is why the trigger opens the
 * toolbar rather than closing it. Anywhere else in the row the menu is wider
 * than the space left beside it and spills past the panel; first in the row it
 * fits at every width, including the narrow ones where the toolbar wraps and
 * a right-hung menu would run off the side of the page entirely.
 */
const CHIP_MENU = `${CHIP_IDLE} inline-flex items-center gap-1`;
const CHIP_MENU_LIT = `${CHIP_LIT} inline-flex items-center gap-1`;
const MENU_PANEL = "absolute left-0 top-full z-20 mt-1 w-48 rounded-md bg-slate-900 p-1 shadow-lg ring-1 ring-white/12";
const MENU_ITEM = `${LAB_BTN} block w-full px-2 py-1 text-left font-mono text-[11px] ${LAB_IDLE}`;

/* -------------------------------------------------------------------------- *
 * The toolbar's vocabulary
 * -------------------------------------------------------------------------- */

/* The palette: token -> swatch. Read from the renderer's own table rather than
   copied beside it, so the lab cannot show a colour the tour does not draw. */
const CHIPS: Array<[string, string]> = Object.entries(SPAN_COLOURS);

/* Each style button wears its own effect, so the toolbar is its own legend. */
const STYLES: Array<[string, string, React.CSSProperties]> = [
  ["hl", "rounded-sm bg-emerald-500/20 px-1", {}],
  ["chrome", "", { fontFamily: "var(--font-chrome)", fontWeight: 700 }],
  ["mono", "font-mono", {}],
  /* Full weight, matching what the renderer now does with the token: a chip
     set in semibold would promise a lighter bold than the tour delivers. The
     renderer's accompanying lift to white is left off, because a text colour
     here would outrank the chip's own lit state and break that read. */
  ["bold", "font-bold", {}],
  ["italic", "italic", {}],
  ["big", "text-[13px] font-semibold", {}],
  ["small", "text-[10px]", {}],
];

const SNIPPETS: Array<[string, string]> = [
  ["Step break", "\n---\n"],
  ["[logo]", "\n[logo]\n"],
  ["[page]", "\n[page]\n"],
  ["[page hidden]", "\n[page hidden]\n"],
  ["[input]", '\n[input label="Sign here" placeholder="- - - - -" name="username" max="16"]\n'],
  ["[slider]", '\n[slider label="How keen?" min="0" max="100"]\n'],
  ["[mode-picker]", "\n[mode-picker]\n"],
  ["[settings-button]", "\n[settings-button]\n"],
  ["[skip]", '\n[skip label="Ugh.. tutorials" confirm="I REALLY hate tutorials"]\n'],
  ["[next]", '\n[next label="I love tutorials!"]\n'],
];

/* The three styles a sentence reaches for often enough to earn a chord, on the
   keys every other editor already spends on them (h for the highlighter). */
const SHORTCUTS: Record<string, string> = { b: "bold", i: "italic", h: "hl" };

/* -------------------------------------------------------------------------- *
 * Reading and writing styling spans
 * -------------------------------------------------------------------------- */

/** A styling span sitting around the caret or selection. */
type SpanHit = { open: number; close: number; tokens: string[]; text: string };

/** `tok+tok:text` in backticks, or the bare text once no tokens are left. */
const spanSource = (tokens: string[], text: string): string =>
  tokens.length ? "`" + tokens.join("+") + ":" + text + "`" : text;

/**
 * The styling span the selection lies in, if it lies in one. Two shapes count:
 * a selection (or bare caret) sitting inside `bold:...`, and a selection that
 * swallowed the backticks whole.
 *
 * The test is the renderer's own: whatever the tour would not colour, the
 * toolbar will not rewrite. A stray backtick or a line break between the two
 * ends means the pair found is not one span, and `parseSpan` rejects an
 * unknown token, so half-typed markup is wrapped as ordinary text rather than
 * quietly rearranged under the caret.
 */
const spanAt = (src: string, a: number, b: number): SpanHit | null => {
  const whole = b - a >= 2 && src[a] === "`" && src[b - 1] === "`";
  const open = whole ? a : a > 0 ? src.lastIndexOf("`", a - 1) : -1;
  const close = whole ? b - 1 : src.indexOf("`", b);
  if (open < 0 || close <= open) return null;

  const raw = src.slice(open + 1, close);
  if (raw.includes("`") || raw.includes("\n")) return null;
  const span = parseSpan(raw);
  return span ? { open, close, tokens: span.tokens, text: span.text } : null;
};

/* -------------------------------------------------------------------------- *
 * Naming a step
 * -------------------------------------------------------------------------- */

/**
 * What the picker calls a step.
 *
 * A step's title is a leading `# ` line and only that: the parser stops
 * offering the title once anything else has been written, so `[logo]` above
 * the header hands that header to the body instead. On the page that is
 * right, and the header still renders title-grade in the spot it was typed.
 * In the picker it is wrong, because the steps that most look like they are
 * named would be the ones showing a bare number.
 *
 * So the picker reads that header itself, from the first block the step says
 * in words. Nothing further is guessed: a step whose prose opens before its
 * first header keeps its number, since a sentence is not a name.
 */
const stepLabel = (step: TourStep): string | null => {
  if (step.title) return step.title;
  for (const block of step.blocks) {
    if (block.kind !== "md") continue;
    const line = block.text.split("\n", 1)[0].trim();
    return line.startsWith("# ") ? line.slice(2).trim() || null : null;
  }
  return null;
};

/* -------------------------------------------------------------------------- *
 * The lab
 * -------------------------------------------------------------------------- */

export const TourLabPage: React.FC = () => {
  const [source, setSource] = useState(() => loadDraft() ?? currentFile);
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  /* The tokens the caret currently sits inside, "+"-joined so an unchanged
     span sets identical state and React can drop the render. Lights the
     toolbar buttons that are already on, which is what tells an author the
     same button will now take the style back off. */
  const [active, setActive] = useState("");
  const [insertOpen, setInsertOpen] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  /* The menu's own box, for telling a click inside it from a click away. */
  const insertRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLInputElement | null>(null);
  /* The pick a still-open dialog owes, so a cancelled one leaves nothing
     behind to fire alongside the next. */
  const pendingPick = useRef<(() => void) | null>(null);

  /** Read the styles under the caret, for the toolbar's lit state. */
  const syncActive = () => {
    const el = editorRef.current;
    if (!el) return;
    const hit = spanAt(el.value, el.selectionStart ?? 0, el.selectionEnd ?? 0);
    setActive(hit ? hit.tokens.join("+") : "");
  };

  /**
   * Replace [from, to) with `text` as though it had been typed.
   *
   * Writing React state instead would work and would also throw the draft's
   * history away: assigning a textarea's value from script clears the
   * browser's undo stack, so one toolbar click would strand every hand-typed
   * character behind it and Ctrl+Z would have nothing to step back through.
   * `document.execCommand("insertText")` performs the edit through the typing
   * path, which makes each action exactly one undo step and leaves Ctrl+Z and
   * Ctrl+Y working across the lot.
   *
   * The command carries a deprecation notice and is used anyway, deliberately:
   * every current engine implements insertText on a focused input or textarea,
   * MDN names preserving the undo buffer as the reason the command survives,
   * and no replacement API was ever specified (a synthesised InputEvent cannot
   * perform an edit). The branch below keeps the toolbar working on anything
   * that ever drops it, at the cost of that one action's undo history.
   *
   * The edit fires a native `input` event, which is the event React's onChange
   * is built on, so `source` follows without a second write.
   */
  const replaceRange = (from: number, to: number, text: string, select?: [number, number]) => {
    const el = editorRef.current;
    if (!el) return;
    const [head, tail] = select ?? [from + text.length, from + text.length];

    el.focus();
    el.setSelectionRange(from, to);
    let typed = false;
    try {
      typed = document.execCommand("insertText", false, text);
    } catch {
      typed = false;
    }

    if (typed) {
      /* Set last so it wins: React captures the selection at commit time and
         restores it afterwards, so the range asked for here is the one that
         survives the re-render. */
      el.setSelectionRange(head, tail);
      syncActive();
      return;
    }

    setSource(el.value.slice(0, from) + text + el.value.slice(to));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(head, tail);
      syncActive();
    });
  };

  /**
   * Turn one style token on or off over the selection.
   *
   * A token joins the span the selection already sits in rather than opening a
   * second pair of backticks inside the first, which is markup the renderer
   * cannot read: `hl:read this` with bold added becomes `hl+bold:read this`.
   * Pressing the same button again takes that token back off, and losing the
   * last one unwraps the span to plain text. A selection that covers only part
   * of a span still styles the whole span, since the tokens belong to the span
   * and half a span cannot carry its own.
   *
   * With nothing selected and no span to join, the word `text` goes in as a
   * visible placeholder, left selected so it can be typed straight over.
   */
  const toggleStyle = (token: string) => {
    const el = editorRef.current;
    if (!el) return;
    const src = el.value;
    const a = el.selectionStart ?? 0;
    const b = el.selectionEnd ?? a;

    const hit = spanAt(src, a, b);
    if (hit) {
      const tokens = hit.tokens.includes(token) ? hit.tokens.filter((t) => t !== token) : [...hit.tokens, token];
      const inner = hit.open + (tokens.length ? tokens.join("+").length + 2 : 0);
      replaceRange(hit.open, hit.close + 1, spanSource(tokens, hit.text), [inner, inner + hit.text.length]);
      return;
    }

    const selected = src.slice(a, b) || "text";
    const inner = a + token.length + 2;
    replaceRange(a, b, spanSource([token], selected), [inner, inner + selected.length]);
  };

  /**
   * The colour wheel: one pick, one edit, one undo step.
   *
   * The dialog belongs to a hidden `input type="color"` and takes focus the
   * moment it opens, so the range this pick is FOR is closed over here and
   * put back before the edit, rather than read again afterwards when it may
   * no longer be there.
   *
   * It waits for `change` and not for React's onChange, which is the `input`
   * event underneath: a colour dialog reports every drag through `input`, so
   * that path would rewrite the span dozens of times on the way to one answer
   * and leave all of them in the undo history. `change` is the committed
   * colour and fires once.
   *
   * The edit is `toggleStyle`, which is what the named dots call, so a picked
   * colour joins the span already under the caret instead of nesting inside
   * it, replaces whatever colour that span carried, and steps back under one
   * Ctrl+Z like every other button here.
   */
  const openPicker = () => {
    const el = editorRef.current;
    const picker = pickerRef.current;
    if (!el || !picker) return;

    const from = el.selectionStart ?? 0;
    const to = el.selectionEnd ?? from;
    if (pendingPick.current) picker.removeEventListener("change", pendingPick.current);

    const onPick = () => {
      pendingPick.current = null;
      el.focus();
      el.setSelectionRange(from, to);
      toggleStyle(picker.value);
    };
    pendingPick.current = onPick;
    picker.addEventListener("change", onPick, { once: true });
    picker.click();
  };

  /* Snippets land at the caret and replace the selection, the way typing does,
     leaving the caret after them. */
  const insertSnippet = (snippet: string) => {
    const el = editorRef.current;
    if (!el) return;
    const a = el.selectionStart ?? el.value.length;
    const b = el.selectionEnd ?? a;
    replaceRange(a, b, snippet);
  };

  /* Loading the file is an edit like any other and goes the same way, so a
     mistaken click is one Ctrl+Z away from the draft it replaced. */
  const loadFile = () => {
    const el = editorRef.current;
    if (!el) return;
    replaceRange(0, el.value.length, currentFile, [0, 0]);
  };

  /**
   * Editing keys. The chords reach the same toggle the buttons do, so they
   * inherit its undo behaviour. Tab types two spaces rather than leaving the
   * field, because a Markdown draft indents and a writer mid-list does not
   * mean "next control"; Shift+Tab is left alone so the keyboard keeps a way
   * out of the box.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      insertSnippet("  ");
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const token = SHORTCUTS[e.key.toLowerCase()];
    if (!token) return;
    e.preventDefault();
    toggleStyle(token);
  };

  /* Toolbar buttons must not take focus: the textarea keeps its selection
     visible, the caret stays where the author left it, and the toggle reads
     the span the author is actually looking at. */
  const holdFocus = (e: React.MouseEvent) => e.preventDefault();

  const lit = useMemo(() => new Set(active ? active.split("+") : []), [active]);
  const steps = useMemo(() => parseTour(source), [source]);
  const current = Math.min(step, Math.max(0, steps.length - 1));

  /* Autosave, debounced a breath so typing does not hammer storage. */
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, source);
      } catch {
        /* A full store loses autosave, not the textarea contents. */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [source]);

  /* A menu closes the way a menu closes: a press anywhere else, or Escape.
     Both listeners live only while it is open. The press one is `mousedown`
     rather than `click` so the menu is already gone by the time that press
     lands on whatever it was covering, and clicks inside the menu are left to
     the items themselves. */
  useEffect(() => {
    if (!insertOpen) return;
    const away = (e: MouseEvent) => {
      if (!insertRef.current?.contains(e.target as Node)) setInsertOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInsertOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [insertOpen]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard denied: the textarea is right there to copy by hand. */
    }
  };

  return (
    <div className="mx-auto w-full max-w-screen-2xl space-y-3 p-4">
      <PageHeader
        title="Tour Lab"
        sub="Draft the welcome tour in Markdown; the panel on the right is the real renderer. Paste the result into src/components/layout/tour.md to ship it."
      />

      <div className="grid gap-3 lg:grid-cols-2">
        {/* ---- the draft ------------------------------------------------- */}
        <div className={PANEL}>
          <SectionHead
            title="Draft"
            right={
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  className={LAB_ACTION}
                  onMouseDown={holdFocus}
                  onClick={loadFile}
                  title="Replace the draft with tour.md as it is on disk. Ctrl+Z puts the draft back."
                >
                  <RotateCcw className="h-3 w-3" />
                  Load file
                </button>
                <button type="button" className={LAB_ACTION} onClick={() => void copy()}>
                  {copied ? <Check className="h-3 w-3 text-emerald-300" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy for tour.md"}
                </button>
              </span>
            }
          />
          <div className="p-3">
            {/* One click styles the selection; no syntax to memorise. One row,
                in the order the work happens: what goes on the page, then the
                colour of the words, then their type. Ten snippet chips used to
                take a row of their own and made three rows of toolbar out of
                two rows of controls. */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <div ref={insertRef} className="relative">
                <button
                  type="button"
                  onMouseDown={holdFocus}
                  onClick={() => setInsertOpen((o) => !o)}
                  aria-expanded={insertOpen}
                  aria-haspopup="menu"
                  className={insertOpen ? CHIP_MENU_LIT : CHIP_MENU}
                >
                  Insert
                  <ChevronDown className="h-3 w-3" />
                </button>
                {insertOpen && (
                  /* Every item holds the caret still on the way down, the way
                     the buttons beside it do, so the snippet lands where the
                     author last was rather than at the top of the draft. */
                  <div role="menu" className={MENU_PANEL}>
                    {SNIPPETS.map(([label, snippet]) => (
                      <button
                        key={label}
                        type="button"
                        role="menuitem"
                        onMouseDown={holdFocus}
                        onClick={() => {
                          setInsertOpen(false);
                          insertSnippet(snippet);
                        }}
                        className={MENU_ITEM}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {CHIPS.map(([token, swatch]) => (
                <button
                  key={token}
                  type="button"
                  title={"`" + token + ":...`"}
                  onMouseDown={holdFocus}
                  onClick={() => toggleStyle(token)}
                  aria-pressed={lit.has(token)}
                  className={lit.has(token) ? DOT_LIT : DOT_IDLE}
                  style={{ backgroundColor: swatch }}
                  aria-label={"Colour " + token}
                />
              ))}
              <button
                type="button"
                title="Any colour at all: `#ff8800:like this`"
                onMouseDown={holdFocus}
                onClick={openPicker}
                className={DOT_IDLE}
                style={{ background: WHEEL }}
                aria-label="Any colour"
              />
              {/* Kept on the page rather than conjured, because the dialog is
                  opened by clicking this input and an element with no box has
                  nothing to open against. */}
              <input
                ref={pickerRef}
                type="color"
                defaultValue="#ff8800"
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
              />
              {STYLES.map(([token, cls, style]) => (
                <button
                  key={token}
                  type="button"
                  onMouseDown={holdFocus}
                  onClick={() => toggleStyle(token)}
                  aria-pressed={lit.has(token)}
                  className={lit.has(token) ? CHIP_LIT : CHIP_IDLE}
                >
                  <span className={cls} style={style}>{token}</span>
                </button>
              ))}
            </div>
            <textarea
              ref={editorRef}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              onKeyDown={onKeyDown}
              /* The caret moves for several different reasons and no single
                 event covers them all across engines, so the cheap ones are
                 all wired to the same read. */
              onKeyUp={syncActive}
              onClick={syncActive}
              onSelect={syncActive}
              spellCheck={false}
              /* Sized against the page rather than to a guessed slice of the
                 viewport: everything above the box (page header, section head,
                 both toolbar rows) is a fixed height, so subtracting it lands
                 the bottom edge at the fold on any window and the draft stops
                 being read through a slot. The floor keeps a short window from
                 folding it back into one, and resize-y leaves the last word
                 with the author.

                 No frame: the well of darker ground is what says "type here",
                 the same way a fill rather than an outline says "press this"
                 on the toolbar above. The selection carries the accent because
                 the toolbar is a readout of it. */
              className={`h-[calc(100vh_-_20rem)] min-h-[26rem] w-full resize-y rounded-md bg-black/30 p-4 font-mono text-[13px] leading-relaxed text-slate-200 selection:bg-emerald-500/30 selection:text-slate-50 focus:outline-none ${FOCUS}`}
            />
            {/* The format, in the order an author meets it. Each paragraph
                opens with its own subject so the page can be skimmed for the
                one line being looked for rather than read end to end. */}
            <div className="mt-3 space-y-2 text-[11px] leading-relaxed text-slate-400">
              <p>
                <span className={LABEL}>Steps</span> split on a{" "}
                <span className="font-mono text-slate-300">---</span> line; one leading{" "}
                <span className="font-mono text-slate-300"># Title</span> per step; a step that opens with a marker
                like <span className="font-mono text-slate-300">[logo]</span> takes its tab name from the{" "}
                <span className="font-mono text-slate-300">#</span> line under it instead. Everything else is
                Markdown (blank line between paragraphs, <span className="font-mono text-slate-300">-</span> for a
                bulleted list, which shows real bullets), and a link to a site path like{" "}
                <span className="font-mono text-slate-300">/island</span> navigates in-app. The three heading levels
                are three sizes and nothing more:{" "}
                <span className="font-mono text-slate-300">#</span> is a big header,{" "}
                <span className="font-mono text-slate-300">##</span> a smaller one, and{" "}
                <span className="font-mono text-slate-300">###</span> small quiet text that sits tight under the
                line above it, so a caption reads as part of its header. What any of them look like past that is
                yours to say in spans. The draft autosaves in this browser.
              </p>
              <p>
                <span className={LABEL}>Blocks</span> each go on their own line:{" "}
                <span className="font-mono text-slate-300">[logo]</span>,{" "}
                <span className="font-mono text-slate-300">[mode-picker ironman="..." normal="..."
                converter="..."]</span> (the two sublines are yours to rewrite, and{" "}
                <span className="font-mono text-slate-300">converter=</span> adds a third card reading
                Converter, with that text under it. It sets exactly the mode the Normal card sets, because a
                converted profile can use the Bazaar and the Auction House and Hypixel never tells us one apart
                from a normal profile: which of the two words you picked is remembered on its own, so it changes
                the card that lights up and no number anywhere),{" "}
                <span className="font-mono text-slate-300">[settings-button]</span>,{" "}
                <span className="font-mono text-slate-300">[input label="Sign here" placeholder="- - - - -"
                name="username" max="16"]</span> (one name saves for real.{" "}
                <span className="font-mono text-slate-300">username</span> saves the real Minecraft name Settings
                uses, and holds it to Minecraft&rsquo;s own rule of 2 to 16 letters, numbers and underscores
                before it saves. Other names are just for fun),{" "}
                <span className="font-mono text-slate-300">[slider label="How keen?" min="0" max="100"]</span>. A{" "}
                <span className="font-mono text-slate-300">label=</span> takes spans, so{" "}
                <span className="font-mono text-slate-300">label="`red+bold:Prick` your finger"</span> colours the
                word it names. A <span className="font-mono text-slate-300">placeholder=</span> cannot: the browser
                draws that ghost text itself and no styling reaches it, so a span written there keeps its words and
                quietly drops its colour rather than showing you backticks.
              </p>
              <p>
                <span className={LABEL}>The signature line</span> takes more than a name if you want it:{" "}
                <span className="font-mono text-slate-300">line="dotted"</span> picks the stroke (
                <span className="font-mono text-slate-300">dashed</span> is the default, with{" "}
                <span className="font-mono text-slate-300">solid</span> and{" "}
                <span className="font-mono text-slate-300">none</span> for the rest),{" "}
                <span className="font-mono text-slate-300">colour="gold"</span> tints it with any of the eight
                palette names or a hex code of your own (
                <span className="font-mono text-slate-300">colour="#ff8800"</span>),{" "}
                <span className="font-mono text-slate-300">text="gold"</span> colours what the reader types
                rather than the line under it, reading the same names and hex codes (leave it off and the
                writing is the usual near-white),{" "}
                <span className="font-mono text-slate-300">max="16"</span> caps the length so
                typing simply stops there, and{" "}
                <span className="font-mono text-slate-300">pattern="[a-z ]+"</span> is checked live as the reader
                types: while the text does not match, the line turns red and a message shows underneath.{" "}
                <span className="font-mono text-slate-300">invalid="Lowercase letters only"</span> writes that
                message in your own words, and <span className="font-mono text-slate-300">pattern=""</span> turns
                checking off for a name that would otherwise carry a rule of its own.
              </p>
              <p>
                <span className={LABEL}>Spans</span> colour and set type mid-sentence:{" "}
                <span className="font-mono text-slate-300">`gold:blood partially required`</span>,{" "}
                <span className="font-mono text-slate-300">`hl+bold:read this`</span>. The toolbar buttons wrap
                your selection for you. <span className="font-mono text-slate-300">bold</span> (and{" "}
                <span className="font-mono text-slate-300">**bold**</span>) carries full weight and lifts the
                words to white, so it reads as bold rather than as ordinary text. The eight names are the colours
                worth one click, not the only ones: a hex code is a colour token too (
                <span className="font-mono text-slate-300">`#ff8800:any colour`</span>) and combines like the rest
                (<span className="font-mono text-slate-300">`#ff8800+bold:loud`</span>). The rainbow dot at the end
                of the swatches opens your system colour picker and wraps the selection in whatever you pick.
              </p>
              <p>
                <span className={LABEL}>Footer</span> styling:{" "}
                <span className="font-mono text-slate-300">[next label="I love tutorials!"]</span>{" "}
                renames that step&rsquo;s Next;{" "}
                <span className="font-mono text-slate-300">[skip label="Ugh.. tutorials" confirm="I REALLY hate
                tutorials"]</span> adds a two-click skip that renames itself on the first click and moves Back over
                beside Next. <span className="font-mono text-slate-300">[page]</span> on its own line among your
                words draws the step counter right there; on a line beside{" "}
                <span className="font-mono text-slate-300">[skip]</span> or{" "}
                <span className="font-mono text-slate-300">[next]</span> (blank lines between are fine) it centres
                in the footer between them;{" "}
                <span className="font-mono text-slate-300">[page hidden]</span> drops it from the step altogether.
              </p>
              <p>
                <span className={LABEL}>Editing</span>: every button here types rather than rewrites, so{" "}
                <span className="font-mono text-slate-300">Ctrl+Z</span> and{" "}
                <span className="font-mono text-slate-300">Ctrl+Y</span> walk back through toolbar clicks, colours
                you picked, anything from the Insert menu and Load file exactly as they do through your own
                keystrokes. <span className="font-mono text-slate-300">Insert</span> holds the markers and the step
                break, and drops the one you choose where your caret was.{" "}
                <span className="font-mono text-slate-300">Ctrl+B</span>,{" "}
                <span className="font-mono text-slate-300">Ctrl+I</span> and{" "}
                <span className="font-mono text-slate-300">Ctrl+H</span> (Cmd on a Mac) are bold, italic and
                highlight. The style buttons toggle: a lit one is already on your selection and pressing it takes
                that style off, the last one off leaving plain text. Adding a second style to a span joins it (
                <span className="font-mono text-slate-300">`hl+bold:...`</span>) instead of nesting.{" "}
                <span className="font-mono text-slate-300">Tab</span> types two spaces; Shift+Tab still moves focus
                out of the box.
              </p>
            </div>
          </div>
        </div>

        {/* ---- the real render ------------------------------------------- */}
        <div className={PANEL}>
          <SectionHead
            title="Preview"
            right={<span className={LABEL}>{steps.length === 1 ? "1 step" : `${steps.length} steps`}</span>}
          />
          <div className="space-y-3 p-3">
            {steps.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {steps.map((s, i) => {
                  const name = stepLabel(s);
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setStep(i)}
                      aria-pressed={i === current}
                      className={i === current ? LAB_TAB_LIT : LAB_TAB_IDLE}
                    >
                      {i + 1}{name ? ` ${name}` : ""}
                    </button>
                  );
                })}
              </div>
            )}

            {steps.length === 0 ? (
              <p className="py-10 text-center text-[12px] text-slate-400">
                Nothing to show yet. Write a step on the left.
              </p>
            ) : (
              /* The tour's own window, embedded: same surface classes as the
                 live overlay so the preview is the shipped look. */
              <div className="sd-lip mx-auto w-full max-w-xl rounded-lg border border-white/12 bg-slate-900/85 p-5">
                <TourStepView step={steps[current]} index={current} count={steps.length} />
                <FooterPreview step={steps[current]} index={current} count={steps.length} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TourLabPage;
