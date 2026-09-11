import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  attachTestStripeProductionProviderObservation,
  createTestFamilyMembership,
  createTestMembership,
  createTestSku,
  createTestUser,
  endTestMembershipProjection,
  getTestGrantQueue,
  getTestMembershipGrant,
  getTestMembershipGrantRemainingMilliseconds,
  beginTransaction,
} from '@voucha/test-helpers'
import { grantMembership } from '../../create.mts'
import { getMembershipByUserId } from '../../get.mts'
import { updateMembershipFromWebhook } from '../../update.mts'
import { restoreFallbackAfterCurrentAccessEndsInTransaction } from '../restore-after-current-access-ends.mts'

describe('fallback after a family projection ends over an open grant', () => {
  it('pauses a lower-priority open grant before activating the exact queued winner', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser()
    const openSku = await createTestSku({ plan: 'plus' })
    const openGrant = await createTestMembership({
      user_id: user.id,
      plan: 'plus',
      sku_id: openSku.id,
      stripe_subscription_id: null,
    })
    const [openGrantId] = (await getTestGrantQueue(user.id)).grant_ids
    expect(openGrantId).toBeDefined()
    await endTestMembershipProjection(openGrant.id)
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-open-grant-queued-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: user.id,
    })
    const queuedSku = await createTestSku({ plan: 'pro', interval: 'yearly' })
    const queued = await grantMembership(admin.id, user.id, 'pro', queuedSku.id, 30)
    const remainingBefore = await getTestMembershipGrantRemainingMilliseconds(openGrantId!)
    const familyEndedAt = new Date()

    await updateMembershipFromWebhook(
      { membershipId: family.id, status: 'expired', terminalEffectiveAt: familyEndedAt },
      async () => false,
    )
    await expect(restoreFallbackAfterCurrentAccessEnds(user.id, family.id)).resolves.toBe(true)

    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({
      granted_by_id: admin.id,
      plan: 'pro',
      status: 'active',
    })
    await expect(getTestGrantQueue(user.id)).resolves.toMatchObject({
      active_grant_ids: [queued.grantId],
      open_activation_count: 1,
    })
    await expect(getTestMembershipGrant(openGrantId!)).resolves.toMatchObject({
      activation_ended_at: familyEndedAt,
    })
    const remainingAfter = await getTestMembershipGrantRemainingMilliseconds(openGrantId!)
    expect(remainingBefore).toBeDefined()
    expect(Math.abs(remainingAfter! - remainingBefore!)).toBeLessThanOrEqual(5_000)
  })

  it('pauses an open grant before restoring a higher-priority direct source', async () => {
    const user = await createTestUser()
    const openSku = await createTestSku({ plan: 'plus' })
    const openGrant = await createTestMembership({
      user_id: user.id,
      plan: 'plus',
      sku_id: openSku.id,
      stripe_subscription_id: null,
    })
    const [openGrantId] = (await getTestGrantQueue(user.id)).grant_ids
    expect(openGrantId).toBeDefined()
    await endTestMembershipProjection(openGrant.id)
    const directSku = await createTestSku({
      plan: 'pro',
      provider_application_id: `direct-open-grant-${randomUUID()}`,
    })
    const directSubscriptionId = `sub_direct_open_grant_${randomUUID()}`
    const direct = await createTestMembership({
      user_id: user.id,
      plan: 'pro',
      sku_id: directSku.id,
      stripe_subscription_id: directSubscriptionId,
      provider_environment: 'production',
      provider_application_id: directSku.provider_application_id,
    })
    await attachTestStripeProductionProviderObservation({
      membership_id: direct.id,
      membership_provider_product_id: directSku.membership_provider_product_id,
    })
    await endTestMembershipProjection(direct.id)
    const familySku = await createTestSku({
      plan: 'plus',
      provider_application_id: `family-open-grant-direct-${randomUUID()}`,
    })
    const family = await createTestFamilyMembership({
      applicationId: familySku.provider_application_id,
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      membershipProductId: familySku.id,
      membershipProviderProductId: familySku.membership_provider_product_id,
      userId: user.id,
    })
    const remainingBefore = await getTestMembershipGrantRemainingMilliseconds(openGrantId!)
    const familyEndedAt = new Date()

    await updateMembershipFromWebhook(
      { membershipId: family.id, status: 'expired', terminalEffectiveAt: familyEndedAt },
      async () => false,
    )
    await expect(restoreFallbackAfterCurrentAccessEnds(user.id, family.id)).resolves.toBe(true)

    await expect(getMembershipByUserId(user.id)).resolves.toMatchObject({
      plan: 'pro',
      status: 'active',
      stripe_subscription_id: directSubscriptionId,
    })
    await expect(getTestGrantQueue(user.id)).resolves.toMatchObject({
      active_grant_ids: [],
      open_activation_count: 0,
    })
    await expect(getTestMembershipGrant(openGrantId!)).resolves.toMatchObject({
      activation_ended_at: familyEndedAt,
    })
    const remainingAfter = await getTestMembershipGrantRemainingMilliseconds(openGrantId!)
    expect(remainingBefore).toBeDefined()
    expect(Math.abs(remainingAfter! - remainingBefore!)).toBeLessThanOrEqual(5_000)
  })
})

async function restoreFallbackAfterCurrentAccessEnds(
  userId: string,
  membershipId: string,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  const restored = await restoreFallbackAfterCurrentAccessEndsInTransaction(
    userId,
    membershipId,
    transaction,
  )
  await transaction.commit()
  return restored
}
