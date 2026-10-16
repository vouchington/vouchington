import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getPublicUsersByAnyBatch } from './get-public-batch.mts'
import type { BasicUser, PublicUser } from './types.mts'

export type FollowContextUsers = {
  total: number
  users: PublicUser[]
}

export type FollowContextIds = {
  total: number
  userIds: string[]
}

export type VoteTableName =
  | 'post_votes'
  | 'topic_votes'
  | 'rss_feed_item_votes'
  | 'user_vouch_votes'

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 20
const VOTE_TABLE_ENTITY_COLUMNS: Record<VoteTableName, string> = {
  post_votes: 'post_id',
  topic_votes: 'topic_id',
  rss_feed_item_votes: 'rss_feed_item_id',
  user_vouch_votes: 'target_user_id',
}

export function normalizeFollowContextLimit(limit: number): number {
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)))
}

function getVoteTableEntityColumn(voteTable: VoteTableName): string {
  const column = VOTE_TABLE_ENTITY_COLUMNS[voteTable]
  if (!column) {
    throw new Error(`Invalid vote table: ${voteTable}`)
  }
  return column
}

export async function hydrateFollowContextGroups(
  groups: FollowContextIds[],
  options: QueryOptions,
): Promise<FollowContextUsers[]> {
  const uniqueUserIds = [...new Set(groups.flatMap(group => group.userIds))]
  const users = await getPublicUsersByAnyBatch(uniqueUserIds, options)
  const usersById = new Map(
    uniqueUserIds.map((userId, index) => [userId, users[index] ?? null] as const),
  )

  return groups.map(({ total, userIds }) => ({
    total,
    users: userIds.flatMap(userId => {
      const user = usersById.get(userId)
      return user ? [user] : []
    }),
  }))
}

export async function getFollowedUsersByElectionVoteIds(
  currentUser: BasicUser,
  entityId: string | null | undefined,
  voteTable: VoteTableName,
  sign: -1 | 1,
  {
    limit = DEFAULT_LIMIT,
    queryOptions = {},
  }: { limit?: number; queryOptions?: QueryOptions } = {},
): Promise<FollowContextIds> {
  if (!entityId) {
    return { total: 0, userIds: [] }
  }
  const currentUserId = currentUser.id
  const normalizedLimit = normalizeFollowContextLimit(limit)
  const entityIdColumn = getVoteTableEntityColumn(voteTable)

  // Admins can always view all user content regardless of privacy settings
  const likesVisibilityFilter = currentUser.roles.includes('administrator')
    ? ''
    : `AND (
          vote_user.likes_visibility = 'everyone'
          OR vote_user.likes_visibility = 'users'
          OR vote_user.likes_visibility = 'followers'
          OR (vote_user.likes_visibility = 'mutual_followers' AND EXISTS (
            SELECT 1 FROM relation__user__follow__user
            WHERE subject_id = cv.user_id AND object_id = $1 AND deleted_at IS NULL
          ))
        )`

  // Vote tables are append-only — DISTINCT ON resolves each voter's latest vote
  // before bucketing by sign. Choice strength is deliberately not exposed here.
  const currentVotesCte = `current_votes AS (
      SELECT DISTINCT ON (user_id) id, user_id, score, created_at
      FROM ${voteTable}
      WHERE ${entityIdColumn} = $2
      ORDER BY user_id, id DESC
    )`

  const countQuery = `/* getFollowedUsersByElectionVote */
    WITH ${currentVotesCte}
    SELECT COUNT(*)::INT AS total
    FROM current_votes AS cv
    JOIN relation__user__follow__user AS follows
      ON follows.subject_id = $1
     AND follows.object_id = cv.user_id
     AND follows.deleted_at IS NULL
    JOIN users AS vote_user ON vote_user.id = cv.user_id
    WHERE cv.score * $3 > 0
      AND vote_user.deleted_at IS NULL
      ${likesVisibilityFilter}
  `

  const limitedQuery = `/* getFollowedUsersByElectionVote */
    WITH ${currentVotesCte}
    SELECT cv.user_id, cv.created_at AS voted_at
    FROM current_votes AS cv
    JOIN relation__user__follow__user AS follows
      ON follows.subject_id = $1
     AND follows.object_id = cv.user_id
     AND follows.deleted_at IS NULL
    JOIN users AS vote_user ON vote_user.id = cv.user_id
    WHERE cv.score * $3 > 0
      AND vote_user.deleted_at IS NULL
      ${likesVisibilityFilter}
    ORDER BY cv.id DESC, cv.user_id ASC
    LIMIT $4
  `

  const [{ rows: countRows }, { rows: userRows }] = await Promise.all([
    read(countQuery, [currentUserId, entityId, sign], queryOptions),
    read(limitedQuery, [currentUserId, entityId, sign, normalizedLimit], queryOptions),
  ])

  return {
    total: Number(countRows[0]?.total ?? 0),
    userIds: userRows.map(row => row.user_id as string),
  }
}
