/**
 * One request gate, used by every surface that talks to somebody else's server.
 *
 * This exists because the project has already paid twice for parallel
 * implementations of the same idea drifting apart. There is one dedupe
 * mechanism here and every caller reuses it rather than growing its own.
 *
 * THE TWO RULES, AND WHY THEY ARE DIFFERENT THINGS
 * -----------------------------------------------
 *   attach   A call arriving while a request is in the air gets THAT request.
 *            It does not issue a second one and it is not dropped: it resolves
 *            when the real request resolves, so every caller sees the outcome
 *            of the work that actually ran. This is structural rather than
 *            timing based. There is one promise, therefore one request, and no
 *            click rate can produce a second.
 *
 *   floor    A call arriving after the last one finished, but sooner than
 *            `gapMs` since the last ATTEMPT STARTED, is refused without
 *            touching the network.
 *
 * A `disabled` prop is neither of these. It is React state, so it lags a tick,
 * and two clicks in the same tick both pass it. The guard has to live at the
 * transport or it is not a guard.
 *
 * REFUSALS NEVER PUSH THE WINDOW FORWARD
 * --------------------------------------
 * Only an attempt that actually starts moves `lastAttempt`. If a refusal moved
 * it, somebody clicking once a second would hold the gate shut forever and
 * never get their request at all, turning a guard into a lockout. That is the
 * same principle the bounded `forget()` bypass in `profileStats.ts` runs on.
 */

export interface Gate<T> {
  /**
   * Run the task, or attach to the one already running, or refuse.
   *
   * Resolves to `undefined` only when the floor refused it. A caller that needs
   * to tell "refused" from "ran and returned nothing" should have its task
   * return something.
   */
  run: () => Promise<T | undefined>;
  /** When the floor next opens. Published so a button can say so. */
  cooldownUntil: () => number;
  /** True while a request is in the air. */
  busy: () => boolean;
}

/**
 * Build a gate around one task.
 *
 * The task is a thunk so callers can close over whatever arguments they need.
 * When several callers with different arguments share a gate, an attaching
 * caller receives the in-flight caller's result; that is correct wherever the
 * task is a fetch of the same shared resource, and worth a comment wherever it
 * is not.
 */
export const makeGate = <T>(task: () => Promise<T>, gapMs: number): Gate<T> => {
  let inFlight: Promise<T> | null = null;
  let lastAttempt = 0;

  return {
    run: async (): Promise<T | undefined> => {
      // Attach before the floor. An attaching caller is not making a new
      // attempt and must not be turned away by a gap its own in-flight request
      // opened.
      if (inFlight) return inFlight;
      if (Date.now() - lastAttempt < gapMs) return undefined;

      // Set before the first await, so a call in the same tick already sees the
      // floor closed even if the task yields immediately.
      lastAttempt = Date.now();
      inFlight = task();
      try {
        return await inFlight;
      } finally {
        // Cleared even when the task throws. A leaked promise here would wedge
        // the gate shut forever, since every later call would attach to a
        // request that finished long ago.
        inFlight = null;
      }
    },
    cooldownUntil: () => lastAttempt + gapMs,
    busy: () => inFlight !== null,
  };
};

/**
 * One floored gate per identity.
 *
 * A repeated request for the same profile is the same question and keeps the
 * normal attach/cooldown protection. A different profile is a different
 * question and must not inherit the previous profile's cooldown, otherwise a
 * quick profile switch can be refused with nobody left to retry it.
 */
export interface KeyedFloorGate<T> {
  run: (key: string) => Promise<T | undefined>;
  cooldownUntil: (key: string) => number;
  busy: (key: string) => boolean;
  /** Forget a completed key's floor. An in-flight request is never detached. */
  reset: (key: string) => void;
}

export const makeKeyedFloorGate = <T>(
  task: (key: string) => Promise<T>,
  gapMs: number,
): KeyedFloorGate<T> => {
  const gates = new Map<string, Gate<T>>();
  const gateFor = (key: string): Gate<T> => {
    const existing = gates.get(key);
    if (existing) return existing;
    const created = makeGate(() => task(key), gapMs);
    gates.set(key, created);
    return created;
  };

  return {
    run: (key) => gateFor(key).run(),
    cooldownUntil: (key) => gateFor(key).cooldownUntil(),
    busy: (key) => gateFor(key).busy(),
    reset: (key) => {
      const existing = gates.get(key);
      if (existing && !existing.busy()) gates.delete(key);
    },
  };
};

/**
 * A gate for a task that takes an argument and should only dedupe against the
 * SAME argument.
 *
 * The case this exists for is a failing lookup. Somebody who mistypes a name
 * gets a fast, legitimate failure, and a success-shaped guard never trips
 * because nothing succeeded. Hammering the same wrong name is pointless and
 * should cost nothing, but correcting the typo is a different question and must
 * be answered immediately: a ten second lockout on fixing a typo is hostile.
 *
 * So the key is the argument. The same key inside the window replays the
 * remembered answer with no request at all; a different key goes straight
 * through. In-flight attach is still per key, so a double click on one name is
 * one request.
 */
export interface KeyedGate<T> {
  run: (key: string, task: () => Promise<T>) => Promise<T>;
}

export const makeKeyedGate = <T>(rememberMs: number): KeyedGate<T> => {
  const inFlight = new Map<string, Promise<T>>();
  let lastKey: string | null = null;
  let lastAt = 0;
  let lastResult: T | null = null;

  return {
    run: async (key: string, task: () => Promise<T>): Promise<T> => {
      const running = inFlight.get(key);
      if (running) return running;

      // The remembered answer, replayed rather than re-fetched. Only for the
      // identical key, and only inside the window.
      if (lastResult !== null && lastKey === key && Date.now() - lastAt < rememberMs) return lastResult;

      const p = task();
      inFlight.set(key, p);
      try {
        const value = await p;
        lastKey = key;
        lastAt = Date.now();
        lastResult = value;
        return value;
      } finally {
        inFlight.delete(key);
      }
    },
  };
};
