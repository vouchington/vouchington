import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { updateUserFields } from '../update-fields.mts'
import { getPrivateUserByAny } from '../get.mts'
import type { PrivateUser } from '../types.mts'

describe('processing_restricted_at', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('sets processing_restricted_at when enabled', async () => {
    await updateUserFields(user.id, { processing_restricted_at: true })
    const updated = await getPrivateUserByAny(user.id)
    expect(updated?.processing_restricted_at).not.toBeNull()
    expect(updated?.processing_restricted_at).toBeInstanceOf(Date)
  })

  it('clears processing_restricted_at when disabled', async () => {
    await updateUserFields(user.id, { processing_restricted_at: true })
    await updateUserFields(user.id, { processing_restricted_at: false })
    const updated = await getPrivateUserByAny(user.id)
    expect(updated?.processing_restricted_at).toBeNull()
  })
})
