import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestUserWarning,
  getUserWarningRevokedAtForTest,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { revokeUserWarning } from '../revoke.mts'

describe('revokeUserWarning', () => {
  let staff: PrivateUser
  let target: PrivateUser

  beforeAll(async () => {
    ;[staff, target] = await Promise.all([createTestUser(), createTestUser()])
  })

  it('sets revoked_at on an active warning', async () => {
    const warning = await insertTestUserWarning({
      userId: target.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    expect(warning.revoked_at).toBeNull()

    await revokeUserWarning(staff.id, warning.id)

    const revokedAt = await getUserWarningRevokedAtForTest(warning.id)
    expect(revokedAt).not.toBeNull()
    expect(revokedAt).toBeInstanceOf(Date)
  })

  it('is idempotent — revoking twice does not throw', async () => {
    const warning = await insertTestUserWarning({
      userId: target.id,
      issuedById: staff.id,
      reason: 'harassment',
    })
    await revokeUserWarning(staff.id, warning.id)
    await expect(revokeUserWarning(staff.id, warning.id)).resolves.toBeUndefined()
  })
})
