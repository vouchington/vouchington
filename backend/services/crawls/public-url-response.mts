import type { CrawlBasic } from './types.mts'

export type PaidSafeUrlCrawlHistory = Pick<
  CrawlBasic,
  '__entity_type' | 'id' | 'created_at' | 'response_status_code' | 'completed_at' | 'title' | 'lang'
>

export function toPaidSafeUrlCrawlHistory(crawl: CrawlBasic): PaidSafeUrlCrawlHistory {
  return {
    __entity_type: crawl.__entity_type,
    id: crawl.id,
    created_at: crawl.created_at,
    response_status_code: crawl.response_status_code,
    completed_at: crawl.completed_at,
    title: crawl.title,
    lang: crawl.lang,
  }
}
