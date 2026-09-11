import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { loadScript, registerScript } from '@data-stores/valkey/scripts'

// Raw-primitive duplicate of @services/recently-viewed's upsertRecentlyViewed (a thin
// ZADD/ZREMRANGEBYRANK/EXPIRE Lua-script wrapper with no other side effects). This package must
// never depend on a service that already devDeps this package for its own tests, so the key
// naming and script are duplicated here — keep in sync with backend/services/recently-viewed/store.mts
// and scripts/upsert.lua if either changes.

type TestRecentlyViewedEntityType =
  | 'topic'
  | 'post'
  | 'rss_feed_item'
  | 'rss_feed'
  | 'user'
  | 'landing_page'

const NAMESPACE = 'recently-viewed'
const TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
const MAX_LIMIT = 1000
const upsertRecentlyViewedScript = registerScript(
  loadScript('upsert-recently-viewed.lua', import.meta.url),
)

function getSessionKey(entityType: TestRecentlyViewedEntityType, sessionId: string): string {
  return `${NAMESPACE}:session:${entityType}:${sessionId}`
}

function getUserKey(entityType: TestRecentlyViewedEntityType, userId: string): string {
  return `${NAMESPACE}:user:${entityType}:${userId}`
}

export async function upsertTestRecentlyViewed(
  entityType: TestRecentlyViewedEntityType,
  entityId: string,
  sessionId: string | null,
  userId: string | null,
): Promise<void> {
  const keys: string[] = []

  if (sessionId) {
    keys.push(getSessionKey(entityType, sessionId))
  }

  if (userId) {
    keys.push(getUserKey(entityType, userId))
  }

  if (keys.length === 0) return

  await cacheValkeyClient.invokeScript(upsertRecentlyViewedScript, {
    keys,
    args: [String(TTL_SECONDS), String(MAX_LIMIT), entityId],
  })
}
