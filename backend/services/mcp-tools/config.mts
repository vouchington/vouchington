import {
  OAUTH_PROTECTED_RESOURCE_PATHS,
  type OAuthResourceAudience,
} from '@services/oauth-authorization-server'
import type { ToolSurface } from '@voucha/tools/types'

export type McpServerConfig = {
  audience: OAuthResourceAudience
  serverName: string
  routePath: (typeof OAUTH_PROTECTED_RESOURCE_PATHS)[OAuthResourceAudience]
  surface: Extract<ToolSurface, 'mcp' | 'admin_mcp'>
}

export const USER_MCP_SERVER_CONFIG: McpServerConfig = {
  audience: 'user',
  serverName: 'voucha-user-mcp',
  routePath: OAUTH_PROTECTED_RESOURCE_PATHS.user,
  surface: 'mcp',
}

export const ADMIN_MCP_SERVER_CONFIG: McpServerConfig = {
  audience: 'admin',
  serverName: 'voucha-admin-mcp',
  routePath: OAUTH_PROTECTED_RESOURCE_PATHS.admin,
  surface: 'admin_mcp',
}
