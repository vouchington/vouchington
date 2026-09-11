import { describe, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import assert from 'node:assert'
import { getPrivateUserByAny } from '../get.mts'
import { updateUserFields } from '../update-fields.mts'

describe('updateUserFields fediverse federation opt-in', () => {
  it('defaults to false for a newly created user', async () => {
    const testUser = await createTestUser()
    assert.strictEqual(testUser.fediverse_federation_enabled, false)
  })

  it('opts a user in to federation', async () => {
    const testUser = await createTestUser()
    await updateUserFields(testUser.id, { fediverse_federation_enabled: true })
    const updated = await getPrivateUserByAny(testUser.id)
    assert(updated)
    assert.strictEqual(updated.fediverse_federation_enabled, true)
  })

  it('opts a user back out of federation', async () => {
    const testUser = await createTestUser()
    await updateUserFields(testUser.id, { fediverse_federation_enabled: true })
    await updateUserFields(testUser.id, { fediverse_federation_enabled: false })
    const updated = await getPrivateUserByAny(testUser.id)
    assert(updated)
    assert.strictEqual(updated.fediverse_federation_enabled, false)
  })

  it('rejects a non-boolean value', async () => {
    const testUser = await createTestUser()
    await assert.rejects(
      () =>
        updateUserFields(testUser.id, {
          fediverse_federation_enabled: 'yes' as unknown as Parameters<
            typeof updateUserFields
          >[1]['fediverse_federation_enabled'],
        }),
      (err: Error & { status?: number }) => {
        assert.strictEqual(err.status, 422)
        return true
      },
    )
  })
})
