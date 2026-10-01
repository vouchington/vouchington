import type { BasicUser, PrivateUser } from '@services/users/types'
import { assertNotSuspended, getPrivateUserByAny } from '@services/users'
import createHttpError from 'http-errors'

export async function requirePrivateToolUser(currentUser: BasicUser): Promise<PrivateUser> {
  const privateUser = await getPrivateUserByAny(currentUser.id, { readOnly: false })
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
