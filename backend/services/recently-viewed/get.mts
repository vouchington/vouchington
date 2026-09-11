import { isUUID } from '@modules/utils'
import assert from 'http-assert'
import type { RecentlyViewedEntityType } from './types.mts'
import { searchRecentlyViewed } from './store.mts'

export async function getRecentlyViewedIds(
  sessionId: string,
  userId: string | null,
  entityType: RecentlyViewedEntityType,
  limit?: number,
): Promise<string[]> {
  assert(isUUID(sessionId), 400, 'Invalid session ID')
  assert(!userId || isUUID(userId), 400, 'Invalid user ID')

  return await searchRecentlyViewed(entityType, sessionId, userId, limit)
}
