import { isUUID } from '@modules/utils'
import assert from 'http-assert'
import type { RecentlyViewedEntityType } from './types.mts'
import { upsertRecentlyViewed } from './store.mts'
import {
  recordRecentlyViewedTopic,
  recordRecentlyViewedPost,
  recordRecentlyViewedRssFeed,
  recordRecentlyViewedRssFeedItem,
  recordRecentlyViewedUser,
  recordLandingPageVisit,
} from '@services/analytics'

export const addRecentlyViewed = async (
  sessionId: string,
  userId: string | null,
  entityType: RecentlyViewedEntityType,
  entityId: string,
) => {
  assert(isUUID(sessionId), 400, 'Invalid session ID')
  assert(!userId || isUUID(userId), 400, 'Invalid user ID')
  assert(isUUID(entityId), 400, 'Invalid entity UUID')

  if (entityType === 'user' && userId && entityId === userId) return

  await upsertRecentlyViewed(entityType, entityId, sessionId, userId)

  // Emit analytics event fire-and-forget
  const opts = { pageId: entityId, sessionId, userId: userId ?? undefined }
  switch (entityType) {
    case 'topic':
      recordRecentlyViewedTopic(opts)
      break
    case 'post':
      recordRecentlyViewedPost(opts)
      break
    case 'rss_feed_item':
      recordRecentlyViewedRssFeedItem(opts)
      break
    case 'rss_feed':
      recordRecentlyViewedRssFeed(opts)
      break
    case 'user':
      recordRecentlyViewedUser(opts)
      break
    case 'landing_page':
      recordLandingPageVisit({ pageId: entityId, sessionId, userId: userId ?? undefined })
      break
  }
}
