import {
  listToolsForSurface,
  isToolMcpEligible,
  isToolAllowedForPlan,
} from '@voucha/tools/registry/select'
import { isToolAllowedForUser } from './authorization.mts'
import { toolToMcpTool, type McpToolShape } from '@voucha/tools/registry/adapters'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import type { McpServerConfig } from './config.mts'
import { hasScope, type ApiScope } from '@modules/scopes'

type UserForListing = {
  id: string
  roles: readonly string[]
  membership_plan: 'plus' | 'pro' | null
}

type UserForMcpContext = {
  id: string
  username?: string | null
  roles: readonly string[]
  profile_image_id?: string | null
  membership_plan?: 'plus' | 'pro' | null
}

export function buildMcpContextUser(owner: UserForMcpContext): {
  __entity_type: 'user'
  id: string
  username?: string
  roles: readonly string[]
  profile_image_id?: string
  membership_plan: 'plus' | 'pro' | null
} {
  return {
    __entity_type: 'user',
    id: owner.id,
    username: owner.username ?? undefined,
    roles: owner.roles,
    profile_image_id: owner.profile_image_id ?? undefined,
    membership_plan: (owner.membership_plan ?? null) as 'plus' | 'pro' | null,
  }
}

export function listMcpToolsForUser(
  user: UserForListing,
  permissions: readonly ApiScope[],
  config: McpServerConfig,
): McpToolShape[] {
  const mcpTools = listToolsForSurface(config.surface, ALL_TOOLS).filter(tool =>
    isToolMcpEligible(tool),
  )
  const hasWrite = hasScope(permissions, config.writePermission)

  const result: McpToolShape[] = []
  for (const tool of mcpTools) {
    if (!isToolAllowedForUser(tool, user)) continue
    if (!isToolAllowedForPlan(tool, user)) continue
    const isReadOnly = tool.meta?.annotations?.readOnlyHint === true
    if (!isReadOnly && !hasWrite) continue
    result.push(toolToMcpTool(tool))
  }
  return result
}
