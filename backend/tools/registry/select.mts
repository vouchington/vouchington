import type { Tool, ToolSurface } from '../types.mts'
import { parseApiScope, SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'

type UserForPlanCheck = {
  membership_plan: 'plus' | 'pro' | null
}

export function listToolsForSurface(surface: ToolSurface, tools: readonly Tool[]): Tool[] {
  return tools.filter(tool => {
    const surfaces = tool.meta?.surfaces ?? ['internal']
    return surfaces.includes(surface)
  })
}

// A tool is MCP-eligible if it can be called with a single currentUser argument (arity check).
// Curried tools require extra args at call time and can't be dispatched via MCP.
export function isToolMcpEligible(tool: Tool): boolean {
  return tool.function.length === 1
}

export function isToolAllowedForPlan(tool: Tool, user: UserForPlanCheck): boolean {
  if (tool.meta?.plan == null || tool.meta.plan === 'free') return true
  const plan = user.membership_plan
  if (tool.meta.plan === 'plus') return plan === 'plus' || plan === 'pro'
  if (tool.meta.plan === 'pro') return plan === 'pro'
  return false
}

export function getMcpPlanInvariantViolations(tools: readonly Tool[]): string[] {
  const violations: string[] = []
  for (const tool of tools) {
    const surfaces = tool.meta?.surfaces ?? ['internal']
    const isUserMcpTool = surfaces.includes('mcp')
    const isAdminOnlyMcpTool = surfaces.includes('admin_mcp') && !isUserMcpTool
    const isMutating = tool.meta?.annotations?.readOnlyHint !== true
    const plan = tool.meta?.plan

    if (isUserMcpTool && isMutating && plan !== 'plus' && plan !== 'pro') {
      violations.push(`${tool.schema.name}: user MCP mutations require a plus or pro plan`)
    }
    if (isUserMcpTool && !isMutating && plan != null && plan !== 'free') {
      violations.push(`${tool.schema.name}: user MCP reads cannot require a paid plan`)
    }
    if (isAdminOnlyMcpTool && plan != null) {
      violations.push(`${tool.schema.name}: admin-only MCP tools cannot declare a plan`)
    }
    if (isUserMcpTool && surfaces.includes('admin_mcp') && isMutating) {
      violations.push(`${tool.schema.name}: mutating tools cannot share mcp and admin_mcp surfaces`)
    }
  }
  return violations
}

export function getToolRequiredScopes(
  tool: Tool,
  surface: Extract<ToolSurface, 'mcp' | 'admin_mcp'>,
): ApiScope[] | null {
  const declared = tool.meta?.requiredScopes?.[surface]
  if (declared == null || declared.length === 0) return null

  const expectedAudience = surface === 'mcp' ? 'user' : 'admin'
  const scopes = declared.map(parseApiScope)
  if (
    scopes.some(scope => scope == null) ||
    scopes.some(scope => scope != null && SCOPE_DEFINITIONS[scope].audience !== expectedAudience)
  ) {
    return null
  }
  return scopes as ApiScope[]
}
