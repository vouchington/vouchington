import { recomputePostHackerNewsFlags } from '@services/posts/hacker-news-flags'
import { recomputeRssFeedItemHackerNewsFlags } from '@services/rss-feed-items/hacker-news-flags'

/** Domain writers own locks and updates; orchestration never writes another domain's tables. */
export async function recomputeHackerNewsFlags(ids: {
  postIds?: readonly string[]
  rssFeedItemIds?: readonly string[]
}): Promise<void> {
  if (ids.postIds?.length) await recomputePostHackerNewsFlags(ids.postIds)
  if (ids.rssFeedItemIds?.length) await recomputeRssFeedItemHackerNewsFlags(ids.rssFeedItemIds)
}
