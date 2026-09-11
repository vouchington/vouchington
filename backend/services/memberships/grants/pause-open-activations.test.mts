import { describe, expect, it } from 'vitest'
import {
  createTestMembership,
  createTestSku,
  createTestUser,
  getTestGrantQueue,
  getTestMembershipGrant,
  getTestMembershipGrantRemainingMilliseconds,
  getTestMembershipSourceState,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { createMembership } from '../create.mts'

describe('pauseOpenGrantActivations', () => {
  it('preserves grant duration at a delayed direct term effective boundary', async () => {
    const member = await createTestUser()
    const grantStartedAt = new Date('2020-01-01T00:00:00.000Z')
    const directEffectiveAt = new Date('2020-06-01T00:00:00.000Z')
    const scheduledGrantExpiryAt = new Date('2020-12-31T00:00:00.000Z')
    const grantSku = await createTestSku({ plan: 'plus' })
    const grant = await createTestMembership({
      user_id: member.id,
      plan: 'plus',
      sku_id: grantSku.id,
      stripe_subscription_id: null,
      effective_at: grantStartedAt,
    })
    const [grantId] = (await getTestGrantQueue(member.id)).grant_ids
    expect(grantId).toBeDefined()
    await updateTestMembershipExpiresAt(grant.id, scheduledGrantExpiryAt)
    const directSku = await createTestSku({ plan: 'pro', interval: 'yearly' })

    await createMembership({
      userId: member.id,
      plan: 'pro',
      skuId: directSku.id,
      stripeSubscriptionId: `sub_delayed_direct_${member.id}`,
      effectiveAt: directEffectiveAt,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    })

    await expect(getTestMembershipGrant(grantId!)).resolves.toMatchObject({
      activation_started_at: grantStartedAt,
      activation_ended_at: directEffectiveAt,
    })
    await expect(getTestMembershipGrantRemainingMilliseconds(grantId!)).resolves.toBe(
      213 * 24 * 60 * 60 * 1000,
    )
    await expect(getTestMembershipSourceState(grant.id)).resolves.toMatchObject({
      expired_at: null,
      paused_at: directEffectiveAt,
    })
  })
})
