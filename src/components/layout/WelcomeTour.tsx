import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { FOCUS } from "../../ui/kit";
import { SITE_NAME } from "../../ui/brand";

const TourBody = lazy(() => import("./TourBody"));

/**
 * The first-visit tour: the site's introduction, over a blurred site, in the
 * same window language as the settings overlay. It runs once, on whatever
 * page a new visitor lands on.
 *
 * The WORDS are not here. They live in `tour.md`, parsed by
 * `tourContent.ts` and rendered by `TourStepView`, so the introduction is
 * written in plain Markdown rather than in code, and the Tour Lab
 * (`/tour-lab` on a dev build) is a live editor for drafting it. This file
 * is only the gate: when the tour shows, and the frosted window it shows in.
 */

/**
 * Written once the tour has been seen, finished or skipped alike: a skipped
 * tour re-appearing is nagging, not onboarding. Settings offers a replay.
 */
export const WELCOME_KEY = "skydex.welcome.v1";

/**
 * Re-opens the tour from anywhere (Settings offers it). An event rather than
 * shared state because the tour and the button live in unrelated trees, and
 * a whole store for one "show it again" would be ceremony.
 */
export const REPLAY_EVENT = "skydex:welcome-replay";
export const replayTour = () => window.dispatchEvent(new Event(REPLAY_EVENT));

const seen = (): boolean => {
  try {
    return localStorage.getItem(WELCOME_KEY) !== null;
  } catch {
    /* No storage means every visit would be the first; a tour on every visit
       is worse than none. */
    return true;
  }
};

const markSeen = () => {
  try {
    localStorage.setItem(WELCOME_KEY, JSON.stringify({ v: 1, seenAt: Date.now() }));
  } catch {
    /* Nothing to do: the tour simply shows again next time. */
  }
};

export const WelcomeTour: React.FC = () => {
  const [open, setOpen] = useState(() => !seen());
  const panelRef = useRef<HTMLDivElement | null>(null);

  const finish = () => {
    markSeen();
    setOpen(false);
  };

  useEffect(() => {
    const onReplay = () => setOpen(true);
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 px-3 py-8 backdrop-blur-[6px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) finish();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Welcome to ${SITE_NAME}`}
        tabIndex={-1}
        className="sd-lip relative w-full max-w-xl rounded-lg border border-white/12 bg-slate-900/85 p-5 outline-none"
      >
        <button
          type="button"
          onClick={finish}
          aria-label="Skip the tour"
          className={`absolute right-3 top-3 cursor-pointer rounded-md p-2 text-slate-300 transition-colors hover:bg-white/8 hover:text-slate-50 active:translate-y-px ${FOCUS}`}
        >
          <X className="h-4 w-4" />
        </button>

        <Suspense
          fallback={
            <div className="flex min-h-[16rem] items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500/20 border-t-emerald-500" />
            </div>
          }
        >
          <TourBody finish={finish} />
        </Suspense>
      </div>
    </div>
  );
};
