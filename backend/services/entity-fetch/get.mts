// IMPORTANT: Use direct file imports here, NOT barrel imports.
// This module is re-exported from @services/entity-fetch, which many service
// modules import from. Using barrel imports here creates circular dependencies
// (e.g. elections-votes/post/index.mts → vote-stats.mts → @services/entity-fetch → this file).
import { getPrivateUserByAny, getPublicUserByAny } from '@services/users/get'
import { getPublicUsersByAnyBatch } from '@services/users/get-public-batch'
import { getTopicByAny, getTopicByAnyWithRedirect } from '@services/topics/get'
import { getTopicsByAnyBatch } from '@services/topics/get-batch'
import { getTopicMetricsByAny } from '@services/topics/metrics'
import { getTopicMetricsByAnyBatch } from '@services/topics/metrics-batch'
import { getAgentModerationElectionById } from '@services/elections-votes/agent-moderation/get-election'
import { getAgentModerationElectionsByIdBatch } from '@services/elections-votes/agent-moderation/get-election-batch'
import { getPostByAny } from '@services/posts/get'
import { getPostsByAnyBatch } from '@services/posts/get-batch'
import { getPostMetricsByAny } from '@services/posts/metrics'
import { getPostMetricsByAnyBatch } from '@services/posts/metrics-batch'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { getRssFeedItemsByIdBatch } from '@services/rss-feed-items/get-batch'
import { getEntityRelationElectionsByIdBatch } from '@services/elections-votes/entity-relation/get-election-batch'
import { getTopicElectionsByIdBatch } from '@services/elections-votes/topic/get-election-batch'
import { getHostnameElectionById } from '@services/elections-votes/hostname/get-election'
import { getHostnameElectionsByIdBatch } from '@services/elections-votes/hostname/get-election-batch'
import { getPostElectionById } from '@services/elections-votes/post/get-election'
import { getPostElectionsByIdBatch } from '@services/elections-votes/post/get-election-batch'
import { getRssFeedItemElectionsByIdBatch } from '@services/elections-votes/rss-feed-item/get-election-batch'
import { getUrlByAny } from '@services/urls/get'
import { getUrlHostnameByAny } from '@services/urls-hostnames/get'
import { getUrlHostnamesByAnyBatch } from '@services/urls-hostnames/get-batch'
import { caches } from '@services/entity-cache/caches'
import { write } from '@data-stores/psql'

const getUserPrivateByAnyFromCache = caches.users_private.cacheGetByAny(getPrivateUserByAny)
const getUserPublicByAnyFromCache = caches.users_public.cacheGetByAny(getPublicUserByAny)
const getUserPublicByAnyBatchFromCache =
  caches.users_public.cacheGetByAnyBatch(getPublicUsersByAnyBatch)

export async function getUserPrivateByAnyCached(identifier: string) {
  return returnActiveCachedUser(await getUserPrivateByAnyFromCache(identifier))
}

export async function getUserPublicByAnyCached(identifier: string) {
  return returnActiveCachedUser(await getUserPublicByAnyFromCache(identifier))
}

export async function getUserPublicByAnyCachedBatch(identifiers: string[]) {
  const users = await getUserPublicByAnyBatchFromCache(identifiers)
  const activeIds = await getActiveUserIds(users.flatMap(user => (user ? [user.id] : [])))
  return users.map(user => (user && activeIds.has(user.id) ? user : null))
}
export const getTopicByAnyCached = caches.topics.cacheGetByAny(getTopicByAny)
export const getTopicByAnyWithRedirectCached =
  caches.topics_with_redirect.cacheGetByAny(getTopicByAnyWithRedirect)
export const getTopicByAnyCachedBatch = caches.topics.cacheGetByAnyBatch(getTopicsByAnyBatch)
export const getTopicMetricsByAnyCached = caches.topic_metrics.cacheGetByAny(getTopicMetricsByAny)
export const getTopicMetricsByAnyCachedBatch =
  caches.topic_metrics.cacheGetByAnyBatch(getTopicMetricsByAnyBatch)
/** @internal — no production consumer yet; generated vote-upsert tests mirror this cache instance/TTL/invalidation keys */
export const getAgentModerationElectionByIdCached = caches.agent_moderation_elections.cacheGetByAny(
  getAgentModerationElectionById,
)
export const getAgentModerationElectionByIdCachedBatch =
  caches.agent_moderation_elections.cacheGetByAnyBatch(getAgentModerationElectionsByIdBatch)
export const getPostByAnyCached = caches.posts.cacheGetByAny(getPostByAny)
export const getPostByAnyCachedBatch = caches.posts.cacheGetByAnyBatch(getPostsByAnyBatch)
export const getPostMetricsByAnyCached = caches.post_metrics.cacheGetByAny(getPostMetricsByAny)
export const getPostMetricsByAnyCachedBatch =
  caches.post_metrics.cacheGetByAnyBatch(getPostMetricsByAnyBatch)
export const getEntityRelationElectionByIdCachedBatch =
  caches.entity_relation_elections.cacheGetByAnyBatch(getEntityRelationElectionsByIdBatch)
/** @internal — no production consumer yet; rss-feed-item category tests mirror this cache instance/TTL/invalidation keys */
export const getRssFeedItemByIdCached = caches.rss_feed_items.cacheGetByAny(getRssFeedItemById)
export const getRssFeedItemByIdCachedBatch =
  caches.rss_feed_items.cacheGetByAnyBatch(getRssFeedItemsByIdBatch)
export const getUrlByAnyCached = caches.urls.cacheGetByAny(getUrlByAny)
export const getUrlHostnameByAnyCached = caches.url_hostnames.cacheGetByAny(getUrlHostnameByAny)
export const getUrlHostnameByAnyCachedBatch =
  caches.url_hostnames.cacheGetByAnyBatch(getUrlHostnamesByAnyBatch)
export const getTopicElectionByIdCachedBatch = caches.topic_elections.cacheGetByAnyBatch(
  getTopicElectionsByIdBatch,
)
export const getHostnameElectionByIdCached =
  caches.hostname_elections.cacheGetByAny(getHostnameElectionById)
export const getHostnameElectionByIdCachedBatch = caches.hostname_elections.cacheGetByAnyBatch(
  getHostnameElectionsByIdBatch,
)
export const getPostElectionByIdCached = caches.post_elections.cacheGetByAny(getPostElectionById)
export const getPostElectionByIdCachedBatch =
  caches.post_elections.cacheGetByAnyBatch(getPostElectionsByIdBatch)
export const getRssFeedItemElectionByIdCachedBatch =
  caches.rss_feed_item_elections.cacheGetByAnyBatch(getRssFeedItemElectionsByIdBatch)

async function returnActiveCachedUser<T extends { id: string }>(user: T | null): Promise<T | null> {
  if (!user) return null
  const activeIds = await getActiveUserIds([user.id])
  return activeIds.has(user.id) ? user : null
}

async function getActiveUserIds(userIds: string[]): Promise<Set<string>> {
  const uniqueUserIds = [...new Set(userIds)]
  if (uniqueUserIds.length === 0) return new Set()
  const { rows } = await write(
    `/* getActiveUserIdsForEntityCache */
      SELECT id
      FROM users
      WHERE id = ANY($1::uuid[])
        AND deleted_at IS NULL`,
    [uniqueUserIds],
  )
  return new Set(rows.map(row => row.id as string))
}
