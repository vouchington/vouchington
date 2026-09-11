import {
  getAgentBySystemUserId,
  getActiveAgentPromptByAgentId,
  type AgentPrompt,
} from '@services/agents'
import { getSystemUserByUsername } from '@services/users/system-users'

export async function getActiveAutotaggerPrompt(): Promise<AgentPrompt | null> {
  // Get the autotagger system user
  const autotaggerUser = await getSystemUserByUsername('autotagger')
  if (!autotaggerUser) {
    throw new Error('Autotagger system user not found')
  }

  // Get the autotagger agent
  const agent = await getAgentBySystemUserId(autotaggerUser.id)
  if (!agent) {
    return null
  }

  // Get the active prompt for this agent
  return getActiveAgentPromptByAgentId(agent.id)
}
