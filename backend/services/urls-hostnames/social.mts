import { read } from '@data-stores/psql'
import { buildPageInfo, decodeUuidCursor, isScoreCursor } from '@modules/pagination'
import { getFriendTrustedHostnamesLimit } from './social-limits.mts'
import type { PageInfo } from '@voucha/types/pagination'

export type FriendTrustedHostname = {
  id: string
  friend_upvote_count: number
  friend_voter_ids: string[]
}

export type GetFriendTrustedHostnamesOptions = {
  limit?: number
  after?: string
}

export async function getFriendTrustedHostnames(
  currentUserId: string,
  options: GetFriendTrustedHostnamesOptions = {},
): Promise<{ results: FriendTrustedHostname[]; page_info: PageInfo }> {
  const limit = Math.max(
    1,
    Math.min(100, Number.isFinite(options.limit) ? (options.limit as number) : 25),
  )
  const values: unknown[] = []
  const cursorConditions: string[] = []

  if (options.after) {
    const cursor = decodeUuidCursor(
      options.after,
      isScoreCursor,
      'Invalid cursor format: expected score cursor',
    )
    const scoreIdx = values.push(cursor.score)
    const idIdx = values.push(cursor.id)
    cursorConditions.push(
      `(friend_upvote_count < $${scoreIdx} OR (friend_upvote_count = $${scoreIdx} AND h.id < $${idIdx}))`,
    )
  }

  const userIdIdx = values.push(currentUserId)
  const friendLimitIdx = values.push(getFriendTrustedHostnamesLimit('friend_follow_limit'))
  const votesPerFriendIdx = values.push(getFriendTrustedHostnamesLimit('votes_per_friend_limit'))
  values.push(limit + 1)

  const cursorWhere = cursorConditions.length > 0 ? `AND ${cursorConditions.join(' AND ')}` : ''

  const { rows } = await read(
    `/* getFriendTrustedHostnames */
    WITH friends AS (
      SELECT object_id AS friend_id
      FROM relation__user__follow__user
      WHERE subject_id = $${userIdIdx}
        AND deleted_at IS NULL
      ORDER BY created_at DESC, object_id DESC
      LIMIT $${friendLimitIdx}
    ),
    recent_friend_votes AS (
      SELECT v.hostname_id, v.user_id, v.score, v.id
      FROM friends f
      CROSS JOIN LATERAL (
        SELECT hv.hostname_id, hv.user_id, hv.score, hv.id
        FROM hostname_votes hv
        WHERE hv.user_id = f.friend_id
        ORDER BY hv.id DESC
        LIMIT $${votesPerFriendIdx}
      ) v
    ),
    current_friend_votes AS (
      SELECT DISTINCT ON (user_id, hostname_id)
        hostname_id,
        user_id,
        score
      FROM recent_friend_votes
      ORDER BY user_id, hostname_id, id DESC
    ),
    friend_upvotes AS (
      SELECT
        hostname_id,
        COUNT(*)::INT AS friend_upvote_count,
        array_agg(user_id) AS friend_voter_ids
      FROM current_friend_votes
      WHERE score > 0
      GROUP BY hostname_id
    )
    SELECT
      h.id,
      fu.friend_upvote_count,
      fu.friend_voter_ids
    FROM friend_upvotes fu
    JOIN url_hostnames h ON h.id = fu.hostname_id
    WHERE NOT h.is_blocked
      AND h.publicly_introduced_at IS NOT NULL
    ${cursorWhere}
    ORDER BY fu.friend_upvote_count DESC, h.id DESC
    LIMIT $${values.length}`,
    values,
  )

  const all = rows as FriendTrustedHostname[]
  const hasNextPage = all.length > limit
  const results = all.slice(0, limit)

  return {
    results,
    page_info: buildPageInfo(results, {
      hasNextPage,
      getCursor: h => ({ score: h.friend_upvote_count, id: h.id }),
    }),
  }
}
