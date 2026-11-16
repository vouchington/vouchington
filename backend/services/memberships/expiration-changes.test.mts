import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestAdminGrantMembership,
  createTestSku,
  createTestUser,
  getTestGrantQueue,
  readTestMembershipExpirationChanges,
  setTestMembershipGrantRemainingMilliseconds,
} from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import { resumeGrantAfterDirectAccessSuspensionInTransaction as resumeDirect } from './grants/resume-after-direct-termination.mts'

describe('exhausted paused grants on direct termination', () => {
  it('records one expiration change with its entitlement effect and latest pointer per grant', async () => {
    const admin = await createTestUser({ administrator: true })
    const member = await createTestUser()
    const grantSku = await createTestSku({ plan: 'plus' })
    // Committed fixture: the SERIALIZABLE grant writer is only setup here, and parallel tests'
    // predicate locks can abort it with 40001. Writer coverage lives in create.test.mts.
    await createTestAdminGrantMembership({
      grantedById: admin.id,
      productId: grantSku.id,
      userId: member.id,
    })
    const pausedGrantIds = (await getTestGrantQueue(member.id)).grant_ids
    const directSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const stripeSubscriptionId = `sub_exhausted_changes_${member.id}`
    await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId,
    })
    for (const pausedGrantId of pausedGrantIds)
      await setTestMembershipGrantRemainingMilliseconds(pausedGrantId, 0.5)
    const terminal = await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId,
      status: 'cancelled',
      effectiveAt: new Date('2026-09-04T11:00:00.000Z'),
      terminalEffectiveAt: new Date('2026-09-04T12:00:00.000Z'),
    })

    await using transaction = await beginTransaction()
    await resumeDirect(member.id, terminal.id, transaction)
    await transaction.commit()

    const rows = await readTestMembershipExpirationChanges(pausedGrantIds)
    // Exactly one expiration change per exhausted grant, read back in change-id order.
    expect(pausedGrantIds).toHaveLength(1)
    expect(rows).toHaveLength(pausedGrantIds.length)
    expect(rows).toEqual([{ latest: true, expired: true, effects: 1 }])
  })
})
