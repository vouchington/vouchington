import type { ToolSurface } from '@voucha/tools/types'

export type McpServerConfig = {
  serverName: string
  routePath: string
  surface: ToolSurface
  readPermission: string
  writePermission: string
}

export const USER_MCP_SERVER_CONFIG: McpServerConfig = {
  serverName: 'voucha-user-mcp',
  routePath: '/api/v1/mcp',
  surface: 'mcp',
  readPermission: 'mcp-tools:read',
  writePermission: 'mcp-tools:write',
}

export const ADMIN_MCP_SERVER_CONFIG: McpServerConfig = {
  serverName: 'voucha-admin-mcp',
  routePath: '/api/v1/admin/mcp',
  surface: 'admin_mcp',
  readPermission: 'mcp-admin-tools:read',
  writePermission: 'mcp-admin-tools:write',
}
