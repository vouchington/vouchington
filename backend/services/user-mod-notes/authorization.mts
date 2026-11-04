import assert from 'http-assert'
import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { isModerationStaff } from '@services/users/authorization'
import { COMMUNITY_MEMBERSHIP_LIMIT_MAX_VALUES } from '@services/entity-cache/community-memberships'

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

/** Check one known community without materializing the user's full moderator list. */
export async function isUserCommunityModerator(
  currentUser: PrivateUser,
  communityId: string,
  options?: QueryOptions,
): Promise<boolean> {
  const { rows } = await write(
    sql`/* isUserCommunityModerator */
      SELECT COALESCE((
        SELECT cm.role IN ('owner', 'moderator')
        FROM community_members cm
        WHERE cm.community_id = ${communityId}
          -- The closed UUID range preserves equality and makes generic plans use both index keys.
          AND cm.user_id >= ${currentUser.id}
          AND cm.user_id <= ${currentUser.id}
          AND cm.removed_at IS NULL
      ), false) AND EXISTS (
        SELECT 1 FROM communities c
        WHERE c.id = ${communityId} AND c.deleted_at IS NULL
      ) AS is_moderator
    `,
    options,
  )
  return (rows[0] as { is_moderator: boolean }).is_moderator
}

export async function getModeratedCommunityIds(
  currentUser: PrivateUser,
  options?: QueryOptions,
): Promise<string[]> {
  const { rows } = await write(
    sql`/* getModeratedCommunityIds */
    SELECT cm.community_id
    FROM community_members cm
    JOIN communities c ON c.id = cm.community_id AND c.deleted_at IS NULL
    WHERE cm.user_id = ${currentUser.id}
      AND cm.removed_at IS NULL
      AND cm.role IN ('owner', 'moderator')
    LIMIT ${COMMUNITY_MEMBERSHIP_LIMIT_MAX_VALUES.communities_per_user + 1}
    `,
    options,
  )
  if (rows.length > COMMUNITY_MEMBERSHIP_LIMIT_MAX_VALUES.communities_per_user) {
    throw new Error('User moderator community list exceeds the enforced hard membership limit.')
  }
  return rows.map(r => (r as { community_id: string }).community_id)
}

export async function assertCanAccessUserModNotes(currentUser: PrivateUser): Promise<void> {
  if (isModerationStaff(currentUser)) return
  const { rows } = await write(
    sql`/* assertCanAccessUserModNotes */
      SELECT EXISTS (
        SELECT 1
        FROM community_members cm
        JOIN communities c ON c.id = cm.community_id AND c.deleted_at IS NULL
        WHERE cm.user_id = ${currentUser.id}
          AND cm.removed_at IS NULL
          AND cm.role IN ('owner', 'moderator')
      ) AS allowed
    `,
  )
  assert((rows[0] as { allowed: boolean }).allowed, 403, 'Forbidden')
}
