import { useEffect, useState } from "react";

export interface DeferredStartOptions {
  /** Start on the very next tick instead of waiting for the window to settle. */
  immediate?: boolean;
  /** Shortest wait after `load` before the deferred work may begin. */
  minDelayMs?: number;
  /** Longest the idle callback may be postponed once the minimum has passed. */
  idleTimeoutMs?: number;
}

/**
 * `false` on first render, `true` once the page has finished loading and the
 * main thread has had a moment of quiet. With `immediate`, flips on mount.
 */
export const useDeferredStart = ({
  immediate = false,
  minDelayMs = 2000,
  idleTimeoutMs = 4000,
}: DeferredStartOptions = {}): boolean => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    let live = true;
    let idleHandle: number | null = null;
    let timerHandle: number | null = null;
    const start = () => {
      if (live) setReady(true);
    };

    if (immediate) {
      timerHandle = window.setTimeout(start, 0);
    } else {
      const afterQuiet = () => {
        if (!live) return;
        if (typeof window.requestIdleCallback === "function") {
          idleHandle = window.requestIdleCallback(start, { timeout: idleTimeoutMs });
        } else {
          timerHandle = window.setTimeout(start, 300);
        }
      };
      const afterLoad = () => {
        if (live) timerHandle = window.setTimeout(afterQuiet, minDelayMs);
      };
      if (document.readyState === "complete") afterLoad();
      else window.addEventListener("load", afterLoad, { once: true });

      return () => {
        live = false;
        window.removeEventListener("load", afterLoad);
        if (idleHandle !== null) window.cancelIdleCallback(idleHandle);
        if (timerHandle !== null) window.clearTimeout(timerHandle);
      };
    }

    return () => {
      live = false;
      if (timerHandle !== null) window.clearTimeout(timerHandle);
    };
  }, [immediate, minDelayMs, idleTimeoutMs, ready]);

  return ready;
};
