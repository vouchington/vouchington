import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { decodeScopedTimestampUuidCursor, encodeCursor } from '@modules/pagination'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import createHttpError from 'http-errors'
import { normalizeFollowContextLimit, type FollowContextIds } from './follow-context-queries.mts'
import type { BasicUser } from './types.mts'
import { getUsersWorkLimit, usersWorkMaxValues } from './work-limits.mts'

type TopicFollowContextIds = FollowContextIds & {
  totalIsExact: boolean
  nextCursor: string | null
}

type FollowCursor = { timestamp: number; id: string }
type InspectedFollow = {
  user_id: string
  followed_us: string
  eligible: boolean
}

export async function getFollowedUsersFollowingTopicIds(
  currentUser: BasicUser,
  topicId: string,
  limit: number,
  options: QueryOptions = {},
  after?: string,
): Promise<TopicFollowContextIds> {
  const scope = `topic-follow-context:${currentUser.id}:${topicId}`
  const cursor = after === undefined ? undefined : decodeFollowCursor(after, scope)
  const inspectLimit = getUsersWorkLimit('topic_follow_context_inspect_limit')
  const countCap = getUsersWorkLimit('topic_follow_context_count_cap')
  const rows = await walkViewerFollows(currentUser, topicId, inspectLimit, options, cursor)

  const displayLimit = Math.min(normalizeFollowContextLimit(limit), countCap)
  const inspected = rows.slice(0, inspectLimit)
  const eligible = inspected.filter(row => row.eligible)
  const displayed = eligible.slice(0, displayLimit)
  const hasMoreInspected = rows.length > inspectLimit
  // A page full of visible users can leave visible rows inside the inspected window.
  const end =
    eligible.length > displayLimit
      ? displayed.at(-1)
      : hasMoreInspected
        ? inspected.at(-1)
        : undefined

  return {
    total: Math.min(eligible.length, countCap),
    totalIsExact: !hasMoreInspected && eligible.length <= countCap,
    userIds: displayed.map(row => row.user_id),
    nextCursor: end
      ? encryptSecret(
          encodeCursor({ timestamp: Number(end.followed_us), id: end.user_id, scope }),
          scope,
        )
      : null,
  }
}

function decodeFollowCursor(after: string, scope: string): FollowCursor {
  const error = 'Invalid topic follow context cursor'
  let value: string
  try {
    value = decryptSecret(after, scope)
  } catch {
    throw createHttpError(400, error)
  }
  return decodeScopedTimestampUuidCursor(value, scope, error)
}

async function walkViewerFollows(
  currentUser: BasicUser,
  topicId: string,
  inspectLimit: number,
  options: QueryOptions,
  cursor: FollowCursor | undefined,
): Promise<InspectedFollow[]> {
  const parameters: unknown[] = [
    currentUser.id,
    topicId,
    currentUser.roles.includes('administrator'),
    usersWorkMaxValues.topic_follow_context_inspect_limit + 1,
    inspectLimit + 1,
  ]
  if (cursor) parameters.push(cursor.timestamp, cursor.id)
  // Only the viewer's own follows can set a scan or continuation boundary.
  const seek = cursor
    ? `AND (created_at, object_id) < (
        TIMESTAMPTZ 'epoch' + ($6::bigint / 1000000) * INTERVAL '1 second'
          + ($6::bigint % 1000000) * INTERVAL '1 microsecond',
        $7
      )`
    : ''
  const { rows } = await read<InspectedFollow>(
    `/* getFollowedUsersFollowingTopic */
    SELECT inspected.user_id,
      (EXTRACT(EPOCH FROM inspected.followed_at) * 1000000)::bigint AS followed_us,
      EXISTS (
        SELECT 1 FROM relation__user__follow__topic AS topic_follow
        WHERE topic_follow.subject_id = inspected.user_id
          AND topic_follow.object_id = $2
          AND topic_follow.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM users AS follow_user
            WHERE follow_user.id = inspected.user_id
              AND follow_user.deleted_at IS NULL
              AND (
                $3::boolean
                OR follow_user.topic_follows_visibility IN ('everyone', 'users', 'followers')
                OR (follow_user.topic_follows_visibility = 'mutual_followers' AND EXISTS (
                  SELECT 1 FROM relation__user__follow__user
                  WHERE subject_id = inspected.user_id AND object_id = $1 AND deleted_at IS NULL
                ))
              )
          )
      ) AS eligible
    FROM (
      SELECT object_id AS user_id, created_at AS followed_at
      FROM relation__user__follow__user
      WHERE subject_id = $1 AND deleted_at IS NULL
      ${seek}
      ORDER BY created_at DESC, object_id DESC
      LIMIT LEAST($4::int, $5::int)
    ) AS inspected
    ORDER BY inspected.followed_at DESC, inspected.user_id DESC`,
    parameters,
    options,
  )
  return rows
}
