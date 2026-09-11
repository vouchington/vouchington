import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  createTestUserWithAge,
  createTestUsername,
  createUnonboardedTestUserDirect,
} from '@voucha/test-helpers'
import { withMissingTestPrivateUserRead } from '@voucha/test-helpers/entities/users-readback-failure'
import { createTestUser } from '../test-support.mts'

describe('createTestUser fixture', () => {
  it('creates a user with a generated username by default', async () => {
    const user = await createTestUser()
    expect(user.id).toBeTruthy()
    expect(user.username).toBeTruthy()
  })

  it('attaches a phone number and administrator role when requested', async () => {
    const user = await createTestUser({ phone_number: true, administrator: true })
    expect(user.id).toBeTruthy()
  })

  it('uses the provided username', async () => {
    const username = createTestUsername()
    const user = await createTestUser({ username })
    expect(user.username).toBe(username)
  })

  it('rejects when createTestUserDirect cannot read its inserted user', async () => {
    expect.hasAssertions()
    await expectCreatorToRejectWhenInsertedUserCannotBeRead(
      () => createTestUserDirect({ username: createTestUsername() }),
      'createTestUserDirect could not read the inserted user',
    )
  })

  it('rejects when createUnonboardedTestUserDirect cannot read its inserted user', async () => {
    expect.hasAssertions()
    await expectCreatorToRejectWhenInsertedUserCannotBeRead(
      () => createUnonboardedTestUserDirect({ username: createTestUsername() }),
      'createUnonboardedTestUserDirect could not read the inserted user',
    )
  })

  it('rejects when createTestUserWithAge cannot read its inserted user', async () => {
    expect.hasAssertions()
    await expectCreatorToRejectWhenInsertedUserCannotBeRead(
      () => createTestUserWithAge(0, { username: createTestUsername() }),
      'createTestUserWithAge could not read the inserted user',
    )
  })

  it('rejects when the service fixture cannot read its upserted user', async () => {
    expect.hasAssertions()
    await expectCreatorToRejectWhenInsertedUserCannotBeRead(
      () => createTestUser({ username: createTestUsername() }),
      'createTestUser could not read the upserted user',
    )
  })
})

async function expectCreatorToRejectWhenInsertedUserCannotBeRead(
  operation: () => Promise<unknown>,
  message: string,
): Promise<void> {
  await expect(withMissingTestPrivateUserRead(operation)).rejects.toThrow(message)
}
