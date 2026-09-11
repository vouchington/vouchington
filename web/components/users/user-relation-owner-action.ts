import { getUserProfile } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import type { RelationManagementActionConfig } from './relation-management-action'

export async function getOwnerRelationAction(
  idOrUsername: string,
  action: RelationManagementActionConfig,
): Promise<RelationManagementActionConfig | undefined> {
  const [profileData, currentUser] = await Promise.all([
    getUserProfile(idOrUsername),
    getCurrentUser(),
  ])

  if (!currentUser?.id || !profileData?.user.id) return undefined
  return currentUser.id === profileData.user.id ? action : undefined
}
