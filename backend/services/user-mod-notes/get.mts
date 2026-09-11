import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import type { QueryOptions } from '@data-stores/psql/types'
import { isModerationStaff, getModeratedCommunityIds } from './authorization.mts'
import type { UserModNote } from './config.mts'

export type ListUserModNotesOptions = {
  limit?: number
  beforeId?: string | null
}

export async function listUserModNotes(
  currentUser: PrivateUser,
  targetUserId: string,
  options?: ListUserModNotesOptions & QueryOptions,
): Promise<{ notes: UserModNote[]; hasNextPage: boolean }> {
  const limit = typeof options?.limit === 'number' ? Math.min(Math.max(options.limit, 1), 100) : 20
  const beforeId = options?.beforeId ?? null

  const query = sql`/* listUserModNotes */
    SELECT id, created_at, target_user_id, author_user_id, community_id, body, deleted_at
    FROM user_mod_notes
    WHERE target_user_id = ${targetUserId}
      AND deleted_at IS NULL
  `

  if (!isModerationStaff(currentUser)) {
    const moderatedIds = await getModeratedCommunityIds(currentUser)
    assert(moderatedIds.length > 0, 403, 'Forbidden')
    query.append(sql` AND community_id = ANY(${moderatedIds}::uuid[])`)
  }

  if (beforeId) {
    query.append(sql` AND id < ${beforeId}::uuid`)
  }

  query.append(sql` ORDER BY id DESC LIMIT ${limit + 1}`)

  const { rows } = await read(query, options)
  const hasNextPage = rows.length > limit
  const notes = (hasNextPage ? rows.slice(0, limit) : rows) as UserModNote[]
  return { notes, hasNextPage }
}
