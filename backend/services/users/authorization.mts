import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { BasicUser, PrivateUser, UserPrivacyAudience } from '@services/users/types'
import { DELETED_USER_ID } from '@services/users/constants'

export { isOfficialAccount } from '@ts-shared/utils/official-account'

export function currentUserCanAccessUser(
  currentUser: PrivateUser | null,
  targetUserId: string,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return currentUser.id === targetUserId
}

export function currentUserCanUpdateUser(
  currentUser: PrivateUser | null,
  user: PrivateUser,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return currentUser.id === user.id
}

export function currentUserCanDeleteUser(
  currentUser: PrivateUser | null,
  user: PrivateUser,
): boolean {
  if (!currentUser) return false
  // The tombstone user owns all posts reassigned from deleted accounts.
  // Deleting it would break view_posts and, after the retention window,
  // cascade-delete every orphaned post. It must never be deletable.
  if (user.id === DELETED_USER_ID) return false
  if (currentUser.roles.includes('administrator')) return true
  return currentUser.id === user.id
}

export function currentUserCanAccessDataRequest(
  currentUser: PrivateUser | null,
  userId: string,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  return currentUser.id === userId
}

export function isAdminUser(currentUser: BasicUser | null): boolean {
  return currentUser?.roles?.includes('administrator') ?? false
}

export function isModeratorUser(currentUser: PrivateUser | null): boolean {
  return currentUser?.roles?.includes('moderator') ?? false
}

/** Returns true for site administrators and site moderators. */
export function isModerationStaff(currentUser: PrivateUser | null): boolean {
  return isAdminUser(currentUser) || isModeratorUser(currentUser)
}

export function isOwnerOrAdmin(
  currentUser: PrivateUser | null,
  ownerId: string | null | undefined,
): boolean {
  if (!currentUser) return false
  if (isAdminUser(currentUser)) return true
  return ownerId != null && currentUser.id === ownerId
}

export async function currentUserCanViewUserContent(
  currentUser: PrivateUser | null,
  targetUserId: string,
  audience: UserPrivacyAudience,
): Promise<boolean> {
  if (audience === 'everyone') return true
  if (currentUser?.roles?.includes('administrator')) return true
  if (currentUser?.id === targetUserId) return true
  if (audience === 'nobody') return false
  if (!currentUser) return false
  if (audience === 'users') return true

  if (audience === 'followers') {
    const { rows } = await read(sql`/* currentUserCanViewUserContent */
      SELECT 1 FROM relation__user__follow__user
      WHERE subject_id = ${currentUser.id}
        AND object_id = ${targetUserId}
        AND deleted_at IS NULL
      LIMIT 1
    `)
    return rows.length > 0
  }

  if (audience === 'mutual_followers') {
    const { rows } = await read(sql`/* currentUserCanViewUserContent */
      SELECT 1
      WHERE EXISTS (
        SELECT 1 FROM relation__user__follow__user
        WHERE subject_id = ${currentUser.id}
          AND object_id = ${targetUserId}
          AND deleted_at IS NULL
      )
      AND EXISTS (
        SELECT 1 FROM relation__user__follow__user
        WHERE subject_id = ${targetUserId}
          AND object_id = ${currentUser.id}
          AND deleted_at IS NULL
      )
    `)
    return rows.length > 0
  }

  return false
}
