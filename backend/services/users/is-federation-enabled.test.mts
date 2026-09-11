import { describe, it, expect } from 'vitest'
import { isFederationEnabledForUser } from './is-federation-enabled.mts'
import { updateUserFields } from './update-fields.mts'
import { createTestUserDirect } from '@voucha/test-helpers'
import { v7 } from 'uuid'

describe('isFederationEnabledForUser', () => {
  it('returns false by default for a new user', async () => {
    const user = await createTestUserDirect()
    expect(await isFederationEnabledForUser(user.id)).toBe(false)
  })

  it('returns true once the user opts in', async () => {
    const user = await createTestUserDirect()
    await updateUserFields(user.id, { fediverse_federation_enabled: true })
    expect(await isFederationEnabledForUser(user.id)).toBe(true)
  })

  it('returns false for a non-existent user id', async () => {
    expect(await isFederationEnabledForUser(v7())).toBe(false)
  })
})
