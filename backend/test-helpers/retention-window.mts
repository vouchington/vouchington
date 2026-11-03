import { randomInt } from 'node:crypto'

const DAY_MS = 24 * 60 * 60 * 1_000
const FAR_FUTURE_START_MS = Date.UTC(2300, 0, 1)
// About 4,400 years of placements keep every row inside UUIDv7's 48-bit millisecond range.
const PLACEMENT_SPAN_MS = 2 ** 47

/**
 * A private far-future retention window. Retention sweeps take a lower date bound, so rows aged
 * inside this window can only be the caller's even when the shared database holds other sweeps'
 * fixtures: scope by owned rows, never by handing the production cleanup an id list. Committed
 * fixtures outlive their test in the dirty database, so placements are spread over thousands of
 * years; a narrow range let another fixture's aged rows land in this window and add a page.
 */
export function createIsolatedRetentionWindow(spanDays = 150) {
  const now = new Date(FAR_FUTURE_START_MS + randomInt(0, PLACEMENT_SPAN_MS))
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY_MS)
  return { now, at, lowerBoundDate: at(spanDays) }
}

/**
 * A one-millisecond sweep window for fixtures whose assertions count exact pages. The cutoff is
 * `aged + 1ms` and the lower bound is `aged`, so the production cleanup can only see rows stamped
 * with this fixture's own `aged` millisecond. Leftover committed rows from other fixtures would
 * need the same millisecond to be seen, unlike a 60-day window that any of them can land in.
 * Pass the same `retentionDays` to the cleanup so its cutoff matches.
 */
export function createExactRetentionWindow(retentionDays: number) {
  const aged = new Date(FAR_FUTURE_START_MS + randomInt(0, PLACEMENT_SPAN_MS))
  const now = new Date(aged.getTime() + retentionDays * DAY_MS + 1)
  return { aged, now, retentionDays, lowerBoundDate: aged }
}
