import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestExpiryWindow,
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers'
import { cleanupExpiredOAuthAuthorizations } from './cleanup.mts'

describe('OAuth authorization expiry windows', () => {
  it('deletes rows strictly inside the cleanup window and preserves boundary rows', async () => {
    const window = createTestExpiryWindow()
    const dates = [
      window.beforeLowerBoundDate,
      window.lowerBoundDate,
      window.now,
      window.afterUpperBoundDate,
    ]
    const ids = await Promise.all(
      dates.map(expiresAt => insertTestOAuthAuthorization({ expiresAt })),
    )
    onTestFinished(async () => deleteTestOAuthAuthorizationFixtures({ authorizationIds: ids }))

    await expect(
      cleanupExpiredOAuthAuthorizations({ lowerBoundDate: window.lowerBoundDate, now: window.now }),
    ).resolves.toEqual({ deleted: 2, hasMore: false })
    expect(await getTestOAuthAuthorization(ids[0]!)).not.toBeNull()
    expect(await getTestOAuthAuthorization(ids[1]!)).toBeNull()
    expect(await getTestOAuthAuthorization(ids[2]!)).toBeNull()
    expect(await getTestOAuthAuthorization(ids[3]!)).not.toBeNull()
  })
})
