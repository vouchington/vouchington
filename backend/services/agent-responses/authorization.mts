import { createCodedError } from '@modules/on-error/create-coded-error'
import { FORBIDDEN } from '@modules/on-error/error-codes'
import type { AgentResponseRecord } from './types.mts'

type UserForAuth = { id: string; roles: readonly string[] }

export function currentUserCanViewAgentResponse(
  agentResponse: AgentResponseRecord,
  user: UserForAuth,
): boolean {
  return (
    agentResponse.created_by_id === user.id ||
    user.roles.includes('administrator') ||
    user.roles.includes('staff')
  )
}

export function assertCurrentUserCanViewAgentResponse(
  agentResponse: AgentResponseRecord,
  user: UserForAuth,
): void {
  if (!currentUserCanViewAgentResponse(agentResponse, user)) {
    throw createCodedError(403, `Access denied to agent response ${agentResponse.id}`, FORBIDDEN)
  }
}
