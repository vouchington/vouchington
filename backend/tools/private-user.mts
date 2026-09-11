import type { BasicUser, PrivateUser } from '@services/users/types'
import { getPrivateUserByAny } from '@services/users'
import createHttpError from 'http-errors'

export async function requirePrivateToolUser(currentUser: BasicUser): Promise<PrivateUser> {
  const privateUser = await getPrivateUserByAny(currentUser.id, { readOnly: false })
  if (!privateUser) {
    throw createHttpError(401, 'Tool current user not found')
  }
  return privateUser
}
