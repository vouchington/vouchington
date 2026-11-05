import { recomputePostHackerNewsFlags } from '@services/posts/hacker-news-flags'
import { recomputeRssFeedItemHackerNewsFlags } from '@services/rss-feed-items/hacker-news-flags'
import type { QueryOptions } from '@data-stores/psql/types'

/** Domain writers own locks and updates; orchestration never writes another domain's tables. */
export async function recomputeHackerNewsFlags(
  ids: { postIds?: readonly string[]; rssFeedItemIds?: readonly string[] },
  options: QueryOptions = {},
): Promise<void> {
  if (ids.postIds?.length) await recomputePostHackerNewsFlags(ids.postIds, options)
  if (ids.rssFeedItemIds?.length)
    await recomputeRssFeedItemHackerNewsFlags(ids.rssFeedItemIds, options)
}
