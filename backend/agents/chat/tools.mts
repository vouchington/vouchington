import { buildAgentTools, type SubagentToolCurryArgs } from '@agents/_shared'
import { discoveryAgentTool } from '@agents/discovery-agent'
import { profileAgentTool } from '@agents/profile-agent'
import { researchAgentTool } from '@agents/research-agent'
import type { PrivateUser } from '@services/users/types'
import type { AgentTool } from '@services/openai-agents'
import getMyProfileTool from '@voucha/tools/get-my-profile'
import searchTopicsTool from '@voucha/tools/search-topics'

export function buildChatAgentTools(
  currentUser: PrivateUser,
  subagentCurryArgs: SubagentToolCurryArgs,
): AgentTool[] {
  return buildAgentTools(currentUser, [
    { tool: researchAgentTool, curryArgs: subagentCurryArgs },
    { tool: profileAgentTool, curryArgs: subagentCurryArgs },
    { tool: discoveryAgentTool, curryArgs: subagentCurryArgs },
    searchTopicsTool,
    getMyProfileTool,
  ]).agentTools
}
