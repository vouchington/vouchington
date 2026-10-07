import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestRetentionWindow,
  createTestUser,
  getTestUserRaw,
  hasTestRetainedIdentityRoot,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { readTestUserPreservationHolds } from '@voucha/test-helpers/user-preservation-holds'
import { placeUserPreservationHold, releaseUserPreservationHold } from '@services/users'
import { cleanupSoftDeletedUsers } from '../cleanup.mts'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'
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

  it('pauses an eligible final purge until the hold is released', async () => {
    const window = createTestRetentionWindow()
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    await softDeleteUserAt(user.id, window.firstEligibleDate)
    await placeUserPreservationHold(admin, user.id, 'matter-purge-pause')

    await expect(
      cleanupSoftDeletedUser(user.id, window.upperBoundDate, window.lowerBoundDate),
    ).resolves.toEqual({ deleted: 0, hasMore: false })
    expect(await getTestUserRaw(user.id)).not.toBeNull()

    await releaseUserPreservationHold(admin, user.id)
    await cleanupSoftDeletedUsers(window)

    expect(await getTestUserRaw(user.id)).toBeNull()
  }, 30_000)

  it('skips a held account in batch selection while purging an eligible sibling', async () => {
    const window = createTestRetentionWindow()
    const admin = await createTestUser({ administrator: true })
    const [held, sibling] = await Promise.all([createTestUser(), createTestUser()])
    await Promise.all([
      softDeleteUserAt(held.id, window.firstEligibleDate),
      softDeleteUserAt(sibling.id, window.firstEligibleDate),
    ])
    await placeUserPreservationHold(admin, held.id, 'matter-purge-batch')

    await cleanupSoftDeletedUsers(window)

    expect(await getTestUserRaw(sibling.id)).toBeNull()
    expect(await getTestUserRaw(held.id)).not.toBeNull()
  }, 30_000)

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
    expect(await readTestUserPreservationHolds(user.id)).toEqual([
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
