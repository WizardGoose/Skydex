import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Copy, Check, Info } from "lucide-react";
import { DiscordIcon } from "../components/ui/DiscordIcon";
import { SITE_NAME } from "../ui/brand";
import { FOCUS } from "../ui/kit";
import "./ContactPage.css";

/**
 * About. One of the four prose surfaces on the site, so it gets a readable
 * measure and room to breathe rather than the tool density used everywhere
 * else.
 *
 * One explainer under the title and one only. Everything else sits under a
 * heading, because a second paragraph floating below the rule reads as an
 * afterthought rather than as part of anything, and the site had grown one of
 * those on nearly every page.
 */

/**
 * A caption that earned a hover instead of a paragraph. Same contract as the
 * glyph on the tool pages: `title` carries the words to keyboard focus and
 * screen readers, and `text-slate-400` keeps the smallest thing on the page
 * above AA on this ground.
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

/** A handle you can copy. The tick replaces the copy glyph in place, so the row never moves. */
const CopyChip: React.FC<{ value: string }> = ({ value }) => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = () => {
    void navigator.clipboard.writeText(value).catch(() => undefined);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={copy}
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

export const AboutPage: React.FC = () => (
  <div className="mx-auto w-full max-w-[65ch] px-1 py-10">
    <header>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-100">About {SITE_NAME}</h1>
      <div className="mt-3 h-px bg-gradient-to-r from-emerald-500/60 via-slate-800 to-transparent" />
      <p className="mt-4 text-sm leading-[1.8] text-slate-300">
        Tools for the long grinds in SkyBlock: shard fusions, greenhouse layouts and crafting costs.
        <InfoGlyph
          label={`${SITE_NAME} is open source and is not affiliated with or endorsed by Hypixel Inc. Item, recipe and mutation data are loaded live from the Hypixel SkyBlock Wiki and the public Hypixel API.`}
        />
      </p>
    </header>

    <section className="mt-10 border-t border-slate-800 pt-8">
      <h2 className="text-base font-semibold text-slate-100">Getting started</h2>
      <p className="mt-3 text-sm leading-[1.8] text-slate-400">
        The{" "}
        <Link to="/guide" className="text-emerald-300 underline decoration-emerald-500/40 underline-offset-4 transition-colors hover:decoration-emerald-400">
          guide
        </Link>{" "}
        walks through the calculator from an empty screen.
      </p>
    </section>

    <section className="mt-10 border-t border-slate-800 pt-8">
      <h2 className="text-base font-semibold text-slate-100">Credit</h2>
      <p className="mt-3 text-sm leading-[1.8] text-slate-400">
        The fusion calculator and the greenhouse solver are forked from{" "}
        <a
          href="https://github.com/Campionnn/SkyShards"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-300 underline decoration-emerald-500/40 underline-offset-4 transition-colors hover:decoration-emerald-400"
        >
          SkyShards
        </a>{" "}
        by Campion and xKapy. Reach them here.
      </p>
      <p className="mt-3 text-sm leading-[1.8] text-slate-400">
        Product and interface inspiration came from{" "}
        <a
          href="https://cupcake.shiiyu.moe"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-300 underline decoration-emerald-500/40 underline-offset-4 transition-colors hover:decoration-emerald-400"
        >
          SkyCrypt
        </a>{" "}
        and{" "}
        <a
          href="https://github.com/meowdding/SkyOcean"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-300 underline decoration-emerald-500/40 underline-offset-4 transition-colors hover:decoration-emerald-400"
        >
          SkyOcean
        </a>
        . SkyOcean was a major inspiration for the companion mod and for making
        broad SkyBlock tooling feel like one cohesive, in-game-first toolkit.
      </p>

      <dl className="mt-6 space-y-7">
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
    </section>
  </div>
);
