import type { ToolSurface } from '@voucha/tools/types'

export type McpServerConfig = {
  serverName: string
  routePath: string
  surface: Extract<ToolSurface, 'mcp' | 'admin_mcp'>
}

export const USER_MCP_SERVER_CONFIG: McpServerConfig = {
  serverName: 'voucha-user-mcp',
  routePath: '/api/v1/mcp',
  surface: 'mcp',
}

export const ADMIN_MCP_SERVER_CONFIG: McpServerConfig = {
  serverName: 'voucha-admin-mcp',
  routePath: '/api/v1/admin/mcp',
  surface: 'admin_mcp',
}
