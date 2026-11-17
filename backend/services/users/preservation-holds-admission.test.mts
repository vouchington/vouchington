import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestUser, getModeratorActionRowsForTest, safeUsername } from '@voucha/test-helpers'
import { readCopyrightCasePurgeFixtureAccountClock } from '@voucha/test-helpers/services/copyright-notices/retention-case-purge-fixture'
import { deleteUser } from './delete.mts'
import {
  getUserPreservationHoldState,
  placeUserPreservationHold,
  releaseUserPreservationHold,
} from './preservation-holds.mts'

async function listUserPreservationHolds(...args: Parameters<typeof getUserPreservationHoldState>) {
  return (await getUserPreservationHoldState(...args)).holds
}

describe('preservation hold admission outcomes', () => {
  beforeEach(() => {
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    )
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })
  it('canonicalizes an uppercase UUID before placing a hold', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()

    const before = await readCopyrightCasePurgeFixtureAccountClock(user.id)
    const placed = await placeUserPreservationHold(admin, user.id.toUpperCase(), 'matter-uppercase')
    expect(placed.account_user_id).toBe(user.id)
    const placedAccountIds = (await listUserPreservationHolds(admin, user.id)).map(
      hold => hold.account_user_id,
    )
    expect(placedAccountIds).toEqual([user.id])
    expect(await readCopyrightCasePurgeFixtureAccountClock(user.id)).toEqual(before)
    expect(await getModeratorActionRowsForTest({ targetUserId: user.id })).toHaveLength(1)
  })

  describe('preservation hold reference confidentiality', () => {
    it('never writes the reference to the console or to the audit log', async () => {
      const admin = await createTestUser({ administrator: true })
      const user = await createTestUser({ username: safeUsername('hold-confidential') })
      const secret = 'synthetic confidential reference'
      const spies = (['debug', 'error', 'info', 'log', 'warn'] as const).map(method =>
        vi.spyOn(console, method).mockReturnValue(undefined),
      )

      const before = await readCopyrightCasePurgeFixtureAccountClock(user.id)
      await placeUserPreservationHold(admin, user.id, secret)
      expect(await listUserPreservationHolds(admin, user.id)).toEqual([
        expect.objectContaining({ account_user_id: user.id, reference: secret, released_at: null }),
      ])
      await releaseUserPreservationHold(admin, user.id)
      await deleteUser(user, user)
      expect(await listUserPreservationHolds(admin, user.id)).toEqual([
        expect.objectContaining({
          account_user_id: user.id,
          reference: secret,
          released_at: expect.any(Date),
        }),
      ])
      expect(await readCopyrightCasePurgeFixtureAccountClock(user.id)).toEqual(before)

      const logged = JSON.stringify(spies.flatMap(spy => spy.mock.calls))
      expect(logged).not.toContain(secret)
      const audit = await getModeratorActionRowsForTest({ targetUserId: user.id })
      expect(JSON.stringify(audit)).not.toContain(secret)
      expect(audit).toHaveLength(2)
      for (const spy of spies) spy.mockRestore()
    })
  })
})
