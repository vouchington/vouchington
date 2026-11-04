import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const CRAWLER_REFRESH_COOLDOWN_DEFAULT_MINUTES = 1440
export const CRAWLER_REFRESH_COOLDOWN_MAX_MINUTES = 10080

export const crawlerRefreshWorkConfig = new DynamicConfig({
  key: 'crawler-refresh-work-config',
  fieldTypes: { retry_crawl_url_count: 'number', recent_crawl_cooldown_minutes: 'number' },
  defaultFields: {
    retry_crawl_url_count: 3,
    recent_crawl_cooldown_minutes: CRAWLER_REFRESH_COOLDOWN_DEFAULT_MINUTES,
  },
})

/** Alternative URLs considered for one failed crawl or refreshed hostname. */
export function getRetryCrawlUrlCount(): number {
  return getBoundedPositiveIntegerField(crawlerRefreshWorkConfig, 'retry_crawl_url_count', {
    defaultValue: 3,
    maxValue: 20,
  })
}

/** Suppress retries of both pending and completed attempts during a bounded cooldown. */
export function getRecentCrawlCooldownMinutes(): number {
  return getBoundedPositiveIntegerField(crawlerRefreshWorkConfig, 'recent_crawl_cooldown_minutes', {
    defaultValue: CRAWLER_REFRESH_COOLDOWN_DEFAULT_MINUTES,
    maxValue: CRAWLER_REFRESH_COOLDOWN_MAX_MINUTES,
  })
}
