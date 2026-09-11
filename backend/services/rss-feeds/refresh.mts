import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import { currentUserCanRefreshRssFeed } from './authorization.mts'
import { enqueueBulkFetchRssFeeds } from '@queues/rss-feeds/enqueues'

export async function refreshRssFeedAsCurrentUser(
  currentUser: PrivateUser,
  rssFeedId: string,
  force: boolean = false,
) {
  assert(currentUserCanRefreshRssFeed(currentUser), 403, 'Forbidden')
  await enqueueBulkFetchRssFeeds([rssFeedId], {
    ttl: force ? 0 : 60_000,
    skipDeduplication: force,
  })
  return { rss_feed_id: rssFeedId, force }
}
