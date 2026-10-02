import createHttpError from 'http-errors'
import type { EntityRelationActionAuthority } from '@services/entity-relation-actions'
import type { PrivateUser } from '@services/users/types'
import type { ToolInvocationContext } from '@services/openai-agents/tool-types'

/**
 * The authority of a credential-delegated tool call. Only trusted MCP dispatch builds the context,
 * so a call without one, or one whose credential belongs to somebody else, is refused outright.
 */
export function getDelegatedToolAuthority(
  currentUser: PrivateUser,
  invocationContext: ToolInvocationContext | undefined,
): EntityRelationActionAuthority {
  if (!invocationContext) throw createHttpError(403, 'Delegated tool context is required')
  if (invocationContext.credentialOwnerId !== currentUser.id)
    throw createHttpError(403, 'Forbidden')
  return {
    kind: 'delegated',
    credentialOwnerId: invocationContext.credentialOwnerId,
    grantedScopes: invocationContext.grantedScopes,
  }
}
