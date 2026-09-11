import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser, safeUsername } from '@voucha/test-helpers'
import { updateUserFields } from '../update-fields.mts'
import type { PrivateUser } from '../types.mts'

describe('updateUserFields - use_display_name_from username validation', () => {
  let userWithoutUsername: PrivateUser
  let userWithUsername: PrivateUser

  beforeAll(async () => {
    userWithoutUsername = await createTestUser({ noUsername: true })
    userWithUsername = await createTestUser({
      username: safeUsername('test-user'),
    })
  })
  it('throws 422 when setting use_display_name_from to username without a username', async () => {
    await expect(
      updateUserFields(userWithoutUsername.id, { use_display_name_from: 'username' }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('allows setting use_display_name_from to username when user has a username', async () => {
    await expect(
      updateUserFields(userWithUsername.id, { use_display_name_from: 'username' }),
    ).resolves.not.toThrow()
  })

  it('allows setting username and use_display_name_from to username together', async () => {
    const newUsername = safeUsername('test-user')
    await expect(
      updateUserFields(userWithoutUsername.id, {
        username: newUsername,
        use_display_name_from: 'username',
      }),
    ).resolves.not.toThrow()
  })
})
