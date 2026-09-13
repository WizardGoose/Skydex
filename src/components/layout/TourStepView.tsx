import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useSearchParams } from "react-router-dom";
import { BTN_QUIET, FOCUS } from "../../ui/kit";
import { VectorMark } from "../../mark";
import { useProfileType, type ProfileType } from "../../profile/profileType";
import { useApiAccess, uuidForName } from "../../island/apiKey";
import {
  SPAN_COLOURS,
  colourOf,
  inputRule,
  inputValid,
  isHexColour,
  parseSpan,
  splitSpans,
  stripSpans,
  type InputLine,
  type TourBlock,
  type TourStep,
} from "./tourContent";
import { LABEL } from "../../ui/kit";

/**
 * One tour step, rendered from parsed `tour.md` content. Shared verbatim by
 * the live tour and the Tour Lab's preview, which is what makes the lab an
 * honest preview rather than an approximation.
 */

const INNER_LINK = `text-emerald-300 underline decoration-emerald-400/50 underline-offset-2 rounded-sm hover:text-emerald-200 ${FOCUS}`;

/** A backtick span: either a styling span (`gold:...`) or honest inline code. */
const StyledSpan: React.FC<{ raw: string }> = ({ raw }) => {
  const span = parseSpan(raw);
  if (!span) {
    return <code className="rounded-sm bg-black/30 px-1 font-mono text-[12px] text-slate-200">{raw}</code>;
  }
  const style: React.CSSProperties = {};
  let cls = "";
  for (const t of span.tokens) {
    /* Named or written out, a colour token is a colour token, and the last
       one in the span wins: stacking two is a rewrite rather than a blend,
       and taking the later one means editing the front of a span behaves the
       way editing the front of anything else does. */
    if (SPAN_COLOURS[t] || isHexColour(t)) style.color = colourOf(t);
    else if (t === "hl") cls += " rounded-sm bg-emerald-500/20 px-1";
    else if (t === "chrome") { style.fontFamily = "var(--font-chrome)"; style.fontWeight = 700; }
    else if (t === "mono") cls += " font-mono";
    /* Full bold plus the lift to white: semibold alone is invisible at this
       size. An accompanying colour token still wins, riding an inline style. */
    else if (t === "bold") cls += " font-bold text-slate-50";
    else if (t === "italic") cls += " italic";
    else if (t === "big") cls += " text-[15px] font-semibold";
    else if (t === "small") cls += " text-[11px]";
  }
  return <span className={cls.trim() || undefined} style={style}>{span.text}</span>;
};

/**
 * An attribute string, with its one styling channel honoured.
 *
 * A label lives inside a marker rather than in the body, so it never reaches
 * the Markdown renderer and used to show its own backticks as text. It gets
 * the span channel and nothing else: spans are what the toolbar writes and
 * what colours a word, while links and block structure have nowhere to go
 * inside an attribute. The spans themselves go through the same component the
 * body uses, so a colour cannot come out differently on either side of the
 * quote mark.
 */
const Inline: React.FC<{ raw: string }> = ({ raw }) => (
  <>
    {splitSpans(raw).map((piece, i) => (piece.span === null ? piece.text : <StyledSpan key={i} raw={piece.span} />))}
  </>
);

/**
 * The caption above a control. Its size is the format's to set and everything
 * past that is the author's, spans included, which is the same bargain the
 * headings make. The [input] and [slider] labels share the one string: they
 * are the same object to a reader, and the only way they could look unalike
 * is by drifting apart here.
 */
const CONTROL_LABEL = "mb-1 block text-[12px] text-slate-300";

