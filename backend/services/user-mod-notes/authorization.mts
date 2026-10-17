import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { isModerationStaff } from '@services/users/authorization'

export { isModerationStaff }

/**
 * Who may reach user mod notes. A community moderator's moderated community ids come back with the
 * answer so the service call that follows does not load them again; staff need none.
 */
export type UserModNoteAccess = { allowed: boolean; moderatedCommunityIds?: string[] }

/** Callers that already hold the viewer's moderated community ids pass them down to skip a read. */
export type ModeratedCommunityIdsOption = { moderatedCommunityIds?: string[] }

export async function loadUserModNoteAccess(
  currentUser: PrivateUser,
  options?: QueryOptions,
): Promise<UserModNoteAccess> {
  if (isModerationStaff(currentUser)) return { allowed: true }
  const moderatedCommunityIds = await getModeratedCommunityIds(currentUser, options)
  return { allowed: moderatedCommunityIds.length > 0, moderatedCommunityIds }
}

export async function getModeratedCommunityIds(
  currentUser: PrivateUser,
  options?: QueryOptions,
): Promise<string[]> {
  const { rows } = await read(
    sql`/* getModeratedCommunityIds */
    SELECT cm.community_id
    FROM community_members cm
    JOIN communities c ON c.id = cm.community_id AND c.deleted_at IS NULL
    WHERE cm.user_id = ${currentUser.id}
      AND cm.removed_at IS NULL
      AND cm.role IN ('owner', 'moderator')
    `,
    options,
  )
  return rows.map(r => (r as { community_id: string }).community_id)
}
