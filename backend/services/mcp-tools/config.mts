import {
  OAUTH_PROTECTED_RESOURCE_PATHS,
  type OAuthResourceAudience,
} from '@services/oauth-authorization-server/resources'

export type McpServerConfig = {
  audience: OAuthResourceAudience
  serverName: string
  routePath: (typeof OAUTH_PROTECTED_RESOURCE_PATHS)[OAuthResourceAudience]
  // Whether a long-lived API key may authenticate to this audience.
  acceptsApiKeys: boolean
  // Whether every request writes durable per-call audit records before it runs.
  auditCalls: boolean
}

export const USER_MCP_SERVER_CONFIG: McpServerConfig = {
  audience: 'user',
  serverName: 'voucha-user-mcp',
  routePath: OAUTH_PROTECTED_RESOURCE_PATHS.user,
  acceptsApiKeys: true,
  auditCalls: true,
}

export const ADMIN_MCP_SERVER_CONFIG: McpServerConfig = {
  audience: 'admin',
  serverName: 'voucha-admin-mcp',
  routePath: OAUTH_PROTECTED_RESOURCE_PATHS.admin,
  acceptsApiKeys: false,
  auditCalls: true,
}

export const COMMUNITY_MODERATION_MCP_SERVER_CONFIG: McpServerConfig = {
  audience: 'community_moderation',
  serverName: 'voucha-community-moderation-mcp',
  routePath: OAUTH_PROTECTED_RESOURCE_PATHS.community_moderation,
  acceptsApiKeys: true,
  auditCalls: true,
}

export const BRAND_MCP_SERVER_CONFIG: McpServerConfig = {
  audience: 'brand',
  serverName: 'voucha-brand-mcp',
  routePath: OAUTH_PROTECTED_RESOURCE_PATHS.brand,
  acceptsApiKeys: true,
  auditCalls: true,
}

export const LEGAL_MCP_SERVER_CONFIG: McpServerConfig = {
  audience: 'legal',
  serverName: 'voucha-legal-mcp',
  routePath: OAUTH_PROTECTED_RESOURCE_PATHS.legal,
  acceptsApiKeys: false,
  auditCalls: true,
}

export const ALL_MCP_SERVER_CONFIGS: readonly McpServerConfig[] = [
  USER_MCP_SERVER_CONFIG,
  COMMUNITY_MODERATION_MCP_SERVER_CONFIG,
  BRAND_MCP_SERVER_CONFIG,
  ADMIN_MCP_SERVER_CONFIG,
  LEGAL_MCP_SERVER_CONFIG,
]

export const MOUNTED_MCP_SERVER_CONFIGS = ALL_MCP_SERVER_CONFIGS.filter(
  config => config.audience !== 'brand',
)
