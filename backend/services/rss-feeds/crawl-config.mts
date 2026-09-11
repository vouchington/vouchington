import { DynamicConfig } from '@data-stores/valkey'

export type RssFeedCrawlTier = 1 | 2 | 3 | 4 | 5
export type RssFeedCrawlNumberField =
  | 'tier1_sla_ms'
  | 'tier2_sla_ms'
  | 'tier3_sla_ms'
  | 'tier4_sla_ms'
  | 'tier5_sla_ms'
  | 'capacity_budget'

const DEFAULTS = {
  enabled: true,
  ignore_robots_txt: true,
  tier1_sla_ms: 5 * 60_000,
  tier2_sla_ms: 15 * 60_000,
  tier3_sla_ms: 60 * 60_000,
  tier4_sla_ms: 2 * 60 * 60_000,
  tier5_sla_ms: 24 * 60 * 60_000,
  capacity_budget: 100,
}

export const RSS_FEED_CRAWL_MIN_VALUES: Record<RssFeedCrawlNumberField, number> = {
  tier1_sla_ms: 1,
  tier2_sla_ms: 1,
  tier3_sla_ms: 1,
  tier4_sla_ms: 1,
  tier5_sla_ms: 1,
  capacity_budget: 1,
}

export const RSS_FEED_CRAWL_MAX_VALUES: Record<RssFeedCrawlNumberField, number> = {
  tier1_sla_ms: 7 * 24 * 60 * 60_000,
  tier2_sla_ms: 7 * 24 * 60 * 60_000,
  tier3_sla_ms: 7 * 24 * 60 * 60_000,
  tier4_sla_ms: 7 * 24 * 60 * 60_000,
  tier5_sla_ms: 7 * 24 * 60 * 60_000,
  capacity_budget: 10_000,
}

export const rssFeedCrawlConfig = new DynamicConfig({
  key: 'rss-feed-crawl-config',
  fieldTypes: {
    enabled: 'boolean',
    ignore_robots_txt: 'boolean',
    tier1_sla_ms: 'number',
    tier2_sla_ms: 'number',
    tier3_sla_ms: 'number',
    tier4_sla_ms: 'number',
    tier5_sla_ms: 'number',
    capacity_budget: 'number',
  },
  defaultFields: DEFAULTS,
})

export function isCrawlPrioritizationEnabled(): boolean {
  const value = rssFeedCrawlConfig.getFields().enabled
  return typeof value === 'boolean' ? value : DEFAULTS.enabled
}

export function isRobotsTxtIgnoredForFeeds(): boolean {
  const value = rssFeedCrawlConfig.getFields().ignore_robots_txt
  return typeof value === 'boolean' ? value : DEFAULTS.ignore_robots_txt
}

export function getTierSlaMs(tier: RssFeedCrawlTier): number {
  const fields = rssFeedCrawlConfig.getFields()
  const key = `tier${tier}_sla_ms` as RssFeedCrawlNumberField
  const v = fields[key]
  const defaultVal = DEFAULTS[key] as number
  return isValidNumberField(key, v) ? v : defaultVal
}

export function getCrawlCapacityBudget(): number {
  const v = rssFeedCrawlConfig.getFields().capacity_budget
  return isValidNumberField('capacity_budget', v) ? v : DEFAULTS.capacity_budget
}

function isValidNumberField(field: RssFeedCrawlNumberField, value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= RSS_FEED_CRAWL_MIN_VALUES[field] &&
    value <= RSS_FEED_CRAWL_MAX_VALUES[field]
  )
}
