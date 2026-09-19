export type ApiKeyPreset = {
  id: string
  label: string
  type: 'rss' | 'mcp'
  permissions: string[]
  adminOnly?: boolean
}

export const DEFAULT_API_KEY_PRESET_ID = 'rss-read'

export const API_KEY_PRESETS: ApiKeyPreset[] = [
  {
    id: DEFAULT_API_KEY_PRESET_ID,
    label: 'RSS read-only',
    type: 'rss',
    permissions: ['rss:read'],
  },
  {
    id: 'user-mcp-read',
    label: 'User MCP read-only',
    type: 'mcp',
    permissions: ['mcp.user:read'],
  },
  {
    id: 'user-mcp-write',
    label: 'User MCP read/write',
    type: 'mcp',
    permissions: ['mcp.user:read', 'mcp.user:write'],
  },
  {
    id: 'admin-mcp-read',
    label: 'Admin MCP read-only',
    type: 'mcp',
    permissions: ['mcp.admin:read'],
    adminOnly: true,
  },
  {
    id: 'admin-mcp-write',
    label: 'Admin MCP read/write',
    type: 'mcp',
    permissions: ['mcp.admin:read', 'mcp.admin:write'],
    adminOnly: true,
  },
]

export function getVisibleApiKeyPresets(isAdmin: boolean): ApiKeyPreset[] {
  return API_KEY_PRESETS.filter(preset => !preset.adminOnly || isAdmin)
}
