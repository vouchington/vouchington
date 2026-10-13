const FIVE_MINUTES_MS = 5 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Refund-reconciliation curve: 5 minutes times 2^min(attemptCount - 1, 8), capped at 24 hours.
 * `attemptCount` is the value already stored on the claimed row.
 */
export function membershipPauseCollectionRetryDelayMs(attemptCount: number): number {
  const multiplier = 2 ** Math.min(Math.max(attemptCount - 1, 0), 8)
  return Math.min(FIVE_MINUTES_MS * multiplier, DAY_MS)
}
