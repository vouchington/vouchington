// Debounce delay-reset window for reconcileFollow: collapses a rapid follow/unfollow toggle for
// the same pair into a single job that reads final state once the pair settles, instead of
// running reconcileBlueskyFollow once per intermediate click.
export const RECONCILE_FOLLOW_DEDUPLICATION_TTL_MS = 5_000
export const BACKFILL_DEDUPLICATION_TTL_MS = 3_600_000
