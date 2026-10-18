import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const crawlerRefreshWorkConfig = new DynamicConfig({
  key: 'crawler-refresh-work-config',
  fieldTypes: { retry_crawl_url_count: 'number' },
  defaultFields: { retry_crawl_url_count: 3 },
})

/** Alternative URLs considered for one failed crawl or refreshed hostname. */
export function getRetryCrawlUrlCount(): number {
  return getBoundedPositiveIntegerField(crawlerRefreshWorkConfig, 'retry_crawl_url_count', {
    defaultValue: 3,
    maxValue: 20,
  })
}
