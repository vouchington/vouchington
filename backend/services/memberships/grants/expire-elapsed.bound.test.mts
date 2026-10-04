import { describe, expect, it } from 'vitest'
import { createTestUser, createTestSku, updateTestMembershipExpiresAt } from '@voucha/test-helpers'
import { createTestHistoricalQueuedGrant } from '@voucha/test-helpers/entities/membership-historical-grants'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { membershipWorkConfig } from '../work-limits.mts'
import { grantMembership } from '../create.mts'
import { getMembershipByUserId, getMembershipHistory } from '../get.mts'
import { expireElapsedMembershipsForUser } from './expire-elapsed.mts'
import { expireElapsedMembershipsForUsers } from './expire-elapsed-batch.mts'

describe('membership expiry run budget', () => {
  it('rolls back incomplete synchronous normalization and commits resumable background pages', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const first = await grantMembership(admin.id, member.id, 'plus', sku.id, 30)
    await createTestHistoricalQueuedGrant(member.id, sku.id)
    await createTestHistoricalQueuedGrant(member.id, sku.id)
    await updateTestMembershipExpiresAt(first.id, new Date('2020-01-01T00:00:00Z'))
    overrideDynamicConfigFieldsForTest(membershipWorkConfig, {
      batch_size: 1,
      max_batches_per_run: 1,
    })

    await expect(expireElapsedMembershipsForUser(member.id)).rejects.toMatchObject({ status: 409 })
    expect(
      (await getMembershipHistory(member.id)).filter(row => row.change_type === 'expiration'),
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
      (await getMembershipHistory(member.id)).filter(row => row.change_type === 'expiration'),
    ).toHaveLength(3)
  })
})
