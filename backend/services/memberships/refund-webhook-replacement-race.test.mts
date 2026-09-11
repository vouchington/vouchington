import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestSku,
  createTestUser,
  deleteTestMembershipAndCountRefundLedgerRows,
  releaseMembershipSourceForRebindForTest,
  createMembershipBindingForRebindForTest,
} from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import {
  getMembershipRefundTargetByStripeSubscriptionId,
  getMembershipHistory,
  getMembershipSourceIdByMembershipId,
} from './get.mts'
import { claimMembershipRefundIntent } from './refund-intents.mts'
import { recordAdminMembershipRefund, recordMembershipRefundWebhook } from './refunds.mts'
import { updateMembershipFromWebhook } from './update.mts'

describe('membership refund webhook replacement race', () => {
  it('anchors a live provider membership to its source before refund lookup', async () => {
    const user = await createTestUser()
    const suffix = randomUUID()
    const sku = await createTestSku({ plan: 'plus' })
    const subscriptionId = `sub_webhook_live_${suffix}`
    const membership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      providerEnvironment: 'production',
    })
    const membershipSourceId = (await getMembershipSourceIdByMembershipId(membership.id))!

    await expect(getMembershipHistory(user.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          membership_id: membership.id,
          change_type: 'renewal',
        }),
      ]),
    )

    await expect(
      getMembershipRefundTargetByStripeSubscriptionId(subscriptionId, 'production', new Date()),
    ).resolves.toEqual({
      membershipId: membership.id,
      membershipSourceId,
      userId: user.id,
    })
  })

  it('reconciles the original intent and source after a replacement projection exists', async () => {
    const user = await createTestUser()
    const suffix = randomUUID()
    const originalSku = await createTestSku({ plan: 'plus' })
    const originalSubscriptionId = `sub_webhook_original_${suffix}`
    const original = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: originalSku.id,
      stripeSubscriptionId: originalSubscriptionId,
      providerEnvironment: 'production',
      stripeCustomerId: `cus_webhook_${suffix}`,
    })
    const originalSourceId = (await getMembershipSourceIdByMembershipId(original.id))!
    const idempotencyKey = `webhook-replacement-${suffix}`
    const fingerprint = 'a'.repeat(64)
    await claimMembershipRefundIntent({
      membershipId: original.id,
      membershipSourceId: originalSourceId,
      issuedById: user.id,
      stripeIdempotencyKey: idempotencyKey,
      requestFingerprint: fingerprint,
    })

    await updateMembershipFromWebhook(
      { membershipId: original.id, status: 'expired' },
      async () => {},
    )
    const replacementSku = await createTestSku({ plan: 'pro' })
    const replacement = await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: replacementSku.id,
      stripeSubscriptionId: `sub_webhook_replacement_${suffix}`,
      providerEnvironment: 'production',
      stripeCustomerId: `cus_webhook_${suffix}`,
    })
    expect(replacement.id).not.toBe(original.id)
    await expect(deleteTestMembershipAndCountRefundLedgerRows(original.id)).resolves.toEqual({
      intentCount: 1,
      refundCount: 0,
    })

    const target = await getMembershipRefundTargetByStripeSubscriptionId(
      originalSubscriptionId,
      'production',
      new Date(),
    )
    expect(target).toEqual({
      membershipId: original.id,
      membershipSourceId: originalSourceId,
      userId: user.id,
    })

    const stripeRefundId = `re_webhook_original_${suffix}`
    const stripeChargeId = `ch_webhook_original_${suffix}`
    await recordMembershipRefundWebhook({
      membershipId: target!.membershipId,
      membershipSourceId: target!.membershipSourceId,
      userId: target!.userId,
      stripeRefundId,
      stripeChargeId,
      stripePaymentIntentId: null,
      amount: { amount: 500, currency: 'usd' },
      stripeEventId: `evt_webhook_original_${suffix}`,
    })
    const reconciled = await recordAdminMembershipRefund({
      membershipId: original.id,
      userId: user.id,
      stripeRefundId,
      stripeChargeId,
      stripePaymentIntentId: null,
      stripeIdempotencyKey: idempotencyKey,
      adminRequestFingerprint: fingerprint,
      amount: { amount: 500, currency: 'usd' },
      reason: 'requested',
      revokedAccess: false,
      issuedById: user.id,
      stripeEventId: null,
      note: null,
    })
    expect(reconciled).toMatchObject({
      membership_id: original.id,
      source: 'admin',
      stripe_idempotency_key: idempotencyKey,
    })
  })

  it('attributes a delayed refund to the binding active when the charge originated', async () => {
    const originalUser = await createTestUser()
    const reboundUser = await createTestUser()
    const sku = await createTestSku({ plan: 'plus' })
    const subscriptionId = `sub_webhook_rebound_${randomUUID()}`
    const original = await createMembership({
      userId: originalUser.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      providerEnvironment: 'production',
    })
    const sourceId = (await getMembershipSourceIdByMembershipId(original.id))!
    const binding = await releaseMembershipSourceForRebindForTest(sourceId)
    const originatedAt = new Date((binding.boundAt.getTime() + binding.releasedAt.getTime()) / 2)
    const reboundAt = new Date(binding.releasedAt.getTime() + 24 * 60 * 60 * 1000)
    await createMembershipBindingForRebindForTest(sourceId, reboundUser.id, reboundAt)
    const rebound = await createMembership({
      userId: reboundUser.id,
      plan: 'plus',
      skuId: sku.id,
      stripeSubscriptionId: subscriptionId,
      providerEnvironment: 'production',
    })

    await expect(
      getMembershipRefundTargetByStripeSubscriptionId(subscriptionId, 'production', originatedAt),
    ).resolves.toEqual({
      membershipId: original.id,
      membershipSourceId: sourceId,
      userId: originalUser.id,
    })
    await expect(
      getMembershipRefundTargetByStripeSubscriptionId(
        subscriptionId,
        'production',
        binding.releasedAt,
      ),
    ).resolves.toBeNull()
    await expect(
      getMembershipRefundTargetByStripeSubscriptionId(
        subscriptionId,
        'production',
        new Date((binding.releasedAt.getTime() + reboundAt.getTime()) / 2),
      ),
    ).resolves.toBeNull()
    await expect(
      getMembershipRefundTargetByStripeSubscriptionId(subscriptionId, 'production', reboundAt),
    ).resolves.toEqual({
      membershipId: rebound.id,
      membershipSourceId: sourceId,
      userId: reboundUser.id,
    })
  })
})
