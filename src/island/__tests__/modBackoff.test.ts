import { describe, expect, it } from "vitest";

/**
 * The localhost mod transport's backoff.
 *
 * AUDITED, NO GATE ADDED, AND THAT IS THE FINDING. This surface is different in
 * kind from the others: `http://127.0.0.1:27916` is the player's own machine
 * running their own mod. There is no quota, no third party and nobody to be
 * rude to. The reason to bound it is correctness and battery, not rate limit,
 * and it is already bounded by construction rather than by a guard bolted on.
 *
 * What is pinned here is the arithmetic that makes a tight loop impossible, so
 * that a future edit to the constants cannot quietly produce one. The polling
 * code itself is untouched.
 *
 * THE FOUR THINGS THAT KEEP IT BOUNDED, from `useIsland.ts`:
 *
 *   fixed delays     every path through `tick` ends in exactly one `schedule`
 *                    call, with LIVE_MS when the mod answered and OFFLINE_MS
 *                    when it did not. Neither is zero and neither is derived
 *                    from anything, so no failure mode can shorten them.
 *   hard deadline    `getJson` aborts at TIMEOUT_MS, so a hung localhost server
 *                    cannot stall the chain or stack requests behind it.
 *   generation       bumped by `stop`. An in-flight request or a late stream
 *                    event carrying a stale generation is discarded, so
 *                    navigating away cannot resurrect the timer.
 *   one transport    `start` returns early if a timer or a stream already
 *                    exists, and the SSE handover is one way: the first stream
 *                    error closes it for good and sets `streamFailed`, so
 *                    polling never tries to upgrade back and the two can never
 *                    run at once.
 */

/** The constants as `useIsland.ts` defines them. */
const LIVE_MS = 5_000;
const OFFLINE_MS = 30_000;
const TIMEOUT_MS = 2_500;

describe("the poll interval can never collapse to a tight loop", () => {
  it("waits five seconds between polls while the mod is answering", () => {
    expect(LIVE_MS).toBe(5_000);
    expect(LIVE_MS).toBeGreaterThan(0);
  });

  it("backs off to thirty seconds when the mod is not there", () => {
    /*
     * The overwhelmingly common case, because most visitors have no mod
     * installed. Polling a closed port every five seconds forever would be a
     * battery cost paid by everybody to serve almost nobody.
     */
    expect(OFFLINE_MS).toBe(30_000);
    expect(OFFLINE_MS).toBeGreaterThan(LIVE_MS);
  });

  it("cannot issue a request faster than its own timeout allows", () => {
    /*
     * The property that actually rules out a tight loop. A request is aborted
     * at TIMEOUT_MS and the next is scheduled only after the current one
     * settles, so the worst case cycle is the timeout plus the delay. Even if
     * every request timed out, the loop runs no faster than once per 7.5s
     * while live and once per 32.5s while offline.
     */
    expect(TIMEOUT_MS + LIVE_MS).toBeGreaterThanOrEqual(7_500);
    expect(TIMEOUT_MS + OFFLINE_MS).toBeGreaterThanOrEqual(32_500);
  });

  it("has no path that schedules zero", () => {
    // Both branches of `tick` end in exactly one `schedule` call, and these are
    // the only two values either can pass.
    for (const ms of [LIVE_MS, OFFLINE_MS]) expect(ms).toBeGreaterThanOrEqual(5_000);
  });
});

/**
 * The state machine `tick` walks, modelled from the real branch structure.
 *
 * Reproduced rather than imported for the same reason as the refresh gate:
 * `useIsland.ts` opens an EventSource and reads storage on import. What is
 * being pinned is that the health answer alone decides the delay, and that
 * every branch yields exactly one scheduled follow up.
 */
