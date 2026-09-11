import type { PrivateUser } from '../users/types.mts'
import type { ApiKeyType } from './format.mts'

const RSS_PERMISSIONS = ['rss-feeds:read'] as const
const MCP_USER_PRESETS = [
  ['mcp-tools:read'] as const,
  ['mcp-tools:read', 'mcp-tools:write'] as const,
] as const
const MCP_ADMIN_PRESETS = [
  ['mcp-admin-tools:read'] as const,
  ['mcp-admin-tools:read', 'mcp-admin-tools:write'] as const,
] as const

export function validateApiKeyCreationPermissions(
  currentUser: PrivateUser,
  type: ApiKeyType,
  permissions: readonly string[],
): string | null {
  if (type === 'rss') {
    return matchesPreset(permissions, RSS_PERMISSIONS)
      ? null
      : `rss keys must use ${RSS_PERMISSIONS.join(', ')}`
  }

  const hasUserPermissions = permissions.some(permission => permission.startsWith('mcp-tools:'))
  const hasAdminPermissions = permissions.some(permission =>
    permission.startsWith('mcp-admin-tools:'),
  )

  if (hasUserPermissions && hasAdminPermissions) {
    return 'mcp keys must not mix user and admin permissions'
  }

  if (hasAdminPermissions && !currentUser.roles.includes('administrator')) {
    return 'admin mcp scopes require administrator role'
  }

  if (permissions.includes('mcp-tools:write') && !permissions.includes('mcp-tools:read')) {
    return 'mcp write permission requires mcp-tools:read'
  }

  if (
    permissions.includes('mcp-admin-tools:write') &&
    !permissions.includes('mcp-admin-tools:read')
  ) {
    return 'mcp admin write permission requires mcp-admin-tools:read'
  }

  if (hasAdminPermissions) {
    return matchesAnyPreset(permissions, MCP_ADMIN_PRESETS)
      ? null
      : 'admin mcp keys must use mcp-admin-tools:read or mcp-admin-tools:read, mcp-admin-tools:write'
  }

  return matchesAnyPreset(permissions, MCP_USER_PRESETS)
    ? null
    : 'mcp keys must use mcp-tools:read or mcp-tools:read, mcp-tools:write'
}

function matchesAnyPreset(permissions: readonly string[], presets: readonly (readonly string[])[]) {
  return presets.some(preset => matchesPreset(permissions, preset))
}

function matchesPreset(permissions: readonly string[], preset: readonly string[]) {
  const permissionSet = new Set(permissions)
  if (permissionSet.size !== permissions.length) return false
  return (
    permissions.length === preset.length &&
    permissions.every(permission => preset.includes(permission))
  )
}
