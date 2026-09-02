/*
 * The production Hypixel key is one coordination atom, so its remaining
 * allowance is kept behind one Durable Object. Browser traffic never reaches
 * this object directly: the edge Worker asks it to reserve a unit only after a
 * fresh and stale cache miss, which bounds its normal workload to the key's
 * own upstream allowance rather than the site's request volume.
 */

const STATE_KEY = "quota";
const WINDOW_MS = 60_000;
const FALLBACK_LIMIT = 300;
const RESERVE_RATIO = 0.2;

const positiveInteger = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
};

const nextMinute = (now) => Math.floor(now / WINDOW_MS) * WINDOW_MS + WINDOW_MS;

const protectedUnits = (limit) => Math.max(1, Math.ceil(limit * RESERVE_RATIO));

const spendableRemaining = (limit, upstreamRemaining = limit) =>
  Math.max(0, Math.min(limit, upstreamRemaining) - protectedUnits(limit));

const freshState = (now, limit = FALLBACK_LIMIT) => ({
  limit,
  remaining: spendableRemaining(limit),
  resetAt: nextMinute(now),
  observed: false,
});

const validState = (value, now) => {
  if (!value || typeof value !== "object") return freshState(now);
  const limit = positiveInteger(value.limit);
  const remaining = Number(value.remaining);
  const resetAt = Number(value.resetAt);
  if (!limit || !Number.isFinite(remaining) || !Number.isFinite(resetAt)) return freshState(now);
  return {
    limit,
    remaining: Math.max(0, Math.floor(remaining)),
    resetAt,
    observed: value.observed === true,
  };
};

const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { "cache-control": "no-store" },
});

export class HypixelQuota {
  constructor(context) {
    this.context = context;
  }

  async fetch(request) {
    if (request.method !== "POST") return json({ ok: false }, 405);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false }, 400);
    }

    const now = Number.isFinite(body?.now) ? Math.floor(body.now) : Date.now();
    if (body?.action === "reserve") return this.reserve(now);
    if (body?.action === "observe") return this.observe(body, now);
    return json({ ok: false }, 404);
  }

  async reserve(now) {
    const result = await this.context.storage.transaction(async (transaction) => {
      let state = validState(await transaction.get(STATE_KEY), now);
      if (now >= state.resetAt) state = freshState(now, state.limit);

      const allowed = state.remaining > 0;
      if (allowed) state.remaining -= 1;
      await transaction.put(STATE_KEY, state);

      return {
        ok: true,
        allowed,
        remaining: state.remaining,
        limit: state.limit,
        retryAfter: allowed ? 0 : Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
      };
    });
    return json(result);
  }

  async observe(body, now) {
    const observedLimit = positiveInteger(body?.limit);
    const observedRemaining = Number(body?.remaining);
    const resetSeconds = positiveInteger(body?.resetSeconds);
    if (!observedLimit || !Number.isFinite(observedRemaining) || !resetSeconds) {
      return json({ ok: false }, 400);
    }

    const result = await this.context.storage.transaction(async (transaction) => {
      let state = validState(await transaction.get(STATE_KEY), now);
      const observedResetAt = now + resetSeconds * 1000;
      const observedSpendable = spendableRemaining(
        observedLimit,
        Math.max(0, Math.floor(observedRemaining)),
      );

      const newWindow = now >= state.resetAt
        || !state.observed
        || observedResetAt > state.resetAt + 5_000;

      state = {
        limit: observedLimit,
        remaining: newWindow
          ? observedSpendable
          : Math.min(state.remaining, observedSpendable),
        // Response order can invert under concurrency. Within one window, the
        // later reset is the conservative boundary and never reopens early.
        resetAt: newWindow ? observedResetAt : Math.max(state.resetAt, observedResetAt),
        observed: true,
      };

      await transaction.put(STATE_KEY, state);
      return { ok: true };
    });

    return json(result);
  }
}

export const hypixelQuotaPolicy = {
  fallbackLimit: FALLBACK_LIMIT,
  reserveRatio: RESERVE_RATIO,
};
