/**
 * Generates deterministic UUIDv7 IDs for seed crawl rows.
 *
 * Crawl rows are stored in monthly RANGE partitions keyed by UUIDv7 id.
 * Hardcoding a past month's timestamp breaks when that partition expires
 * (30-day retention). Using a recent UTC day's start as the timestamp keeps
 * the UUID in an active partition and inside web search's 30-day window. The
 * rollover guard keeps seed setup before UTC midnight and tests after UTC
 * midnight on the same IDs.
 *
 * Both the seed and any tests that reference crawl IDs import from here
 * so the IDs stay in sync without importing DB modules into test workers.
 */
const SEED_CRAWL_ROLLOVER_GUARD_MS = 12 * 60 * 60 * 1000
export const PLAYWRIGHT_SEED_CRAWL_ANCHOR_ENV = 'PLAYWRIGHT_SEED_CRAWL_ANCHOR'

export function pinPlaywrightSeedCrawlAnchor(now = new Date()): void {
  process.env[PLAYWRIGHT_SEED_CRAWL_ANCHOR_ENV] = now.toISOString()
}

export function recentSeedCrawlId(suffix: number, now = getSeedCrawlAnchor()): string {
  const anchor = new Date(now.getTime() - SEED_CRAWL_ROLLOVER_GUARD_MS)
  const dayStartMs = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate())
  const hex = dayStartMs.toString(16).padStart(12, '0')
  const timeLow = hex.slice(0, 8)
  const timeMid = hex.slice(8, 12)
  const suffixHex = suffix.toString(16).padStart(12, '0')
  return `${timeLow}-${timeMid}-7000-8000-${suffixHex}`
}

function getSeedCrawlAnchor(): Date {
  const pinnedAnchor = process.env[PLAYWRIGHT_SEED_CRAWL_ANCHOR_ENV]
  return pinnedAnchor === undefined ? new Date() : new Date(pinnedAnchor)
}
