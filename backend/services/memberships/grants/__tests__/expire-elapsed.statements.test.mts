import { describe, expect, it } from 'vitest'
import {
  createTestSku,
  createTestUser,
  updateTestMembershipExpiresAt,
  createTestAdminGrantMembership,
} from '@voucha/test-helpers'
import { createTestHistoricalQueuedGrant } from '@voucha/test-helpers/entities/membership-historical-grants'
import { profileTestMembershipExpiry } from '@voucha/test-helpers/entities/membership-expiry-profile'
import { expireElapsedMemberships } from '../expire-elapsed.mts'

describe('membership expiry page statements', () => {
  it('drains a FIFO chain with the same statement budget at both page-size bounds', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const first = await createTestAdminGrantMembership({
      grantedById: admin.id,
      productId: sku.id,
      userId: member.id,
    })
    const queued = [
      await createTestHistoricalQueuedGrant(member.id, sku.id),
      await createTestHistoricalQueuedGrant(member.id, sku.id),
    ].toSorted()
    await updateTestMembershipExpiresAt(first.id, new Date('2020-01-01T00:00:00Z'))

    const small = await profileTestMembershipExpiry(member.id, query =>
      expireElapsedMemberships(member.id, query, { limits: { batchSize: 1, maxBatches: 10 } }),
    )
    const large = await profileTestMembershipExpiry(member.id, query =>
      expireElapsedMemberships(member.id, query, { limits: { batchSize: 5000, maxBatches: 10 } }),
    )
    for (const page of [small, large]) {
      expect(page.result).toEqual({ expired: 3, hasMore: false })
      // The committed fixture records its first history row as source_observed, not admin_grant.
      expect(page.history.map(row => row.change_type)).toEqual([
        'source_observed',
        'expiration',
        'admin_grant',
        'expiration',
        'admin_grant',
        'expiration',
      ])
      const expirations = page.history.filter(row => row.change_type === 'expiration')
      expect(expirations.slice(1).map(row => row.membership_grant_id)).toEqual(queued)
      expect(expirations.every(row => row.latest)).toBe(true)
      // The fixture's source_observed row has no entitlement effect; every later change has one.
      expect(page.history.map(row => row.effects)).toEqual([0, 1, 1, 1, 1, 1])
      expect(
        page.queries.filter(query => query.text.includes('/* recordMembershipChanges */')),
      ).toHaveLength(3)
    }
    expect(large.queries.length).toBe(small.queries.length)
  })
})