/** Markdown, in the tour's own type. */
const Md: React.FC<{ text: string; onNavigate?: () => void }> = ({ text, onNavigate }) => (
  <ReactMarkdown
    components={{
      p: ({ children }) => <p className="text-[12.5px] leading-relaxed text-slate-200">{children}</p>,
      strong: ({ children }) => <span className="font-semibold text-slate-50">{children}</span>,
      em: ({ children }) => <em className="text-slate-200">{children}</em>,
      /* A bulleted list needs its bullets: the CSS reset takes list markers
         off everything, so a `- ` list arrived as stacked sentences with no
         sign it was ever a list. The marker is deliberately dimmer than the
         words, because a disc at full text colour reads as another word
         rather than as punctuation holding the row. */
      ul: ({ children }) => (
        <ul className="list-disc space-y-1.5 pl-4 text-[12.5px] leading-relaxed text-slate-200 marker:text-slate-500">
          {children}
        </ul>
      ),
      ol: ({ children }) => <ol className="list-decimal space-y-1.5 pl-4 text-[12.5px] leading-relaxed text-slate-200">{children}</ol>,
      li: ({ children }) => <li>{children}</li>,
      code: ({ children }) => <StyledSpan raw={String(children)} />,
      /* Headings mean headings, the way Markdown promises, and each level is
         a STEP IN SIZE rather than a costume: # is title-grade and carries
         the chrome face, ## is the same words larger, ### the same words
         smaller and quieter. Past that they add no face, weight or case of
         their own, so how a heading looks stays the author's to say in spans,
         and **bold** or a backtick span inside any of the three lines works
         there like anywhere else. Without the h1 mapping a mid-body # fell
         through to the CSS reset and rendered as plain text.

         The caption's NEGATIVE top margin is what makes it a caption rather
         than the next thing along. These blocks are spaced by `space-y`,
         which sets the gap on the bottom of each element instead of the top
         of the next, so a positive margin here would only collapse into that
         larger one and change nothing at all. A negative margin does not
         collapse away, it is added to the gap, which is the only lever this
         element has over the distance above it. */
      h1: ({ children }) => (
        <h3 className="mt-1 text-[16px] text-slate-50" style={{ fontFamily: "var(--font-chrome)", fontWeight: 800 }}>
          {children}
        </h3>
      ),
      h2: ({ children }) => <h4 className="mt-1 text-[14.5px] text-slate-50">{children}</h4>,
      h3: ({ children }) => <h5 className="-mt-1.5 text-[11px] text-slate-400">{children}</h5>,
      a: ({ href, children }) => {
        /* Site paths navigate in-app and close the tour; anything external
           opens a tab. The tour must never strand a reader mid-overlay. */
        if (href && href.startsWith("/")) {
          return (
            <Link to={href} onClick={onNavigate} className={INNER_LINK}>
              {children}
            </Link>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" className={INNER_LINK}>
            {children}
          </a>
        );
      },
    }}
  >
    {text}
  </ReactMarkdown>
);

const MODE_LINE_IRONMAN = "pain :)";
const MODE_LINE_NORMAL = "I have `green:money`!";

const PROFILE_TYPE_DETAILS: Record<ProfileType, string> = {
  ironman: "No Bazaar, Auction House or trading. Skydex keeps recommendations to things you can gather, craft or earn.",
  converter: "A former Ironman with market access. Skydex uses Normal calculations while keeping the identity you chose.",
  normal: "Market access is available. Skydex can compare buying with crafting when prices are available.",
};

const ModePicker: React.FC<{ block: Extract<TourBlock, { kind: "mode-picker" }> }> = ({ block }) => {
  const { profileType, setProfileType } = useProfileType();

  /* Each card carries its displayed profile type and identity colour, so one
     click handler and one style rule serve all three. The shared profile-type
     hook keeps Converter's label separate from its Normal calculation mode.

     The tones are read off SPAN_COLOURS rather than written as hexes. Two of
     the three ARE theme variables in that table, so a copy would be a second
     author for a colour the palette already owns and would sit out the next
     retint. Naming the entry is also the honest statement of what these are:
     the tour's own palette, used again. */
  const cards: { profileType: ProfileType; label: string; line: string; detail: string; tone: string }[] = [
    {
      profileType: "ironman",
      label: "Ironman",
      line: block.ironman ?? MODE_LINE_IRONMAN,
      detail: PROFILE_TYPE_DETAILS.ironman,
      tone: SPAN_COLOURS.blue,
    },
    {
      profileType: "normal",
      label: "Normal",
      line: block.normal ?? MODE_LINE_NORMAL,
      detail: PROFILE_TYPE_DETAILS.normal,
      tone: SPAN_COLOURS.green,
    },
  ];
  if (block.converter !== null) {
    /* Converter sits BETWEEN Ironman and Normal, because that is where a
       converted profile technically lives: born ironman, market access now. */
    cards.splice(1, 0, {
      profileType: "converter",
      label: "Converter",
      line: block.converter,
      detail: PROFILE_TYPE_DETAILS.converter,
      tone: SPAN_COLOURS.gold,
    });
  }

  return (
    <div className="rounded-md border border-white/12 bg-black/15" role="group" aria-label="Profile type">
      {cards.map((card, index) => {
        const on = profileType === card.profileType;
        return (
          <button
            key={card.label}
            type="button"
            aria-pressed={on}
            onClick={() => setProfileType(card.profileType)}
            className={`relative grid w-full cursor-pointer gap-x-4 gap-y-1 px-3 py-2.5 text-left transition-colors sm:grid-cols-[9.5rem_minmax(0,1fr)] ${FOCUS} ${
              index > 0 ? "border-t border-white/10" : ""
            } ${on ? "bg-white/5" : "hover:bg-white/5"}`}
          >
            {on && (
              <span
                aria-hidden="true"
                className="absolute bottom-2 left-0 top-2 w-0.5 rounded-r-full"
                style={{ backgroundColor: card.tone }}
              />
            )}
            <span>
              <span className="block text-[13px] font-semibold" style={{ color: card.tone }}>
                {card.label}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-slate-300">
                <Inline raw={card.line} />
              </span>
            </span>
            <span className="text-[11px] leading-relaxed text-slate-400">{card.detail}</span>
          </button>
        );
      })}
    </div>
  );
};

/**
 * The signature line. Styled as a dotted line to sign rather than as a form
 * field, because that is the joke the authoring format exists to permit.
 *
 * A KNOWN name saves for real; the registry is deliberately tiny and explicit.
 * "username" writes the same Minecraft name the Settings page uses. An unknown
 * or missing name still renders and remembers nothing, which the format doc says
 * out loud.
 */
/* The strokes line= can ask for, as whole literal utilities. */
const LINE_CLASS: Record<InputLine, string> = {
  dashed: "border-dashed",
  dotted: "border-dotted",
  solid: "border-solid",
  none: "border-none",
};

/** The whole of the name= registry. Every other name is a line to sign and nothing more. */
type InputBinding = "username";

const bindingOf = (name: string | null): InputBinding | null =>
  name === "username" ? name : null;

const InputBlock: React.FC<{ block: Extract<TourBlock, { kind: "input" }> }> = ({ block }) => {
  const { access, setAccount } = useApiAccess();
  const binding = bindingOf(block.name);
  const [local, setLocal] = useState("");
  /* A bound line's failing text lives here instead of the store, so typing
     still echoes while only passing values reach Settings. Null means the
     store's value is showing. */
  const [draft, setDraft] = useState<string | null>(null);
  const stored = binding === "username" ? access.name : "";
  const value = binding ? (draft ?? stored) : local;

  const rule = inputRule(block);
  const ok = inputValid(value, rule);
  /* Author's tint loses to the failure red; both ride an inline style because
     the palette is data, and both deliberately outrank the focus colour, so a
     tinted or failing line keeps saying so while being typed in. */
  const stroke = !ok ? SPAN_COLOURS.red : block.colour ? colourOf(block.colour) : undefined;
  /* The writing, tinted independently of the line under it. Failure red is
     not applied here: the stroke and the message below already carry that,
     and reddening the words as well would say one thing three times while
     destroying whatever the author asked the writing to look like. Undefined
     leaves the slate-50 utility standing rather than restating it. */
  const ink = block.text ? colourOf(block.text) : undefined;

  return (
    <label className="block">
      {block.label && (
        <span className={CONTROL_LABEL}>
          <Inline raw={block.label} />
        </span>
      )}
      <input
        type="text"
        value={value}
        /* The browser draws the placeholder, and it draws text: no element
           exists to hang a colour on. So the syntax is answered honestly
           rather than either way round that lies, showing the author's words
           without their styling instead of showing their backticks. */
        placeholder={stripSpans(block.placeholder)}
        maxLength={block.max ?? undefined}
        spellCheck={false}
        onChange={(e) => {
          const next = e.target.value;
          if (!binding) {
            setLocal(next);
            return;
          }
          if (!inputValid(next, rule)) {
            setDraft(next);
            return;
          }
          setDraft(null);
          /* The uuid comes with the name or not at all. Typing a different
             name here must not leave the previous player's uuid sitting
             beside it, because the import path trusts that pair. */
          setAccount(uuidForName(access, next), next);
        }}
        /* Body font, not mono. What goes on a signature line is handwriting,
           and mono reads as a form field or a code sample, which is the one
           thing this control is drawn not to be. `font-medium` gives the
           writing a little more weight than the prose around it so it still
           reads as something entered rather than something printed. */
        className={`w-full max-w-[22rem] border-0 border-b-2 ${LINE_CLASS[block.line]} border-white/25 bg-transparent px-1 pb-1 text-[14px] font-medium text-slate-50 placeholder:text-slate-500 focus:border-emerald-400/70 focus:outline-none ${FOCUS}`}
        style={stroke || ink ? { borderColor: stroke, color: ink } : undefined}
      />
      {!ok && (
        <span className="mt-1 block text-[11px] leading-snug" style={{ color: SPAN_COLOURS.red }}>
          {block.invalid ??
            (binding === "username" && block.pattern === null
              ? "2 to 16 characters: letters, numbers and underscores"
              : "That doesn't look right yet")}
        </span>
      )}
    </label>
  );
};

/** A slider with a live readout. Cosmetic unless a binding ever claims its name. */
const SliderBlock: React.FC<{ label: string | null; min: number; max: number }> = ({ label, min, max }) => {
  const [value, setValue] = useState(Math.round((min + max) / 2));
  return (
    <label className="block max-w-[22rem]">
      {label && (
        <span className={CONTROL_LABEL}>
          <Inline raw={label} />
        </span>
      )}
      <span className="flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="h-4 w-full cursor-pointer accent-emerald-400"
        />
        <span className="w-10 shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums text-slate-50">{value}</span>
      </span>
    </label>
  );
};

const SettingsButton: React.FC<{ onOpen?: () => void }> = ({ onOpen }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  return (
    <button
      type="button"
      className={BTN_QUIET}
      onClick={() => {
        onOpen?.();
        const next = new URLSearchParams(searchParams);
        next.set("settings", "1");
        setSearchParams(next);
      }}
    >
      Open Settings
    </button>
  );
};

export const TourStepView: React.FC<{
  step: TourStep;
  /** Which step this is and of how many, for an authored [page] counter. */
  index?: number;
  count?: number;
  /** The live tour lifts Wonder above the dialogue surface; previews may keep it inline. */
  renderWordmark?: boolean;
  /** Called when a block navigates away or opens settings: the tour closes. */
  onLeave?: () => void;
}> = ({ step, index = 0, count = 1, renderWordmark = true, onLeave }) => (
  <div className="space-y-4">
    {step.title && (
      <h3 className="text-[16px] text-slate-50" style={{ fontFamily: "var(--font-chrome)", fontWeight: 800 }}>
        {step.title}
      </h3>
    )}
    {step.blocks.map((block, i) => {
      switch (block.kind) {
        case "wordmark":
          if (!renderWordmark) return null;
          return (
            <div key={i} className="flex justify-center [filter:drop-shadow(0_5px_18px_rgb(7_8_10/0.72))]" aria-label="Wonder">
              <VectorMark
                alert
                thinking={false}
                className="aspect-[35/12] w-[10rem] overflow-visible sm:w-[12rem]"
              />
            </div>
          );
        case "mode-picker":
          return <ModePicker key={i} block={block} />;
        case "settings-button":
          return <SettingsButton key={i} onOpen={onLeave} />;
        case "page":
          /* [page hidden] silences the counter for the whole step, so a
             second, visible [page] elsewhere in the same step does not get to
             reinstate it. The footer reads the same step-level flag. */
          if (block.hidden || step.hiddenPage) return null;
          return (
            <span key={i} className={LABEL}>
              {index + 1} / {count}
            </span>
          );
        case "input":
          return <InputBlock key={i} block={block} />;
        case "slider":
          return <SliderBlock key={i} label={block.label} min={block.min} max={block.max} />;
        case "md":
          return (
            <div key={i} className="space-y-2.5">
              <Md text={block.text} onNavigate={onLeave} />
            </div>
          );
      }
    })}
  </div>
);
