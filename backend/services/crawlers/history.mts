import type { Crawler } from './types.mts'

export function crawlerHistorySnapshot(crawler: Crawler) {
  return {
    hostname_id: crawler.hostname_id,
    referral_program_id: crawler.referral_program_id,
    description: crawler.description,
    crawler_type: crawler.crawler_type,
    priority: crawler.priority,
    css_selectors_to_remove: crawler.css_selectors_to_remove,
    link_text_content_to_remove: crawler.link_text_content_to_remove,
    link_hrefs_to_remove: crawler.link_hrefs_to_remove,
    content_selectors: crawler.content_selectors,
    deleted_at: crawler.deleted_at,
  }
}
