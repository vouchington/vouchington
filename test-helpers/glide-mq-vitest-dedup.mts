import type { TestQueue } from 'glide-mq/testing'

export type DeduplicationOptions = {
  id: string
  mode?: 'simple' | 'throttle' | 'debounce'
  ttl?: number
}
// `jobId: null` marks a reservation: the check passed and a matching add is in flight, but
// `queue.add()` hasn't resolved with a real job id yet. See `reserveDedup`.
// `hadDelay` records whether the job this entry represents was enqueued with a nonzero `delay` —
// see `shouldSkipDedup`'s throttle branch for why that matters.
type DedupEntry = { jobId: string | null; timestamp: number; hadDelay: boolean }
// Map<queueName, Map<dedupId, DedupEntry>>. Fork-global and never auto-reset, matching production:
// Redis dedup hash entries aren't reset per-request either. Tests that need isolation already
// obliterate their queue in beforeEach/afterEach (obliterateTestQueue in glide-mq-vitest-obliterate.mts
// clears this too), or use a randomized dedup id, per the existing conventions documented in the fix's
// plan.
const dedupEntriesByQueue = new Map<string, Map<string, DedupEntry>>()

function getDedupEntries(queueName: string): Map<string, DedupEntry> {
  let entries = dedupEntriesByQueue.get(queueName)
  if (!entries) {
    entries = new Map()
    dedupEntriesByQueue.set(queueName, entries)
  }
  return entries
}

function isReferencedJobNonTerminal(queue: TestQueue<any, any>, jobId: string | null): boolean {
  // A pending reservation (no job id yet) stands in for a non-terminal job: the add it reserved
  // for hasn't resolved yet, so a concurrent caller must still see it as in flight.
  if (jobId === null) return true
  const record = queue.jobs.get(jobId)
  return record !== undefined && record.state !== 'completed' && record.state !== 'failed'
}

/**
 * Mirrors production's `glidemq_dedup` Lua function
 * (node_modules/glide-mq/dist/functions/glidemq.lua): decide whether an enqueue carrying
 * `deduplication` should be skipped.
 *
 * `simple` and `debounce` share this state-gating check: skip while the job referenced by the
 * stored dedup entry is non-terminal. Production's `debounce` additionally cancels and replaces a
 * referenced job that is `'delayed'`/`'prioritized'`, but that branch is unreachable here — TestQueue
 * never produces those states (delay is accepted but ignored, and there is no priority-based
 * scheduling in testing mode; see backend/test-helpers/examples.glide-mq-testing.md). So `debounce`
 * degenerates to `simple`'s pure state-gating.
 *
 * `throttle` ignores job state entirely and only compares elapsed time against `ttl` — this is
 * production-safe only because `delay >= ttl` is guaranteed at every real call site, so the
 * referenced job can't reach a terminal state before the window elapses anyway. `TestQueue.add()`
 * never honors `delay` (see above), so a throttle-deduped job that specified one can go terminal in
 * milliseconds, well inside the window. When that happens, ignoring job state stops being a safe
 * approximation of production and starts silently dropping a recompute the enqueue represented (see
 * the elections-vote-stats regression this fixes). So: skip purely on elapsed time when the
 * referenced job carried no `delay` (matches every throttle call site without one, e.g. backfill
 * singletons); fall back to `simple`'s state-gating when it did (matches elections, the only
 * throttle+delay call site in the codebase) — a terminal job with a delay it never got to honor is
 * no longer "redundant with a job that hasn't run yet," so a fresh enqueue needs its own job.
 *
 * A skip never updates the recorded entry. A pass must be followed by `reserveDedup` *before* the
 * caller does anything async: production's check-and-set is one atomic Redis call, so a concurrent
 * caller can never observe the gap between "decided not to skip" and "recorded". `queue.add()` is
 * still a microtask away from resolving with a real job id, so without a synchronous reservation two
 * callers racing on the same dedup id (e.g. `Promise.all`) would both read no entry and both proceed.
 */
export function shouldSkipDedup(
  queue: TestQueue<any, any>,
  deduplication: DeduplicationOptions | undefined,
  timestamp: number,
): boolean {
  if (!deduplication) return false
  const existing = getDedupEntries(queue.name).get(deduplication.id)
  if (!existing) return false
  if ((deduplication.mode ?? 'simple') === 'throttle') {
    const ttl = deduplication.ttl ?? 0
    if (!(ttl > 0 && timestamp - existing.timestamp < ttl)) return false
    return existing.hadDelay ? isReferencedJobNonTerminal(queue, existing.jobId) : true
  }
  return isReferencedJobNonTerminal(queue, existing.jobId)
}

/**
 * Reserve a dedup id synchronously, right after `shouldSkipDedup` returns false and before the
 * caller starts (or awaits) the matching `queue.add()`. Closes the race a real Redis instance
 * doesn't have: a concurrent `shouldSkipDedup` call must see this entry immediately, not after the
 * add resolves.
 */
export function reserveDedup(
  queue: TestQueue<any, any>,
  deduplication: DeduplicationOptions | undefined,
  timestamp: number,
  hadDelay: boolean,
): void {
  if (!deduplication) return
  getDedupEntries(queue.name).set(deduplication.id, { jobId: null, timestamp, hadDelay })
}

/** Finalize a reservation once `queue.add()` resolves with the real job id. */
export function recordDedup(
  queue: TestQueue<any, any>,
  deduplication: DeduplicationOptions | undefined,
  jobId: string,
  timestamp: number,
  hadDelay: boolean,
): void {
  if (!deduplication) return
  getDedupEntries(queue.name).set(deduplication.id, { jobId, timestamp, hadDelay })
}

/** Clear a queue's shim-owned dedup entries, used by obliterateTestQueue. */
export function clearDedupEntries(queueName: string): void {
  dedupEntriesByQueue.delete(queueName)
}
