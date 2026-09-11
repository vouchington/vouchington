import type { Tool, ToolSurface } from '../types.mts'

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
