export const DYNAMIC_CONFIG_VIEWER_ROLES = ['moderator', 'developer', 'investor'] as const

export function canAccessDynamicConfig(roles: readonly string[]): boolean {
  if (roles.includes('administrator')) return true
  return roles.some(role => (DYNAMIC_CONFIG_VIEWER_ROLES as readonly string[]).includes(role))
}
