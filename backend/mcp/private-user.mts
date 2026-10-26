import type { BasicUser, PrivateUser } from '@services/users/types'
import { assertNotSuspended, getPrivateUserByAny } from '@services/users'
import { getRequestCurrentUser, setRequestCurrentUser } from '@modules/utils/request-context'
import createHttpError from 'http-errors'

/** Transport authentication precedes body, quota and audit work; hydrate once per tools/call. */
export async function requirePrivateToolUser(currentUser: BasicUser): Promise<PrivateUser> {
  const stored = getRequestCurrentUser<PrivateUser>()
  if (stored?.id === currentUser.id) {
    const authorized = withAuthenticatedRoles(stored, currentUser)
    if (authorized !== stored) setRequestCurrentUser(authorized)
    return authorized
  }
  const privateUser = await getPrivateUserByAny(currentUser.id, { readOnly: false })
  if (!privateUser) {
    throw createHttpError(401, 'Tool current user not found')
  }
  const authorized = withAuthenticatedRoles(privateUser, currentUser)
  setRequestCurrentUser(authorized)
  return authorized
}

/** Hydration can remove a role but cannot restore one filtered by MCP transport admission. */
function withAuthenticatedRoles(privateUser: PrivateUser, currentUser: BasicUser): PrivateUser {
  const roles = privateUser.roles.filter(role => currentUser.roles.includes(role))
  return roles.length === privateUser.roles.length ? privateUser : { ...privateUser, roles }
}

/** The caller of a write tool, refused before any mutation when the account is suspended. */
export async function requireActiveToolUser(currentUser: BasicUser): Promise<PrivateUser> {
  const privateUser = await requirePrivateToolUser(currentUser)
  assertNotSuspended(privateUser)
  return privateUser
}
