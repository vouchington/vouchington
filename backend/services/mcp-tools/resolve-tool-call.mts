import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import {
  getToolRequiredScopes,
  isToolAllowedForPlan,
  isToolMcpEligible,
  listToolsForSurface,
} from '@voucha/tools/registry/select'
import type { Tool } from '@voucha/tools/types'
import { hasEveryScope, withScopePrerequisites, type ApiScope } from '@modules/scopes'
import { isToolAllowedForUser } from './authorization.mts'
import type { McpServerConfig } from './config.mts'

type UserForToolAuthorization = {
  id: string
  roles: readonly string[]
  membership_plan: 'plus' | 'pro' | null
}

export type McpToolAuthorization =
  | { status: 'role_denied' }
  | { status: 'plan_denied' }
  | { status: 'scopes_undeclared' }
  | { status: 'insufficient_scope'; requiredScopes: ApiScope[] }
  | { status: 'allowed'; tool: Tool }

export type McpToolCallResolution = { status: 'not_found' } | McpToolAuthorization

// The single ordered policy for listing and calling MCP tools: role, then plan, then scopes.
export function authorizeMcpTool(
  tool: Tool,
  user: UserForToolAuthorization,
  grantedScopes: readonly ApiScope[],
  config: McpServerConfig,
): McpToolAuthorization {
  if (!isToolAllowedForUser(tool, user)) return { status: 'role_denied' }
  if (!isToolAllowedForPlan(tool, user)) return { status: 'plan_denied' }
  const requiredScopes = getToolRequiredScopes(tool, config.surface)
  if (requiredScopes == null) return { status: 'scopes_undeclared' }
  if (!hasEveryScope(grantedScopes, requiredScopes)) {
    return { status: 'insufficient_scope', requiredScopes }
  }
  return { status: 'allowed', tool }
}

export function resolveMcpToolCall(
  toolName: string,
  user: UserForToolAuthorization,
  grantedScopes: readonly ApiScope[],
  config: McpServerConfig,
): McpToolCallResolution {
  const tool = listToolsForSurface(config.surface, ALL_TOOLS).find(
    candidate => candidate.schema.name === toolName,
  )
  if (!tool || !isToolMcpEligible(tool)) return { status: 'not_found' }
  return authorizeMcpTool(tool, user, grantedScopes, config)
}

// Returns the scopes to request on step-up when a single tools/call fails only on scope. The union
// with the granted scopes keeps re-consent from dropping permissions the grant already holds.
// callMcpTool still enforces scopes on every call, including each member of a batch.
export function findMcpStepUpScopes(
  parsedBody: unknown,
  user: UserForToolAuthorization,
  grantedScopes: readonly ApiScope[],
  config: McpServerConfig,
): ApiScope[] | null {
  const request = CallToolRequestSchema.safeParse(parsedBody)
  if (!request.success) return null
  const resolution = resolveMcpToolCall(request.data.params.name, user, grantedScopes, config)
  if (resolution.status !== 'insufficient_scope') return null
  return withScopePrerequisites([...grantedScopes, ...resolution.requiredScopes])
}
