import { describe, expect, it } from 'vitest'
import {
  createTestAdminGrantMembership,
  createTestSku,
  createTestUser,
  getTestGrantQueue,
  insertQueuedMembershipGrant,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { createTestHistoricalQueuedGrant } from '@voucha/test-helpers/entities/membership-historical-grants'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { withPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { profileTestMembershipExpiry } from '@voucha/test-helpers/entities/membership-expiry-profile'
import { membershipWorkConfig } from '../work-limits.mts'
import { getMembershipByUserId, getMembershipHistory } from '../get.mts'
import { expireElapsedMemberships } from './expire-elapsed.mts'
import { expireElapsedMembershipsForUsers } from './expire-elapsed-batch.mts'

describe('membership expiry run budget', () => {
  it.each([
    [1, 1, true],
    [2, 2, false],
  ] as const)(
    'expires a future-cutoff grant chain with a %i-page budget',
    async (maxBatches, expectedExpired, hasMore) => {
      const admin = await createTestUser({ administrator: true })
      const member = await createTestUser()
      const sku = await createTestSku({ plan: 'plus' })
      const first = await createTestAdminGrantMembership({
        grantedById: admin.id,
        productId: sku.id,
        userId: member.id,
      })
      const secondGrantId = await insertQueuedMembershipGrant({
        grantedById: admin.id,
        productId: sku.id,
        userId: member.id,
        durationDays: 30,
      })
      await expect(getTestGrantQueue(member.id)).resolves.toMatchObject({
        active_grant_ids: [first.grantId],
        grant_ids: [first.grantId, secondGrantId],
      })
      // The fixture grant is open-ended, so give it the 30-day term the writer would have set.
      await updateTestMembershipExpiresAt(first.id, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
      const current = await getMembershipByUserId(member.id)
      if (!current?.expires_at) throw new Error('Expected a live grant expiry')
      const expiresThrough = new Date(current.expires_at.getTime() + 62 * 24 * 60 * 60 * 1000)
      let pages = 0
      const page = await profileTestMembershipExpiry(member.id, query =>
        expireElapsedMemberships(member.id, query, {
          expiresThrough,
          requireComplete: false,
          limits: { batchSize: 100, maxBatches },
          onPage: () => {
            pages++
          },
        }),
      )
      expect(page.result).toEqual({ expired: expectedExpired, hasMore })
      expect(pages).toBe(expectedExpired)
      const expirations = page.history.filter(change => change.change_type === 'expiration')
      expect(expirations.map(change => change.membership_grant_id)).toEqual(
        [first.grantId, secondGrantId].slice(0, expectedExpired),
      )
      expect(expirations.every(change => change.latest && change.effects === 1)).toBe(true)
    },
  )

  it('rolls back incomplete synchronous normalization and commits resumable background pages', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const first = await createTestAdminGrantMembership({
      grantedById: admin.id,
      productId: sku.id,
      userId: member.id,
    })
    await createTestHistoricalQueuedGrant(member.id, sku.id)
    await createTestHistoricalQueuedGrant(member.id, sku.id)
    await updateTestMembershipExpiresAt(first.id, new Date('2020-01-01T00:00:00Z'))
    overrideDynamicConfigFieldsForTest(membershipWorkConfig, {
      batch_size: 1,
      max_batches_per_run: 1,
    })

    await expect(
      withPostgresTransactionForTest(query => expireElapsedMemberships(member.id, query)),
    ).rejects.toMatchObject({ status: 409 })
    expect(
      (await getMembershipHistory(member.id)).results.filter(
        row => row.change_type === 'expiration',
      ),
    ).toHaveLength(0)
    await expect(expireElapsedMembershipsForUsers([member.id])).resolves.toEqual({
      expired: 1,
      hasMore: true,
    })
    await expect(expireElapsedMembershipsForUsers([member.id])).resolves.toEqual({
      expired: 1,
      hasMore: true,
    })
    await expect(expireElapsedMembershipsForUsers([member.id])).resolves.toEqual({
      expired: 1,
      hasMore: false,
    })
    await expect(getMembershipByUserId(member.id)).resolves.toBeNull()
    expect(
      (await getMembershipHistory(member.id)).results.filter(
        row => row.change_type === 'expiration',
      ),
    ).toHaveLength(3)
  })
})
