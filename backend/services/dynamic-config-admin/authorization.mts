import {
  createRoleAuthorizer,
  type DynamicConfigPermission,
  type DynamicConfigRegistryEntry,
} from '@vouchington/dynamic-config'
import type { DynamicConfigUser } from './types.mts'

export const DYNAMIC_CONFIG_VIEWER_ROLES = ['moderator', 'developer', 'investor'] as const

const authorizeDynamicConfig = createRoleAuthorizer<DynamicConfigUser>({
  getRoles: user => user.roles,
  adminRoles: ['administrator'],
  viewerRoles: DYNAMIC_CONFIG_VIEWER_ROLES,
})

export function currentUserCanAccessDynamicConfigNamespace(
  currentUser: DynamicConfigUser | null,
  entry: DynamicConfigRegistryEntry,
  permission: DynamicConfigPermission,
): boolean {
  return currentUser !== null && authorizeDynamicConfig(currentUser, entry, permission)
}
