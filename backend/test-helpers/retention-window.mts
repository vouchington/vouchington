import { randomInt } from 'node:crypto'

const DAY_MS = 24 * 60 * 60 * 1_000
const FAR_FUTURE_START_MS = Date.UTC(2300, 0, 1)

/**
 * A private far-future retention window. Retention sweeps take a lower date bound, so rows aged
 * inside this window can only be the caller's even when the shared database holds other sweeps'
 * fixtures: scope by owned rows, never by handing the production cleanup an id list.
 */
export function createIsolatedRetentionWindow(spanDays = 150) {
  const now = new Date(FAR_FUTURE_START_MS + randomInt(0, 2 ** 40))
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY_MS)
  return { now, at, lowerBoundDate: at(spanDays) }
}
