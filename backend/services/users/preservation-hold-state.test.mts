import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestUser, hardDeleteTestUser, softDeleteUserAt } from '@voucha/test-helpers'
import { getUserPreservationHoldState, placeUserPreservationHold } from './preservation-holds.mts'

describe('user preservation hold state', () => {
  beforeEach(() => {
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    )
  })

  afterEach(() => vi.unstubAllEnvs())

  it('returns account deletion state and hold history from the locked lifecycle snapshot', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    const hold = await placeUserPreservationHold(admin, user.id, 'matter-state')
    const deletedAt = new Date('2026-09-01T00:00:00.000Z')
    await softDeleteUserAt(user.id, deletedAt)

    await expect(getUserPreservationHoldState(admin, user.id)).resolves.toEqual({
      accountDeletedAt: deletedAt,
      holds: [expect.objectContaining({ id: hold.id })],
    })
  })

  it('returns 404 after the users row has been hard-deleted', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    await hardDeleteTestUser(user.id)

    await expect(getUserPreservationHoldState(admin, user.id)).rejects.toMatchObject({
      status: 404,
    })
  })
})
