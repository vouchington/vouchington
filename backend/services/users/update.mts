import { getRequestCurrentUser } from '@modules/utils/request-context'
import { getPrivateUserByIdOrSlug } from './get.mts'
import assert from 'http-assert'
import type { PrivateUser, UpdateUserOptions } from './types.mts'
import { currentUserCanUpdateUser } from './authorization.mts'
import { updateUserFields } from './update-fields.mts'

function actorForUpdate(currentUser: PrivateUser | null, idOrSlug: string): PrivateUser | null {
  const stored = getRequestCurrentUser<PrivateUser>()
  if (stored?.id === idOrSlug) return stored
  if (currentUser?.id === idOrSlug) return currentUser
  return null
}

export const updateUser = async (
  currentUser: PrivateUser | null,
  idOrSlug: string,
  changes: UpdateUserOptions,
) => {
  const user = actorForUpdate(currentUser, idOrSlug) ?? (await getPrivateUserByIdOrSlug(idOrSlug))
  assert(user, 404, 'User not found')
  assert(currentUserCanUpdateUser(currentUser, user), 403, 'Forbidden')
  return (await updateUserFields(user.id, changes, user)) ?? user
}
