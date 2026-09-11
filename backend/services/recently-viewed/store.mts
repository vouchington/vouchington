import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { loadScript, registerScript } from '@data-stores/valkey/scripts'
import type { RecentlyViewedEntityType } from './types.mts'

const NAMESPACE = 'recently-viewed'
const TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
export const RECENTLY_VIEWED_ZSET_LIMIT = 1000
const upsertRecentlyViewedScript = registerScript(loadScript('upsert.lua', import.meta.url))
const searchRecentlyViewedScript = registerScript(loadScript('search.lua', import.meta.url))
const searchRecentlyViewedPageScript = registerScript(
  loadScript('search-page.lua', import.meta.url),
)

export type RecentlyViewedPageRow = { id: string; score: number }

function getSessionKey(entityType: RecentlyViewedEntityType, sessionId: string): string {
  return `${NAMESPACE}:session:${entityType}:${sessionId}`
}

function getUserKey(entityType: RecentlyViewedEntityType, userId: string): string {
  return `${NAMESPACE}:user:${entityType}:${userId}`
}

/**
 * Add an entity to the recently-viewed ZSET for the given session (and optionally user).
 * Score is the current epoch milliseconds so higher score = more recent.
 * When sessionId is null or empty string, only the user ZSET is updated.
 */
export async function upsertRecentlyViewed(
  entityType: RecentlyViewedEntityType,
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
    args: [String(TTL_SECONDS), String(RECENTLY_VIEWED_ZSET_LIMIT), entityId],
  })
}

/**
 * Retrieve the most recently viewed entity IDs for the given session / user.
 * When userId is provided, merges session and user ZSETs and deduplicates by
 * keeping the highest score (most recent view) per entity.
 * When sessionId is null or empty string, queries only the user ZSET.
 */
export async function searchRecentlyViewed(
  entityType: RecentlyViewedEntityType,
  sessionId: string | null,
  userId: string | null,
  limit: number = RECENTLY_VIEWED_ZSET_LIMIT,
): Promise<string[]> {
  const effectiveLimit = Math.min(limit, RECENTLY_VIEWED_ZSET_LIMIT)

  if (!userId && !sessionId) return []

  const keys: string[] = []
  if (!userId) {
    keys.push(getSessionKey(entityType, sessionId!))
  } else if (!sessionId) {
    keys.push(getUserKey(entityType, userId))
  } else {
    keys.push(getSessionKey(entityType, sessionId), getUserKey(entityType, userId))
  }

  const results = await cacheValkeyClient.invokeScript(searchRecentlyViewedScript, {
    keys,
    args: [String(effectiveLimit), String(RECENTLY_VIEWED_ZSET_LIMIT)],
  })
  return Array.isArray(results) ? results.map(String) : []
}

export async function searchRecentlyViewedPage(
  entityType: RecentlyViewedEntityType,
  userId: string,
  limit: number,
  after?: RecentlyViewedPageRow,
): Promise<RecentlyViewedPageRow[]> {
  const results = await cacheValkeyClient.invokeScript(searchRecentlyViewedPageScript, {
    keys: [getUserKey(entityType, userId)],
    args: [
      String(Math.min(limit, RECENTLY_VIEWED_ZSET_LIMIT)),
      String(RECENTLY_VIEWED_ZSET_LIMIT),
      after ? String(after.score) : '',
      after?.id ?? '',
    ],
  })
  if (!Array.isArray(results)) return []

  const rows: RecentlyViewedPageRow[] = []
  for (let index = 0; index < results.length; index += 2) {
    rows.push({ id: String(results[index]), score: Number(results[index + 1]) })
  }
  return rows
}

/**
 * Return the exact count of distinct entities a user has viewed.
 * Uses ZCARD rather than fetching all IDs so the result is accurate
 * even when the set has been trimmed to RECENTLY_VIEWED_ZSET_LIMIT.
 */
export async function countRecentlyViewed(
  entityType: RecentlyViewedEntityType,
  userId: string,
): Promise<number> {
  const userKey = getUserKey(entityType, userId)
  return Number(await cacheValkeyClient.zcard(userKey))
}
