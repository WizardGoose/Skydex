import { describe, expect, it, vi } from "vitest";
import { makeGate, makeKeyedFloorGate, makeKeyedGate } from "../gate";

/**
 * The one request gate, tested directly.
 *
 * `refreshGate.test.ts` pins the SHAPE of the guard by reproducing it. This
 * file pins the real implementation every surface now shares, so the two cannot
 * drift: if this file and that one ever disagree, the reproduction is stale.
 *
 * Every claim here is a counting one. The only number a rate limit cares about
 * is how many times the network was touched.
 */

const GAP = 10_000;

/**
 * A task that counts its own calls and takes a known amount of time.
 *
 * `calls` is a function rather than a getter because a getter read through a
 * spread is evaluated once, at spread time, and silently freezes at zero.
 */
const counted = (ms = 20) => {
  let calls = 0;
  return {
    task: async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, ms));
      return calls;
    },
    calls: () => calls,
  };
};

describe("makeGate: N calls, 1 request", () => {
  it("collapses a burst in one tick into a single run", async () => {
    vi.useFakeTimers();
    try {
      const c = counted();
      const gate = makeGate(c.task, GAP);

      const calls = Array.from({ length: 20 }, () => gate.run());
      await vi.advanceTimersByTimeAsync(50);
      await Promise.all(calls);

      expect(c.calls()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives every attached caller the real result", async () => {
    /*
     * The difference between attaching and dropping. A dropped caller resolves
     * immediately with nothing and carries on as though work had finished; an
     * attached one resolves when the work resolves, with what it returned.
     */
    vi.useFakeTimers();
    try {
      const c = counted(50);
      const gate = makeGate(c.task, GAP);

      const first = gate.run();
      const second = gate.run();
      const third = gate.run();

      await vi.advanceTimersByTimeAsync(60);
      expect(await first).toBe(1);
      expect(await second).toBe(1);
      expect(await third).toBe(1);
      expect(c.calls()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports busy only while the work is in the air", async () => {
    vi.useFakeTimers();
    try {
      const c = counted(50);
      const gate = makeGate(c.task, GAP);
      expect(gate.busy()).toBe(false);

      const p = gate.run();
      expect(gate.busy()).toBe(true);

      await vi.advanceTimersByTimeAsync(60);
      await p;
      expect(gate.busy()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("makeGate: the floor", () => {
  const settle = async (gate: ReturnType<typeof makeGate<number>>) => {
    const p = gate.run();
    await vi.advanceTimersByTimeAsync(50);
    return p;
  };

  it("refuses inside the gap and returns undefined rather than running", async () => {
    vi.useFakeTimers();
    try {
      const c = counted();
      const gate = makeGate(c.task, GAP);

      expect(await settle(gate)).toBe(1);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await settle(gate)).toBeUndefined();
      expect(c.calls()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens again once the gap has passed", async () => {
    vi.useFakeTimers();
    try {
      const c = counted();
      const gate = makeGate(c.task, GAP);

      await settle(gate);
      await vi.advanceTimersByTimeAsync(GAP);
      await settle(gate);

      expect(c.calls()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let refusals push the window forward", async () => {
    /*
     * If a refusal moved the window, somebody clicking once a second would hold
     * the gate shut forever and never get their request at all. A guard that
     * becomes a lockout under impatience is not a guard.
     */
    vi.useFakeTimers();
    try {
      const c = counted();
      const gate = makeGate(c.task, GAP);

      await settle(gate);
      for (let i = 0; i < 8; i++) {
        await vi.advanceTimersByTimeAsync(900);
        await settle(gate);
      }
      expect(c.calls()).toBe(1);

      await vi.advanceTimersByTimeAsync(GAP);
      await settle(gate);
      expect(c.calls()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the in-flight slot even when the task throws", async () => {
    /*
     * A leaked promise would wedge the gate shut forever, because every later
     * call would attach to work that finished long ago. Failure is the case
     * that leaks if the cleanup is in the wrong place.
     */
    vi.useFakeTimers();
    try {
      let calls = 0;
      const gate = makeGate(async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 10));
        throw new Error("boom");
      }, GAP);

      // The assertion is attached BEFORE the clock advances. Attaching it after
      // would leave the rejection unobserved for a turn, which Node reports as
      // an unhandled rejection and vitest fails the run on.
      const p = gate.run();
      const rejected = expect(p).rejects.toThrow("boom");
      await vi.advanceTimersByTimeAsync(20);
      await rejected;

      expect(gate.busy()).toBe(false);

      // Still floored, because the failed attempt was a real attempt.
      const second = gate.run();
      await vi.advanceTimersByTimeAsync(20);
      expect(await second).toBeUndefined();
      expect(calls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("publishes a cooldown that matches the floor", () => {
    const gate = makeGate(async () => 1, GAP);
    // Nothing has run, so the window is long past and the button is live.
    expect(gate.cooldownUntil()).toBeLessThanOrEqual(Date.now());
  });
});

describe("makeKeyedFloorGate", () => {
  it("keeps duplicate protection for the same identity", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const gate = makeKeyedFloorGate(async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return calls;
      }, GAP);

      const first = gate.run("profile-a");
      const attached = gate.run("profile-a");
      await vi.advanceTimersByTimeAsync(30);
      expect(await first).toBe(1);
      expect(await attached).toBe(1);
      expect(await gate.run("profile-a")).toBeUndefined();
      expect(calls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not leave a new profile behind the previous profile's floor", async () => {
    let calls = 0;
    const gate = makeKeyedFloorGate(async (profile) => {
      calls += 1;
      return profile;
    }, GAP);

    expect(await gate.run("profile-a")).toBe("profile-a");
    expect(await gate.run("profile-b")).toBe("profile-b");
    expect(calls).toBe(2);
  });

  it("can forget a completed profile floor without detaching in-flight work", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const gate = makeKeyedFloorGate(async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return calls;
      }, GAP);

      const first = gate.run("profile-a");
      gate.reset("profile-a");
      expect(gate.busy("profile-a")).toBe(true);
      await vi.advanceTimersByTimeAsync(30);
      expect(await first).toBe(1);

      gate.reset("profile-a");
      const second = gate.run("profile-a");
      await vi.advanceTimersByTimeAsync(30);
      expect(await second).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * The keyed gate, for lookups that fail fast.
 *
 * A mistyped name fails legitimately and quickly, so nothing success-shaped
 * ever trips. Repeating the same wrong name must cost nothing; correcting it
 * must be answered at once.
 */
describe("makeKeyedGate", () => {
  it("replays the remembered answer for the same key", async () => {
    let calls = 0;
    const gate = makeKeyedGate<string>(30_000);
    const task = async () => {
      calls += 1;
      return "not found";
    };

    expect(await gate.run("typo", task)).toBe("not found");
    expect(await gate.run("typo", task)).toBe("not found");
    expect(await gate.run("typo", task)).toBe("not found");

    // Three attempts at the same wrong name, one request.
    expect(calls).toBe(1);
  });

  it("lets a corrected name through immediately", async () => {
    /*
     * The reason this is keyed rather than floored. A ten second wait to fix a
     * typo would be hostile, and the corrected name is a different question
     * that the remembered answer cannot speak to.
     */
    let calls = 0;
    const gate = makeKeyedGate<string>(30_000);
    const task = async () => {
      calls += 1;
      return "answer";
    };

    await gate.run("wrongname", task);
    await gate.run("rightname", task);

    expect(calls).toBe(2);
  });

  it("collapses a burst on one key into a single request", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const gate = makeKeyedGate<string>(30_000);
      const task = async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 30));
        return "ok";
      };

      const burst = Array.from({ length: 10 }, () => gate.run("samename", task));
      await vi.advanceTimersByTimeAsync(50);
      await Promise.all(burst);

      expect(calls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps different keys in flight independently", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const gate = makeKeyedGate<string>(30_000);
      const task = async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 30));
        return "ok";
      };

      const both = [gate.run("one", task), gate.run("two", task)];
      await vi.advanceTimersByTimeAsync(50);
      await Promise.all(both);

      // Two genuine questions, two requests. Deduping across keys would be a
      // bug, not a saving.
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks again once the memory has expired", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const gate = makeKeyedGate<string>(30_000);
      const task = async () => {
        calls += 1;
        return "ok";
      };

      await gate.run("name", task);
      await vi.advanceTimersByTimeAsync(30_001);
      await gate.run("name", task);

      // An account registered mid session is still findable.
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
