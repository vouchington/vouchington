import type {
  DynamicConfigPermission,
  DynamicConfigRegistryEntry,
  DynamicConfigUser,
} from './types.mts'

export const DYNAMIC_CONFIG_VIEWER_ROLES = [
  'moderator',
  'developer',
  'customer_support',
  'investor',
] as const

export function currentUserCanAccessDynamicConfigNamespace(
  currentUser: DynamicConfigUser | null,
  entry: Pick<DynamicConfigRegistryEntry, 'access'>,
  permission: DynamicConfigPermission,
): boolean {
  if (!currentUser) return false
  if (currentUser.roles.includes('administrator')) return true
  if (permission === 'view') {
    return currentUser.roles.some(role =>
      (DYNAMIC_CONFIG_VIEWER_ROLES as readonly string[]).includes(role),
    )
  }
  return entry.access.update_roles.some(role => currentUser.roles.includes(role))
}
