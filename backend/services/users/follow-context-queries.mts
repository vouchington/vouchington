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

export async function getFollowedUsersByElectionVoteIdsBatch(
  currentUser: BasicUser,
  entityId: string | null | undefined,
  voteTable: VoteTableName,
  signs: Array<-1 | 1>,
  {
    limit = DEFAULT_LIMIT,
    queryOptions = {},
  }: { limit?: number; queryOptions?: QueryOptions } = {},
): Promise<FollowContextIds[]> {
  if (!entityId) {
    return signs.map(() => ({ total: 0, userIds: [] }))
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

  // Post vote state is already unique per voter/post; other configured vote tables remain
  // append-only and need DISTINCT ON. Choice strength is deliberately not exposed here.
  const currentVoteTable = voteTable === 'post_votes' ? 'post_vote_states' : voteTable
  const currentVoteOrder = currentVoteTable === 'post_vote_states' ? '' : ', id DESC'
  const currentVotesCte = `current_votes AS (
      SELECT ${currentVoteTable === 'post_vote_states' ? '' : 'DISTINCT ON (user_id) '}id, user_id, score, created_at
      FROM ${currentVoteTable}
      WHERE ${entityIdColumn} = $2
      ORDER BY user_id${currentVoteOrder}
    )`

  const query = `/* getFollowedUsersByElectionVote */
    WITH ${currentVotesCte}, followed_votes AS MATERIALIZED (
      SELECT cv.id, cv.user_id, cv.score FROM current_votes AS cv
      JOIN relation__user__follow__user AS follows
        ON follows.subject_id = $1
       AND follows.object_id = cv.user_id
       AND follows.deleted_at IS NULL
      WHERE cv.score <> 0
    ), matched AS MATERIALIZED (
      SELECT cv.id, cv.user_id, SIGN(cv.score)::INT AS sign
      FROM followed_votes cv
      JOIN users AS vote_user ON vote_user.id = cv.user_id
      WHERE vote_user.deleted_at IS NULL
        ${likesVisibilityFilter}
    )
    SELECT requested.sign,
      (SELECT COUNT(*)::INT FROM matched WHERE matched.sign = requested.sign) AS total,
      ARRAY(SELECT user_id FROM matched WHERE matched.sign = requested.sign
        ORDER BY id DESC, user_id ASC LIMIT $4) AS user_ids
    FROM UNNEST($3::INT[]) WITH ORDINALITY AS requested(sign, position)
    ORDER BY requested.position
  `

  const { rows } = await read<{ total: number; user_ids: string[] }>(
    query,
    [currentUserId, entityId, signs, normalizedLimit],
    queryOptions,
  )
  return rows.map(row => ({ total: row.total, userIds: row.user_ids }))
}

export async function getFollowedUsersByElectionVoteIds(
  currentUser: BasicUser,
  entityId: string | null | undefined,
  voteTable: VoteTableName,
  sign: -1 | 1,
  options: { limit?: number; queryOptions?: QueryOptions } = {},
): Promise<FollowContextIds> {
  const [group] = await getFollowedUsersByElectionVoteIdsBatch(
    currentUser,
    entityId,
    voteTable,
    [sign],
    options,
  )
  return group!
}
