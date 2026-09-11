import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getPublicUsersByAnyBatch } from './get-public-batch.mts'
import type { BasicUser, PublicUser } from './types.mts'
type FollowContextUsers = {
  total: number
  users: PublicUser[]
}
type VoteTableName = 'post_votes' | 'topic_votes' | 'rss_feed_item_votes' | 'user_vouch_votes'
const DEFAULT_LIMIT = 5
const MAX_LIMIT = 20
const VOTE_TABLE_ENTITY_COLUMNS: Record<VoteTableName, string> = {
  post_votes: 'post_id',
  topic_votes: 'topic_id',
  rss_feed_item_votes: 'rss_feed_item_id',
  user_vouch_votes: 'target_user_id',
}

function normalizeLimit(limit: number): number {
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)))
}

function getVoteTableEntityColumn(voteTable: VoteTableName): string {
  const column = VOTE_TABLE_ENTITY_COLUMNS[voteTable]
  if (!column) {
    throw new Error(`Invalid vote table: ${voteTable}`)
  }
  return column
}

async function getPublicUsersFromIds(
  userIds: string[],
  options: QueryOptions = {},
): Promise<PublicUser[]> {
  if (userIds.length === 0) return []

  const users = await getPublicUsersByAnyBatch(userIds, options)
  return users.filter((user): user is PublicUser => user != null)
}

export async function getFollowedUsersByElectionVote(
  currentUser: BasicUser,
  entityId: string | null | undefined,
  voteTable: VoteTableName,
  sign: -1 | 1,
  {
    limit = DEFAULT_LIMIT,
    queryOptions = {},
  }: { limit?: number; queryOptions?: QueryOptions } = {},
): Promise<FollowContextUsers> {
  if (!entityId) {
    return { total: 0, users: [] }
  }
  const currentUserId = currentUser.id
  const normalizedLimit = normalizeLimit(limit)
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
  const currentVotesCte = `WITH current_votes AS (
      SELECT DISTINCT ON (user_id) user_id, score, created_at
      FROM ${voteTable}
      WHERE ${entityIdColumn} = $2
      ORDER BY user_id, id DESC
    )`

  const countQuery = `/* getFollowedUsersByElectionVote */
    ${currentVotesCte}
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
    ${currentVotesCte}
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
    ORDER BY cv.created_at DESC, cv.user_id ASC
    LIMIT $4
  `

  const [{ rows: countRows }, { rows: userRows }] = await Promise.all([
    read(countQuery, [currentUserId, entityId, sign], queryOptions),
    read(limitedQuery, [currentUserId, entityId, sign, normalizedLimit], queryOptions),
  ])

  const userIds = userRows.map(row => row.user_id as string)
  const users = await getPublicUsersFromIds(userIds, queryOptions)

  return {
    total: Number(countRows[0]?.total ?? 0),
    users,
  }
}

export async function getFollowedUsersFollowingTopic(
  currentUser: BasicUser,
  topicId: string,
  limit: number = DEFAULT_LIMIT,
  options: QueryOptions = {},
): Promise<FollowContextUsers> {
  const currentUserId = currentUser.id
  const normalizedLimit = normalizeLimit(limit)

  // Admins can always view all user content regardless of privacy settings
  const topicFollowsVisibilityFilter = currentUser.roles.includes('administrator')
    ? ''
    : `AND (
          follow_user.topic_follows_visibility = 'everyone'
          OR follow_user.topic_follows_visibility = 'users'
          OR follow_user.topic_follows_visibility = 'followers'
          OR (follow_user.topic_follows_visibility = 'mutual_followers' AND EXISTS (
            SELECT 1 FROM relation__user__follow__user
            WHERE subject_id = topic_follows.subject_id AND object_id = $1 AND deleted_at IS NULL
          ))
        )`

  const countQuery = `/* getFollowedUsersFollowingTopic */
    SELECT COUNT(*)::INT AS total
    FROM (
      SELECT DISTINCT topic_follows.subject_id
      FROM relation__user__follow__topic AS topic_follows
      JOIN relation__user__follow__user AS user_follows
        ON user_follows.subject_id = $1
       AND user_follows.object_id = topic_follows.subject_id
       AND user_follows.deleted_at IS NULL
      JOIN users AS follow_user ON follow_user.id = topic_follows.subject_id
      WHERE topic_follows.object_id = $2
        AND topic_follows.deleted_at IS NULL
        AND follow_user.deleted_at IS NULL
        ${topicFollowsVisibilityFilter}
    ) AS matched
  `

  const limitedQuery = `/* getFollowedUsersFollowingTopic */
    SELECT topic_follows.subject_id AS user_id, MAX(topic_follows.created_at) AS followed_at
    FROM relation__user__follow__topic AS topic_follows
    JOIN relation__user__follow__user AS user_follows
      ON user_follows.subject_id = $1
     AND user_follows.object_id = topic_follows.subject_id
     AND user_follows.deleted_at IS NULL
    JOIN users AS follow_user ON follow_user.id = topic_follows.subject_id
    WHERE topic_follows.object_id = $2
      AND topic_follows.deleted_at IS NULL
      AND follow_user.deleted_at IS NULL
      ${topicFollowsVisibilityFilter}
    GROUP BY topic_follows.subject_id
    ORDER BY followed_at DESC, topic_follows.subject_id ASC
    LIMIT $3
  `

  const [{ rows: countRows }, { rows: userRows }] = await Promise.all([
    read(countQuery, [currentUserId, topicId], options),
    read(limitedQuery, [currentUserId, topicId, normalizedLimit], options),
  ])

  const userIds = userRows.map(row => row.user_id as string)
  const users = await getPublicUsersFromIds(userIds, options)

  return {
    total: Number(countRows[0]?.total ?? 0),
    users,
  }
}
