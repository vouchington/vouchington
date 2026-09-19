import type { ToolSurface } from '@voucha/tools/types'
import type { ApiScope } from '@modules/scopes'

export type McpServerConfig = {
  serverName: string
  routePath: string
  surface: ToolSurface
  readPermission: ApiScope
  writePermission: ApiScope
}

export const USER_MCP_SERVER_CONFIG: McpServerConfig = {
  serverName: 'voucha-user-mcp',
  routePath: '/api/v1/mcp',
  surface: 'mcp',
  readPermission: 'mcp.user:read',
  writePermission: 'mcp.user:write',
}

export const ADMIN_MCP_SERVER_CONFIG: McpServerConfig = {
  serverName: 'voucha-admin-mcp',
  routePath: '/api/v1/admin/mcp',
  surface: 'admin_mcp',
  readPermission: 'mcp.admin:read',
  writePermission: 'mcp.admin:write',
}
