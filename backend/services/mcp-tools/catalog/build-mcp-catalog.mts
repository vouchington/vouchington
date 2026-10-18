import { toolToMcpTool, type McpToolShape } from '@voucha/mcp/registry/adapters'
import {
  getToolRequiredScopes,
  isToolMcpEligible,
  listToolsForAudience,
} from '@voucha/mcp/registry/select'
import type { Tool, ToolApiEndpoint, ToolMeta } from '@services/openai-agents/tool-types'
import { ALL_MCP_SERVER_CONFIGS } from '../config.mts'
import type { OAuthResourceAudience } from '@services/oauth-authorization-server/resources'

export type McpCatalogTool = {
  // Exactly what the server's `tools/list` returns for a caller who passes every gate.
  tool: McpToolShape
  // Minimum membership plan; present only where plan gating applies.
  plan?: NonNullable<ToolMeta['plan']>
  // Roles that may list the tool, or null when any authenticated user may.
  roles: string[] | null
  api: readonly ToolApiEndpoint[] | null
}

export type McpCatalogServer = {
  name: string
  path: string
  audience: OAuthResourceAudience
  tools: McpCatalogTool[]
}

export type McpCatalog = { servers: McpCatalogServer[] }

export function buildMcpCatalog(tools: readonly Tool[]): McpCatalog {
  return {
    servers: ALL_MCP_SERVER_CONFIGS.map(config => ({
      name: config.serverName,
      path: config.routePath,
      audience: config.audience,
      tools: listToolsForAudience(config.audience, tools).flatMap(tool =>
        isToolMcpEligible(tool) && getToolRequiredScopes(tool, config.audience) !== null
          ? [catalogTool(tool, config.audience)]
          : [],
      ),
    })),
  }
}

function catalogTool(tool: Tool, audience: OAuthResourceAudience): McpCatalogTool {
  return {
    tool: toolToMcpTool(tool, audience),
    ...(audience === 'user' || audience === 'community_moderation'
      ? { plan: tool.meta?.plan ?? 'free' }
      : {}),
    roles: grantedRoles(tool),
    api: tool.meta?.api ?? null,
  }
}

// Mirrors isToolAllowedForUser: no role map, or `user: true`, admits every authenticated user.
function grantedRoles(tool: Tool): string[] | null {
  const roles = tool.roles
  if (roles === undefined || roles.user === true) return null
  return Object.keys(roles)
    .filter(role => roles[role] === true)
    .toSorted()
}
