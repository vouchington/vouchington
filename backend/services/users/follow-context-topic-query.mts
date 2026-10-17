import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import type { BasicUser } from './types.mts'
import { normalizeFollowContextLimit, type FollowContextIds } from './follow-context-queries.mts'

export async function getFollowedUsersFollowingTopicIds(
  currentUser: BasicUser,
  topicId: string,
  limit: number,
  options: QueryOptions = {},
): Promise<FollowContextIds> {
  const currentUserId = currentUser.id
  const normalizedLimit = normalizeFollowContextLimit(limit)

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

  const query = `/* getFollowedUsersFollowingTopic */
    WITH matched AS MATERIALIZED (
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
    )
    SELECT (SELECT COUNT(*)::INT FROM matched) AS total,
      ARRAY(SELECT user_id FROM matched
        ORDER BY followed_at DESC, user_id ASC LIMIT $3) AS user_ids
  `

  const { rows } = await read<{ total: number; user_ids: string[] }>(
    query,
    [currentUserId, topicId, normalizedLimit],
    options,
  )

  return { total: rows[0]!.total, userIds: rows[0]!.user_ids }
}
