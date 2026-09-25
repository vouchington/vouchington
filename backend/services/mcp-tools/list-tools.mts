import { listToolsForSurface, isToolMcpEligible } from '@voucha/tools/registry/select'
import { toolToMcpTool, type McpToolShape } from '@voucha/tools/registry/adapters'
import { ALL_TOOLS } from '@voucha/tools/registry/index'
import type { McpServerConfig } from './config.mts'
import type { ApiScope } from '@modules/scopes'
import { authorizeMcpTool } from './resolve-tool-call.mts'

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
  const tools: McpToolShape[] = []
  for (const tool of listToolsForSurface(config.surface, ALL_TOOLS)) {
    if (!isToolMcpEligible(tool)) continue
    if (authorizeMcpTool(tool, user, permissions, config).status !== 'allowed') continue
    tools.push(toolToMcpTool(tool, config.surface))
  }
  return tools
}
