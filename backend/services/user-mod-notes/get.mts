import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { verifiedDisplayNameSql } from '@services/users/verified-display-name-sql'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  isModerationStaff,
  getModeratedCommunityIds,
  type ModeratedCommunityIdsOption,
} from './authorization.mts'
import type { UserModNote } from './config.mts'

export type ListUserModNotesOptions = {
  limit?: number
  beforeId?: string | null
}

export async function listUserModNotes(
  currentUser: PrivateUser,
  targetUserId: string,
  options?: ListUserModNotesOptions & ModeratedCommunityIdsOption & QueryOptions,
): Promise<{ notes: UserModNote[]; hasNextPage: boolean }> {
  const limit = typeof options?.limit === 'number' ? Math.min(Math.max(options.limit, 1), 100) : 20
  const beforeId = options?.beforeId ?? null

  // A single-value range keeps target_user_id in the scoped index order.
  const query = sql`/* listUserModNotes */
    SELECT n.id, n.created_at, n.target_user_id, n.author_user_id,
      author.username AS author_username,
      `.append(verifiedDisplayNameSql('author')).append(sql` AS author_display_name,
      n.community_id, community.name AS community_name, n.body, n.deleted_at
    FROM (
      SELECT id, created_at, target_user_id, author_user_id, community_id, body, deleted_at
      FROM user_moderator_notes
      WHERE target_user_id BETWEEN ${targetUserId} AND ${targetUserId}
        AND deleted_at IS NULL
  `)

  if (!isModerationStaff(currentUser)) {
    const moderatedIds =
      options?.moderatedCommunityIds ?? (await getModeratedCommunityIds(currentUser))
    assert(moderatedIds.length > 0, 403, 'Forbidden')
    query.append(sql` AND community_id = ANY(${moderatedIds}::uuid[])`)
  }

  if (beforeId) {
    query.append(sql` AND id < ${beforeId}::uuid`)
  }

  query.append(sql`
      ORDER BY target_user_id ASC, id DESC
      LIMIT ${limit + 1}
    ) n
    LEFT JOIN users author ON author.id = n.author_user_id AND author.deleted_at IS NULL
    LEFT JOIN communities community ON community.id = n.community_id
    ORDER BY n.id DESC
  `)

  const { rows } = await read<UserModNote>(query, options)
  const hasNextPage = rows.length > limit
  const notes = hasNextPage ? rows.slice(0, limit) : rows
  return { notes, hasNextPage }
}
