import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { isModerationStaff } from '@services/users/authorization'

export { isModerationStaff }

export async function currentUserCanAccessUserModNotes(
  currentUser: PrivateUser,
  options?: QueryOptions,
): Promise<boolean> {
  if (isModerationStaff(currentUser)) return true
  const ids = await getModeratedCommunityIds(currentUser, options)
  return ids.length > 0
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
