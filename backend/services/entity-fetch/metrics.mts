import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID, isUsername } from '@modules/utils'
import type { PrivateUser, UserMetrics } from '@services/users/types'
import createError from 'http-errors'
import { getUserBookmarkCounts } from '@services/bookmarks/counts'
import { getPostFacets } from '@services/posts/search/get-facets'
import { countUserMemberCommunities } from '@services/communities/members/member-communities'
import { currentUserCanAccessUser } from '@services/users/authorization'
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
  bookmarks__follow__topics_count: number | string | null
  bookmarks__follow__posts_count: number | string | null
  bookmarks__follow__users_count: number | string | null
  bookmarkers__follow_count: number | string | null
  bookmarks__updated_at: Date
}

export function getUserMetricsByAny(
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
  const [
    bookmarkCounts,
    publicReviewFacets,
    publicDiscussionFacets,
    publicCommentFacets,
    communitiesMemberCount,
    collectionVisibility,
  ] = await Promise.all([
    getUserBookmarkCounts(row.id),
    getPostFacets(undefined, { user_id: row.id, post_types: ['review'] }),
    getPostFacets(undefined, { user_id: row.id, post_types: ['discussion'] }),
    getPostFacets(undefined, { user_id: row.id, post_types: ['comment'] }),
    countUserMemberCommunities(row.id, currentUser ?? null, queryOptions),
    getMetricsCollectionVisibility(currentUser, row.id),
  ])

  const publicCounts = {
    reviews: publicReviewFacets.total_count,
    discussions: publicDiscussionFacets.total_count,
    comments: publicCommentFacets.total_count,
    users_following: collectionVisibility.follows
      ? (bookmarkCounts.bookmarks.users.follow ?? 0)
      : 0,
    users_followers: collectionVisibility.followers ? (bookmarkCounts.bookmarkers.follow ?? 0) : 0,
    topics_following: collectionVisibility.topicFollows
      ? (bookmarkCounts.bookmarks.topics.follow ?? 0)
      : 0,
    rss_feeds_following: collectionVisibility.rssFeedFollows
      ? (bookmarkCounts.bookmarks.rss_feeds.follow ?? 0)
      : 0,
    communities_member: communitiesMemberCount,
  }

  let viewerCount: UserMetrics['viewer_count']
  if (currentUser) {
    const [viewerReviewFacets, viewerDiscussionFacets, viewerCommentFacets] = await Promise.all([
      getPostFacets(currentUser, { user_id: row.id, post_types: ['review'] }),
      getPostFacets(currentUser, { user_id: row.id, post_types: ['discussion'] }),
      getPostFacets(currentUser, { user_id: row.id, post_types: ['comment'] }),
    ])

    viewerCount = {
      reviews: viewerReviewFacets.total_count,
      discussions: viewerDiscussionFacets.total_count,
      comments: viewerCommentFacets.total_count,
    }
  }

  let privateCount: UserMetrics['private_count']
  const allowPrivateCounts = currentUserCanAccessUser(currentUser ?? null, row.id)

  if (allowPrivateCounts) {
    privateCount = await getPrivateCounts(row.id, queryOptions)
  }

  return {
    __entity_type: 'user_metrics',
    id: row.id,
    count: publicCounts,
    ...(viewerCount ? { viewer_count: viewerCount } : {}),
    ...(privateCount ? { private_count: privateCount } : {}),
    bookmarks: {
      follow: {
        topics: collectionVisibility.topicFollows
          ? Number(row.bookmarks__follow__topics_count) || 0
          : 0,
        posts: allowPrivateCounts ? Number(row.bookmarks__follow__posts_count) || 0 : 0,
        users: collectionVisibility.follows ? Number(row.bookmarks__follow__users_count) || 0 : 0,
      },
    },
    bookmarkers: {
      follow: collectionVisibility.followers ? Number(row.bookmarkers__follow_count) || 0 : 0,
    },
    bookmarks__updated_at: row.bookmarks__updated_at,
  }
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
        SELECT vum.*
        FROM view_user_metrics vum
        WHERE vum.id = $1
        LIMIT 1
        `,
        [idOrUsername],
        options,
      )
    : await read(
        `/* getUserMetricsRowByAny */
        WITH user_id AS (
          SELECT id
          FROM users
          WHERE LOWER(username) = LOWER($1)
            AND deleted_at IS NULL
          LIMIT 1
        )
        SELECT vum.*
        FROM view_user_metrics vum
        INNER JOIN user_id u ON vum.id = u.id
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
    } catch (error) {
      onError(error as Error)
      throw error
    }
  }
}
