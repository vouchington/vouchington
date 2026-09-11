import assert from 'node:assert'
import { upsertUser } from './create.mts'
import type { PrivateUser } from './types.mts'
import {
  addTestUserRole,
  attachTestPhoneNumber,
  createRandomEmailAddress,
  createTestUsername,
  getTestPhoneNumber,
  getTestPrivateUserById,
  updateUserUsername,
} from '@voucha/test-helpers'
import { v7 } from 'uuid'

export type CreateTestUserOptions = {
  phone_number?: string | boolean
  administrator?: boolean
  extraRoles?: string[]
  username?: string
  noUsername?: boolean
}

/**
 * Real, full-behavior test-user fixture: goes through the actual `upsertUser` write path
 * (OAuth/attribution linking, consent grants, entity-listener enqueues such as
 * `enqueueOnUserCreated`/`enqueueAutoFollowReferrer`). Reserved for fixtures that assert on
 * those side effects; consumers that only need a row should use the raw
 * `createTestUser`/`createTestUserDirect` helpers in `@voucha/test-helpers` instead, which do
 * not carry this package as a dependency.
 */
export async function createTestUser(options: CreateTestUserOptions = {}): Promise<PrivateUser> {
  const user = await upsertUser({
    emailAddress: createRandomEmailAddress(),
    sessionId: v7(),
    deviceId: v7(),
  })
  assert(user, 'User not created')

  const phoneNumber = getTestPhoneNumber(options.phone_number)
  if (phoneNumber) {
    await attachTestPhoneNumber(user.id, phoneNumber)
  }

  if (options.administrator) {
    await addTestUserRole(user.id, 'administrator')
  }
  await Promise.all((options.extraRoles ?? []).map(roleSlug => addTestUserRole(user.id, roleSlug)))

  if (options.username) {
    await updateUserUsername(user.id, options.username)
  } else if (!options.noUsername) {
    await updateUserUsername(user.id, createTestUsername())
  }

  const privateUser = await getTestPrivateUserById(user.id)
  assert(privateUser, 'createTestUser could not read the upserted user')
  return privateUser
}
