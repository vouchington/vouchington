import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import createError from 'http-errors'
import { isUUID, isUsername } from '@modules/utils'
import type { UserMetrics } from './types.mts'
import { USER_METRICS_BATCH_SQL } from './metrics-batch-sql.mts'
import { getProfileCountCap, profileCountProbeLimit, toCappedCount } from './profile-count-cap.mts'

type UserMetricsBatchRow = {
  input_order: number
  id: string
  bookmarks__follow__topics_count: number | string | null
  bookmarks__follow__posts_count: number | string | null
  bookmarks__follow__users_count: number | string | null
  bookmarkers__follow_count: number | string | null
  bookmarks__updated_at: Date
  reviews_count: number | string | null
  discussions_count: number | string | null
  comments_count: number | string | null
  topics_following_count: number | string | null
  users_following_count: number | string | null
  users_followers_count: number | string | null
  rss_feeds_following_count: number | string | null
  communities_member_count: number | string | null
}

export const getUserMetricsByAnyBatch = async (
  identifiers: string[],
  options: QueryOptions = {},
): Promise<Array<UserMetrics | null | undefined>> => {
  if (identifiers.length === 0) {
    return []
  }
  const results: Array<UserMetrics | null | undefined> = new Array(identifiers.length).fill(null)
  const normalizedInputs = identifiers.map((input, index) => {
    const trimmed = input.trim()

    if (isUUID(trimmed)) {
      return { value: trimmed, type: 'id' as const, index }
    }
    if (isUsername(trimmed)) {
      return { value: trimmed.toLowerCase(), type: 'username' as const, index }
    }

    throw createError(422, `Invalid user identifier: ${input}`)
  })

  const idInputs = normalizedInputs.filter(input => input.type === 'id')
  const usernameInputs = normalizedInputs.filter(input => input.type === 'username')

  const cap = getProfileCountCap()
  const sqlPrefix = '\n    WITH '
  if (!USER_METRICS_BATCH_SQL.startsWith(sqlPrefix))
    throw new Error('User metrics SQL must begin with WITH')
  const { rows } = await read(
    `/* getUserMetricsByAnyBatch */\n    WITH ${USER_METRICS_BATCH_SQL.slice(sqlPrefix.length)}`,
    [
      idInputs.map(input => input.value),
      idInputs.map(input => input.index),
      usernameInputs.map(input => input.value),
      usernameInputs.map(input => input.index),
      profileCountProbeLimit(cap),
    ],
    options,
  )

  for (const row of rows as UserMetricsBatchRow[]) {
    const reviews = toCappedCount(row.reviews_count, cap)
    const discussions = toCappedCount(row.discussions_count, cap)
    const comments = toCappedCount(row.comments_count, cap)
    const usersFollowing = toCappedCount(row.users_following_count, cap)
    const usersFollowers = toCappedCount(row.users_followers_count, cap)
    const topicsFollowing = toCappedCount(row.topics_following_count, cap)
    const rssFeedsFollowing = toCappedCount(row.rss_feeds_following_count, cap)
    const communitiesMember = toCappedCount(row.communities_member_count, cap)
    results[row.input_order] = {
      __entity_type: 'user_metrics',
      id: row.id,
      count: {
        reviews: reviews.count,
        discussions: discussions.count,
        comments: comments.count,
        users_following: usersFollowing.count,
        users_followers: usersFollowers.count,
        topics_following: topicsFollowing.count,
        rss_feeds_following: rssFeedsFollowing.count,
        communities_member: communitiesMember.count,
      },
      count_capped: {
        reviews: reviews.capped,
        discussions: discussions.capped,
        comments: comments.capped,
        users_following: usersFollowing.capped,
        users_followers: usersFollowers.capped,
        topics_following: topicsFollowing.capped,
        rss_feeds_following: rssFeedsFollowing.capped,
        communities_member: communitiesMember.capped,
      },
      bookmarks: {
        follow: {
          topics: Number(row.bookmarks__follow__topics_count) || 0,
          posts: Number(row.bookmarks__follow__posts_count) || 0,
          users: Number(row.bookmarks__follow__users_count) || 0,
        },
      },
      bookmarkers: {
        follow: Number(row.bookmarkers__follow_count) || 0,
      },
      bookmarks__updated_at: row.bookmarks__updated_at,
    }
  }

  return results
}
