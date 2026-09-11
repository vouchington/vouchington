import { getPrivateUserByAny, getPrivateUserByIdOrSlug } from './get.mts'
import assert from 'http-assert'
import type { PrivateUser, UpdateUserOptions } from './types.mts'
import { currentUserCanUpdateUser } from './authorization.mts'
import { updateUserFields } from './update-fields.mts'

export const updateUser = async (
  currentUser: PrivateUser | null,
  idOrSlug: string,
  changes: UpdateUserOptions,
) => {
  const user = await getPrivateUserByIdOrSlug(idOrSlug)
  assert(user, 404, 'User not found')
  assert(currentUserCanUpdateUser(currentUser, user), 403, 'Forbidden')

  await updateUserFields(user.id, changes)

  return getPrivateUserByAny(user.id)
}
