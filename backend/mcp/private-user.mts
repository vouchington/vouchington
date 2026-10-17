import type { BasicUser, PrivateUser } from '@services/users/types'
import { assertNotSuspended, getPrivateUserByAny } from '@services/users'
import createHttpError from 'http-errors'

const INITIAL_PRIVATE_USER = Symbol('initialPrivateToolUser')
type ToolUserWithInitialPrivateUser = BasicUser & {
  [INITIAL_PRIVATE_USER]?: { user: PrivateUser | null }
}

/** One invocation may consume its already-authenticated row; later reads always reload. */
export function createToolUserWithLoadedPrivateUser<T extends BasicUser>(
  currentUser: T,
  loadedUser: PrivateUser,
): T {
  if (currentUser.id !== loadedUser.id) throw new Error('Loaded tool user identity does not match')
  const user: T & ToolUserWithInitialPrivateUser = { ...currentUser }
  Object.defineProperty(user, INITIAL_PRIVATE_USER, { value: { user: loadedUser } })
  return user
}

export async function requirePrivateToolUser(currentUser: BasicUser): Promise<PrivateUser> {
  const initial = (currentUser as ToolUserWithInitialPrivateUser)[INITIAL_PRIVATE_USER]
  const loadedUser = initial?.user
  if (initial) initial.user = null
  const privateUser = loadedUser ?? (await getPrivateUserByAny(currentUser.id, { readOnly: false }))
  if (!privateUser) {
    throw createHttpError(401, 'Tool current user not found')
  }
  return privateUser
}

/** The caller of a write tool, refused before any mutation when the account is suspended. */
export async function requireActiveToolUser(currentUser: BasicUser): Promise<PrivateUser> {
  const privateUser = await requirePrivateToolUser(currentUser)
  assertNotSuspended(privateUser)
  return privateUser
}
