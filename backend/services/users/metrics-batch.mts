import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import createError from 'http-errors'
import { isUUID, isUsername } from '@modules/utils'
import type { UserMetrics } from './types.mts'
import { USER_METRICS_BATCH_SQL } from './metrics-batch-sql.mts'

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

  const { rows } = await read(
    USER_METRICS_BATCH_SQL,
    [
      idInputs.map(input => input.value),
      idInputs.map(input => input.index),
      usernameInputs.map(input => input.value),
      usernameInputs.map(input => input.index),
    ],
    options,
  )

  for (const row of rows as UserMetricsBatchRow[]) {
    results[row.input_order] = {
      __entity_type: 'user_metrics',
      id: row.id,
      count: {
        reviews: Number(row.reviews_count) || 0,
        discussions: Number(row.discussions_count) || 0,
        comments: Number(row.comments_count) || 0,
        users_following: Number(row.users_following_count) || 0,
        users_followers: Number(row.users_followers_count) || 0,
        topics_following: Number(row.topics_following_count) || 0,
        rss_feeds_following: Number(row.rss_feeds_following_count) || 0,
        communities_member: Number(row.communities_member_count) || 0,
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