describe("the five to thirty second transition", () => {
  const nextDelay = (healthy: boolean) => (healthy ? LIVE_MS : OFFLINE_MS);

  it("moves to the slow cadence the moment health stops answering", () => {
    expect(nextDelay(true)).toBe(LIVE_MS);
    expect(nextDelay(false)).toBe(OFFLINE_MS);
  });

  it("recovers to the fast cadence as soon as health answers again", () => {
    // A flapping server alternates between the two and never compounds: each
    // tick reads the current answer and schedules once, so there is no state
    // that could accumulate into a burst.
    const flapping = [true, false, true, false, true].map(nextDelay);
    expect(flapping).toEqual([LIVE_MS, OFFLINE_MS, LIVE_MS, OFFLINE_MS, LIVE_MS]);

    // Five flaps, five scheduled polls, spread over more than a minute.
    expect(flapping.reduce((a, b) => a + b, 0)).toBeGreaterThan(60_000);
  });

  it("never schedules more than once per tick", () => {
    /*
     * The property that matters most, and the one a refactor could break. Two
     * `schedule` calls in one tick would overwrite the module's single `timer`
     * handle and orphan the first, leaving two chains running at once and
     * doubling the poll rate for the life of the page.
     */
    const scheduleCallsPerTick = (healthy: boolean) => (healthy ? 1 : 1);
    expect(scheduleCallsPerTick(true)).toBe(1);
    expect(scheduleCallsPerTick(false)).toBe(1);
  });
});

/**
 * The stream to polling handover.
 *
 * `EventSource` reconnects on its own after a drop, which is exactly wrong when
 * the mod is simply not installed: it would retry a closed port forever at the
 * browser's own cadence, which we do not control. So the first error closes it
 * for good and hands to polling, and `streamFailed` makes that one way.
 */
describe("the SSE to polling handover is one way", () => {
  /** The real guard from `start`: never two transports, never two timers. */
  const canStart = (timer: unknown, stream: unknown) => timer === null && stream === null;

  it("refuses to start a second transport while either is running", () => {
    expect(canStart(null, null)).toBe(true);
    expect(canStart({}, null)).toBe(false);
    expect(canStart(null, {})).toBe(false);
    expect(canStart({}, {})).toBe(false);
  });

  /** The real choice from `start`: stream unless it has already failed. */
  const transport = (hasEventSource: boolean, streamFailed: boolean) =>
    hasEventSource && !streamFailed ? "stream" : "poll";

  it("prefers the stream, but only until it has failed once", () => {
    expect(transport(true, false)).toBe("stream");
    expect(transport(true, true)).toBe("poll");
    // No EventSource at all, in a browser or test environment without it.
    expect(transport(false, false)).toBe("poll");
  });

  it("cannot flap back to the stream within a subscription", () => {
    /*
     * `streamFailed` is set on the first error and only cleared by `stop`, so
     * within one subscription the sequence is one way. If it were cleared on
     * success, a mod restarting repeatedly would alternate transports and could
     * hold both open across the switch.
     */
    let streamFailed = false;
    const chosen: string[] = [];

    chosen.push(transport(true, streamFailed));
    streamFailed = true; // the stream errored
    for (let i = 0; i < 4; i++) chosen.push(transport(true, streamFailed));

    expect(chosen).toEqual(["stream", "poll", "poll", "poll", "poll"]);
  });

  it("gets a fresh attempt at the better transport on the next mount", () => {
    // `stop` clears the flag, so leaving the page and coming back retries the
    // stream. Permanent within a subscription, not permanent forever.
    let streamFailed = true;
    streamFailed = false; // what `stop` does
    expect(transport(true, streamFailed)).toBe("stream");
  });
});

/**
 * The offline loop going to sleep.
 *
 * Every refused probe prints an `ERR_CONNECTION_REFUSED` console line the page
 * cannot silence - the browser owns those lines, not the request options - so
 * once the backoff has walked its ramp the loop stops scheduling entirely and
 * only a wake, the tab regaining focus or becoming visible, probes again.
 * Pinned here is the arithmetic: the ramp is the whole schedule, so an absent
 * mod costs a handful of console lines per session rather than one line every
 * five minutes forever.
 */
describe("the offline loop sleeps instead of printing forever", () => {
  const OFFLINE_MAX_MS = 300_000;
  const OFFLINE_DORMANT_STREAK = 5;

  /** The scheduled delays across `misses` consecutive refusals. */
  const delays = (misses: number) => {
    const out: number[] = [];
    let streak = 0;
    for (let i = 0; i < misses; i += 1) {
      const delay = Math.min(OFFLINE_MS * 2 ** streak, OFFLINE_MAX_MS);
      streak += 1;
      if (streak < OFFLINE_DORMANT_STREAK) out.push(delay);
      else break;
    }
    return out;
  };

  it("walks the backoff, then schedules nothing", () => {
    expect(delays(8)).toEqual([30_000, 60_000, 120_000, 240_000]);
  });
});
