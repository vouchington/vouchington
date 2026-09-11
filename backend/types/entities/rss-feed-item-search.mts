import type { PaginatedResult } from '../pagination.mts'

export type RssFeedItemsResult = PaginatedResult<'rss_feed_item'> & {
  published_at: Date
  story_id: string | null
}
