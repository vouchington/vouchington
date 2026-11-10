import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID, isUsername } from '@modules/utils'
import type { PrivateUser, UserMetrics } from '@services/users/types'
import createError from 'http-errors'
import { getUserBookmarkCounts } from '@services/bookmarks/counts'
import { getUserPostTypeFacets } from '@services/posts/search/get-facets'
import { countUserMemberCommunities } from '@services/communities/members/member-communities'
import { currentUserCanAccessUser } from '@services/users/authorization'
import type { CappedCount } from '@services/users/profile-count-cap'
import { getPrivateCounts } from './metrics-private-counts.mts'
import { getMetricsCollectionVisibility } from './metrics-collection-visibility.mts'
import { caches } from '@services/entity-cache/caches'
import { getUserCacheKeys } from '@services/entity-cache/keys'
import onError from '@modules/on-error'

type GetUserMetricsOptions = QueryOptions & {
  currentUser?: PrivateUser
}

type UserMetricsRow = {
  id: string
}

function getUserMetricsByAny(
  idOrUsername: string,
  options: QueryOptions = {},
): Promise<UserMetrics | null> {
  return getUserMetricsRowByAny(idOrUsername, options).then(row =>
    row ? buildUserMetrics(row, undefined, options) : null,
  )
}

export function getUserProfileMetricsByAny(
  idOrUsername: string,
  options: GetUserMetricsOptions = {},
): Promise<UserMetrics | null> {
  const { currentUser, ...queryOptions } = options
  return getUserMetricsRowByAny(idOrUsername, queryOptions).then(row =>
    row ? buildUserMetrics(row, currentUser, queryOptions) : null,
  )
}

export const getUserMetricsByAnyCached = caches.user_metrics.cacheGetByAny(getUserMetricsByAny)

// Split from @services/entity-cache/refresh.mts's `refresh.user_metrics`: entity-cache must not
// import @services/users/metrics (that direction would create a users<->entity-cache cycle since
// entity-cache already depends on users for get.mts's getPrivateUserByAny/getPublicUserByAny).
export const refreshUserMetricsCache = wrapRefresh(async (...keys: unknown[]): Promise<void> => {
  const cacheKeys = await getUserCacheKeys(...keys)
  if (cacheKeys.length > 0) {
    await caches.user_metrics.refreshById(cacheKeys, getUserMetricsByAny)
  }
})

async function buildUserMetrics(
  row: UserMetricsRow,
  currentUser: PrivateUser | undefined,
  queryOptions: QueryOptions,
): Promise<UserMetrics> {
  const [bookmarkCounts, postTypeFacets, communitiesMemberCount, collectionVisibility] =
    await Promise.all([
      getUserBookmarkCounts(row.id),
      getUserPostTypeFacets(row.id, currentUser),
      countUserMemberCommunities(row.id, currentUser ?? null, queryOptions),
      getMetricsCollectionVisibility(currentUser, row.id),
    ])

  const hidden: CappedCount = { count: 0, capped: false }
  const bookmarks = bookmarkCounts.bookmarks
  const cappedCounts: Record<keyof UserMetrics['count'], CappedCount> = {
    reviews: postTypeFacets.review,
    discussions: postTypeFacets.discussion,
    comments: postTypeFacets.comment,
    users_following: collectionVisibility.follows ? (bookmarks.users.follow ?? hidden) : hidden,
    users_followers: collectionVisibility.followers
      ? (bookmarkCounts.bookmarkers.follow ?? hidden)
      : hidden,
    topics_following: collectionVisibility.topicFollows
      ? (bookmarks.topics.follow ?? hidden)
      : hidden,
    rss_feeds_following: collectionVisibility.rssFeedFollows
      ? (bookmarks.rss_feeds.follow ?? hidden)
      : hidden,
    communities_member: communitiesMemberCount,
  }
  const counts = mapCappedCounts(cappedCounts, capped => capped.count)
  const countsCapped = mapCappedCounts(cappedCounts, capped => capped.capped)

  const privateCounts = currentUserCanAccessUser(currentUser ?? null, row.id)
    ? await getPrivateCounts(row.id, queryOptions)
    : undefined

  return {
    __entity_type: 'user_metrics',
    id: row.id,
    count: counts,
    count_capped: countsCapped,
    ...privateCounts,
  }
}

function mapCappedCounts<T>(
  counts: Record<keyof UserMetrics['count'], CappedCount>,
  pick: (count: CappedCount) => T,
): Record<keyof UserMetrics['count'], T> {
  return Object.fromEntries(
    Object.entries(counts).map(([key, value]) => [key, pick(value)]),
  ) as Record<keyof UserMetrics['count'], T>
}

async function getUserMetricsRowByAny(
  idOrUsername: string,
  options: QueryOptions = {},
): Promise<UserMetricsRow | null> {
  const isId = isUUID(idOrUsername)
  const isUsernameValue = isUsername(idOrUsername)

  if (!isId && !isUsernameValue) {
    throw createError(422, `Invalid user identifier: ${idOrUsername}`)
  }

  const { rows } = isId
    ? await read(
        `/* getUserMetricsRowByAny */
        SELECT id
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [idOrUsername],
        options,
      )
    : await read(
        `/* getUserMetricsRowByAny */
        SELECT id
        FROM users
        WHERE LOWER(username) = LOWER($1)
          AND deleted_at IS NULL
        LIMIT 1
        `,
        [idOrUsername],
        options,
      )

  return (rows[0] as UserMetricsRow | undefined) ?? null
}

function wrapRefresh(
  fn: (...keys: unknown[]) => Promise<void>,
): (...keys: unknown[]) => Promise<void> {
  return async (...keys: unknown[]): Promise<void> => {
    try {
      return await fn(...keys)
    } catch (err) {
      onError(err as Error)
      throw err
    }
  }
}
