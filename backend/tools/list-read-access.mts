import { isUUID } from '@modules/utils'
import { currentUserCanViewList, getListForWrite, type List } from '@services/lists'
import type { ToolInvocationContext } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'

/**
 * The exact grant that already stands for "this credential may touch my own private data": the
 * entity-relation write tools demand it before they relate a private post of the owner. A list
 * read reuses it instead of inventing a second private-read scope. `mcp.user:write` does not
 * imply it (it is `requiresExactGrant`), so a broad credential never reads a private list.
 */
export const OWNED_PRIVATE_GRANT = 'post-relations.owned-private:write'

/**
 * Whether this call carries the owned-private grant for the account it acts as. Only trusted MCP
 * dispatch builds the invocation context, so a direct call without one, or a credential that
 * belongs to somebody else, never has it. Unlike the delegated write tools this answers false
 * instead of throwing, so a read cannot tell a missing grant from a missing list.
 */
export function hasOwnedPrivateGrant(
  currentUser: BasicUser,
  invocationContext: ToolInvocationContext | undefined,
): boolean {
  return (
    invocationContext !== undefined &&
    invocationContext.credentialOwnerId === currentUser.id &&
    invocationContext.grantedScopes.includes(OWNED_PRIVATE_GRANT)
  )
}

/**
 * The list an MCP caller may read, or null when every denial answers alike.
 *
 * A public or unlisted list is readable by anyone who has its id, as on the REST routes
 * (`currentUserCanViewList` for a signed-out reader). A private list is readable only by its
 * owner and only with the owned-private grant. Nothing else changes the answer: another user's
 * private list id, a removed list, a malformed id and a missing grant all return null.
 */
export async function loadReadableList(
  currentUser: BasicUser,
  listId: string,
  invocationContext: ToolInvocationContext | undefined,
): Promise<List | null> {
  if (!isUUID(listId)) return null
  const list = await getListForWrite(listId)
  if (!list) return null
  if (currentUserCanViewList(null, list)) return list
  const ownerWithGrant =
    hasOwnedPrivateGrant(currentUser, invocationContext) &&
    currentUserCanViewList(currentUser.id, list)
  return ownerWithGrant ? list : null
}
