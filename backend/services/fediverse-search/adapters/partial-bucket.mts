import type { FediverseSearchBucketStatus } from '../types.mts'

// Combined (untyped) adapter branches run several sub-fetches for one bucket. A kind that
// wasn't attempted this round (skipped by type filter or exhausted budget) must not count
// toward the rollup — only kinds actually fetched can mark the bucket `partial`/`error`.
export type KindOutcome = { attempted: boolean; failed: boolean }

// `error` only when every attempted kind failed — a degraded sibling must not discard a
// healthy kind's results. `ok` when nothing failed (including when nothing was attempted).
export function rollUpBucketStatus(outcomes: KindOutcome[]): FediverseSearchBucketStatus {
  const attempted = outcomes.filter(outcome => outcome.attempted)
  if (attempted.length === 0) return 'ok'
  const failed = attempted.filter(outcome => outcome.failed)
  if (failed.length === attempted.length) return 'error'
  return failed.length > 0 ? 'partial' : 'ok'
}
