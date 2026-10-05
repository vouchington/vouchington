import { isUUID } from '@modules/utils'
import assert from 'http-assert'
import type { RecentlyViewedEntityType } from './types.mts'
import { searchRecentlyViewed } from './store.mts'

/**
 * @public Documented contract; production use is unconfirmed and this export may be
 * removed after intended-use review. Evidence: `docs/overview/architecture/services/recently-viewed/README.md`.
 */
export async function getRecentlyViewedIds(
  sessionId: string,
  userId: string | null,
  entityType: RecentlyViewedEntityType,
  limit?: number,
): Promise<string[]> {
  assert(isUUID(sessionId), 400, 'Invalid session ID')
  assert(!userId || isUUID(userId), 400, 'Invalid user ID')

  return searchRecentlyViewed(entityType, sessionId, userId, limit)
}
