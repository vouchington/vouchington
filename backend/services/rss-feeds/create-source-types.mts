import type { FeedClassification } from './validate.mts'
import type CrawlerRss from '@services/crawler-rss'

export type CreateSourceResult = {
  status: 'created' | 'upvoted'
  rss_feed_id: string
  topic_id: string
  topic_slug: string
}

export type CreateSourceOptions = {
  importRowId?: string
  assertContributionLimit?: () => Promise<void>
  follow?: boolean
  hopCount?: number
  originalUrl?: string
  fetchAndClassifyFeedImpl?: (rssFeedUrl: string) => Promise<FeedClassification>
  crawlerRssOptions?: Parameters<typeof CrawlerRss>[1]
  /**
   * One deadline for the whole call: Web Risk, both protocol attempts and any redirect hops. A
   * caller that sets none (the single-feed follow path) is unaffected. Running out throws
   * `FeedBudgetExceededError`, which a queue job retries.
   */
  signal?: AbortSignal
}
