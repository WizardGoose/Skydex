import React, { useEffect, useRef, useState } from "react";
import { Mail, Copy, Check, Info } from "lucide-react";
import { DiscordIcon } from "../components/ui/DiscordIcon";
import { SITE_NAME } from "../ui/brand";
import { FOCUS } from "../ui/kit";
import "./ContactPage.css";

/**
 * Contact. One of the four prose surfaces on the site, so it gets a readable
 * measure and room to breathe rather than the tool density used everywhere
 * else.
 *
 * One explainer under the title, one line long. The caveat about this being a
 * fork with no address of its own is worth saying and was four lines of grey
 * text standing between a person and the two handles they came for, so it is a
 * hover now rather than a wall.
 */

/**
 * A caption that earned a hover instead of a paragraph. `title` carries the
 * words to keyboard focus and screen readers, and `text-slate-400` keeps the
 * smallest thing on the page above AA on this ground.
 */
const InfoGlyph: React.FC<{ label: string }> = ({ label }) => (
  <span
    tabIndex={0}
    role="note"
    aria-label={label}
    title={label}
    className={`ml-1.5 inline-flex shrink-0 cursor-help items-center align-middle text-slate-400 hover:text-emerald-300 ${FOCUS}`}
  >
    <Info className="h-3.5 w-3.5" />
  </span>
);

// Kept here with the component because this is the page's clipboard boundary.
// eslint-disable-next-line react-refresh/only-export-components
export const copyContactValue = async (
  value: string,
  clipboard: Pick<Clipboard, "writeText"> | null | undefined = typeof navigator === "undefined" ? null : navigator.clipboard,
): Promise<boolean> => {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
};

/** A handle you can copy. The tick replaces the copy glyph in place, so the row never moves. */
const CopyChip: React.FC<{ value: string }> = ({ value }) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    if (!await copyContactValue(value)) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={() => { void copy(); }}
      aria-label={`Copy ${value}`}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[12px] text-slate-200 transition-colors hover:border-emerald-500/50 hover:text-emerald-200 ${FOCUS}`}
    >
      {value}
      {copied ? <Check className="ws-copy-ack w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
      <span className="sr-only" role="status">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
};

export const ContactPage: React.FC = () => (
  <div className="mx-auto w-full max-w-[65ch] px-1 py-10">
    <header>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-100">Contact</h1>
      <div className="mt-3 h-px bg-gradient-to-r from-emerald-500/60 via-slate-800 to-transparent" />
      <p className="mt-4 text-sm leading-[1.8] text-slate-400">
        These channels reach Campion and xKapy, who wrote{" "}
        <a
          href="https://github.com/Campionnn/SkyShards"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-300 underline decoration-emerald-500/40 underline-offset-4 transition-colors hover:decoration-emerald-400"
        >
          SkyShards
        </a>
        .
        <InfoGlyph
          label={`SkyShards is the fusion calculator and greenhouse solver this site is built on. ${SITE_NAME} is a personal fork and has no separate address of its own yet, so questions about the tools themselves are best sent here.`}
        />
      </p>
    </header>

    <dl className="mt-9 space-y-7">
      <div>
        <dt className="text-[12px] font-semibold text-slate-300">Email</dt>
        <dd className="mt-2">
          <a
            href="mailto:skyshardsdev@gmail.com"
            className="inline-flex items-center gap-2 text-sm text-emerald-300 underline decoration-emerald-500/40 underline-offset-4 transition-colors hover:decoration-emerald-400"
          >
            <Mail className="w-4 h-4 shrink-0 text-slate-500" />
            skyshardsdev@gmail.com
          </a>
        </dd>
      </div>

      <div>
        <dt className="text-[12px] font-semibold text-slate-300">Discord</dt>
        <dd className="mt-2 flex flex-wrap items-center gap-2">
          <DiscordIcon className="w-5 h-5 shrink-0" />
          <CopyChip value="campionn" />
          <span className="text-[11px] text-slate-500">or</span>
          <CopyChip value="xkapy" />
        </dd>
      </div>
    </dl>
  </div>
);
