/**
 * lock.mjs — one trade at a time, server-wide.
 *
 * `decide()` reads `spent_today` and the fill that moves it is journalled
 * several awaits later. Anything overlapping inside that window reads the same
 * pre-fill number, clears the same daily cap and signs anyway. Measured before
 * this existed: four concurrent POST /tick against a $50/day cap produced four
 * real fills and not one rejection.
 *
 * The lock is a queue rather than a refusal on purpose. Refusing the second
 * caller would mean an operator's YES could be thrown away because the
 * automation happened to be mid-swap, and the pending proposal it belonged to
 * is already cleared by then. Waiting costs a few seconds; losing a confirm
 * costs the operator's trust in the button.
 *
 * Waiting alone is not the fix, though — a queued execution that still believes
 * the budget it read before it waited would spend money that is gone. Callers
 * re-check inside the lock; `dayBudget()` is what they re-check with.
 */

let tail = Promise.resolve();

/** Run `fn` with no other trade in flight. Releases even if `fn` throws. */
export function withTradeLock(fn) {
  const run = tail.then(fn, fn);           // run regardless of how the last one ended
  tail = run.then(() => {}, () => {});     // ...and never inherit its rejection
  return run;
}

/**
 * What is still spendable today, read fresh.
 *
 * Mirrors decide.mjs step 4 and 6 exactly: the day's room is
 * `max_day_usd - spent_today`, and a trade is clamped to it. Read *inside* the
 * lock, so it reflects every fill that has already been journalled.
 */
export async function dayBudget(mem, { NO_MEMORY_LIMITS }) {
  const brief = await mem.recallBrief().catch(() => null);
  const limits = brief?.limits || NO_MEMORY_LIMITS;
  const spent = Number.isFinite(brief?.spent_today) ? brief.spent_today : 0;
  const max = limits.max_day_usd ?? NO_MEMORY_LIMITS.max_day_usd;
  return { spent, max, left: max - spent };
}
