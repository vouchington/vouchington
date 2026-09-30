import {
  OAUTH_PROTECTED_RESOURCE_PATHS,
  type OAuthResourceAudience,
} from '@services/oauth-authorization-server/resources'
import type { ToolSurface } from '@voucha/tools/types'

export type McpServerConfig = {
  audience: OAuthResourceAudience
  serverName: string
  routePath: (typeof OAUTH_PROTECTED_RESOURCE_PATHS)[OAuthResourceAudience]
  surface: Extract<ToolSurface, 'mcp' | 'admin_mcp'>
  // Whether a long-lived API key may authenticate to this surface. Admin access is OAuth-only.
  acceptsApiKeys: boolean
  // Whether every request on this surface writes durable per-call audit records before it runs.
  auditCalls: boolean
}

export const USER_MCP_SERVER_CONFIG: McpServerConfig = {
  audience: 'user',
  serverName: 'voucha-user-mcp',
  routePath: OAUTH_PROTECTED_RESOURCE_PATHS.user,
  surface: 'mcp',
  acceptsApiKeys: true,
  auditCalls: false,
}

export const ADMIN_MCP_SERVER_CONFIG: McpServerConfig = {
  audience: 'admin',
  serverName: 'voucha-admin-mcp',
  routePath: OAUTH_PROTECTED_RESOURCE_PATHS.admin,
  surface: 'admin_mcp',
  acceptsApiKeys: false,
  auditCalls: true,
}
