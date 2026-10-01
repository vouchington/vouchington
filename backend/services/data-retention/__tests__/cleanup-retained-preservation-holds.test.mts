import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestRetentionWindow,
  createTestUser,
  getTestUserRaw,
  hasTestRetainedIdentityRoot,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import {
  listUserPreservationHolds,
  placeUserPreservationHold,
  releaseUserPreservationHold,
} from '@services/users'
import { cleanupSoftDeletedUsers } from '../cleanup.mts'
import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'

describe('legal preservation holds and final user purge', () => {
  beforeEach(() => {
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('keeps a released hold and the identities it names after the account is hard-deleted', async () => {
    const window = createTestRetentionWindow()
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    await placeUserPreservationHold(admin, user.id, 'matter-purge-1')
    await releaseUserPreservationHold(admin, user.id)

    await softDeleteUserAt(user.id, window.firstEligibleDate)
    await cleanupSoftDeletedUsers(window)
    await cleanupRetainedIdentityRoots(1_000, { user: [user.id] })

    expect(await getTestUserRaw(user.id)).toBeNull()
    expect(await hasTestRetainedIdentityRoot('user', user.id)).toBe(true)
    expect(await listUserPreservationHolds(admin, user.id)).toEqual([
      expect.objectContaining({
        account_user_id: user.id,
        reference: 'matter-purge-1',
        placed_by_id: admin.id,
        released_by_id: admin.id,
        released_at: expect.any(Date),
      }),
    ])
  }, 60_000)
})
