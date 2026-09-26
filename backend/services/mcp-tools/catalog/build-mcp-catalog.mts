import { toolToMcpTool, type McpToolShape } from '@voucha/tools/registry/adapters'
import {
  getToolRequiredScopes,
  isToolMcpEligible,
  listToolsForSurface,
} from '@voucha/tools/registry/select'
import type { Tool, ToolApiEndpoint, ToolMeta } from '@voucha/tools/types'
import {
  ADMIN_MCP_SERVER_CONFIG,
  USER_MCP_SERVER_CONFIG,
  type McpServerConfig,
} from '../config.mts'

export type McpCatalogTool = {
  // Exactly what the server's `tools/list` returns for a caller who passes every gate.
  tool: McpToolShape
  // Minimum membership plan; present only on the user server, where plan gating applies.
  plan?: NonNullable<ToolMeta['plan']>
  // Roles that may list the tool, or null when any authenticated user may.
  roles: string[] | null
  api: readonly ToolApiEndpoint[] | null
}

export type McpCatalogServer = {
  name: string
  path: string
  surface: McpServerConfig['surface']
  tools: McpCatalogTool[]
}

export type McpCatalog = { servers: McpCatalogServer[] }

export type OpenApiPaths = { paths: Partial<Record<string, Partial<Record<string, unknown>>>> }

export type MissingApiOperation = ToolApiEndpoint & { tool: string }

export function buildMcpCatalog(tools: readonly Tool[]): McpCatalog {
  return {
    servers: [USER_MCP_SERVER_CONFIG, ADMIN_MCP_SERVER_CONFIG].map(config => ({
      name: config.serverName,
      path: config.routePath,
      surface: config.surface,
      tools: listToolsForSurface(config.surface, tools).flatMap(tool =>
        isToolMcpEligible(tool) && getToolRequiredScopes(tool, config.surface) !== null
          ? [catalogTool(tool, config.surface)]
          : [],
      ),
    })),
  }
}

export function findMissingApiOperations(
  tools: readonly Tool[],
  openapi: OpenApiPaths,
): MissingApiOperation[] {
  return tools.flatMap(tool =>
    (tool.meta?.api ?? [])
      .filter(
        ({ method, path }) =>
          openapi.paths[toOpenApiPath(path)]?.[method.toLowerCase()] === undefined,
      )
      .map(endpoint => ({ tool: tool.schema.name, ...endpoint })),
  )
}

function catalogTool(tool: Tool, surface: McpServerConfig['surface']): McpCatalogTool {
  return {
    tool: toolToMcpTool(tool, surface),
    ...(surface === 'mcp' ? { plan: tool.meta?.plan ?? 'free' } : {}),
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

function toOpenApiPath(path: string): string {
  return path.replaceAll(/:([A-Za-z_]\w*)/g, '{$1}')
}
