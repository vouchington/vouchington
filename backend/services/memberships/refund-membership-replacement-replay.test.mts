import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createTestSku, createTestUser, getTestMembershipRaw } from '@voucha/test-helpers'
import { createMembership } from './create.mts'
import { getMembershipById, getMembershipHistory } from './get.mts'
import { refundMembership, type MembershipStripeOperations } from './refund-membership.mts'

describe('membership refund receipt replay after membership replacement', () => {
  it('replays against the original membership without another Stripe refund', async () => {
    const user = await createTestUser()
    const uniqueId = Math.random().toString(36).slice(2, 10)
    const originalSubscriptionId = `sub_original_${uniqueId}`
    const replacementSubscriptionId = `sub_replacement_${uniqueId}`
    const chargeId = `ch_original_${uniqueId}`
    const originalSku = await createTestSku({ plan: 'plus' })
    const originalMembership = await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: originalSku.id,
      stripeSubscriptionId: originalSubscriptionId,
      providerEnvironment: 'production',
    })
    const listSubscriptionInvoices = vi.fn<MembershipStripeOperations['listSubscriptionInvoices']>()
    listSubscriptionInvoices.mockResolvedValue([
      {
        status: 'paid',
        id: `in_original_${uniqueId}`,
        amountPaid: 1000,
        currency: 'usd',
        created: 1_700_000_000,
        description: null,
        payments: [
          {
            amountPaid: 1000,
            payment: { type: 'charge', chargeId, paymentIntentId: null },
          },
        ],
      },
    ])
    const createRefund = vi.fn<MembershipStripeOperations['createRefund']>()
    createRefund.mockResolvedValue({
      id: `re_original_${uniqueId}`,
      chargeId,
      paymentIntentId: null,
      amount: 1000,
      currency: 'usd',
    })
    const cancelSubscriptionImmediately =
      vi.fn<MembershipStripeOperations['cancelSubscriptionImmediately']>()
    cancelSubscriptionImmediately
      .mockRejectedValueOnce(new Error('cancellation response lost'))
      .mockResolvedValueOnce(null)
    const options = {
      targetUserId: user.id,
      chargeId,
      paymentIntentId: null,
      invoiceId: `in_original_${uniqueId}`,
      reason: 'requested' as const,
      cancel: true,
      idempotencyToken: randomUUID(),
    }

    const first = await refundMembership(user.id, options, {
      listSubscriptionInvoices,
      createRefund,
      cancelSubscriptionImmediately,
    })
    expect(first.revoked_access).toBe(false)
    await createMembership({
      userId: user.id,
      plan: 'plus',
      skuId: originalSku.id,
      stripeSubscriptionId: originalSubscriptionId,
      providerEnvironment: 'production',
      status: 'cancelled',
      terminalEffectiveAt: new Date(),
    })
    const replacementSku = await createTestSku({ plan: 'pro' })
    const replacementMembership = await createMembership({
      userId: user.id,
      plan: 'pro',
      skuId: replacementSku.id,
      stripeSubscriptionId: replacementSubscriptionId,
      providerEnvironment: 'production',
    })

    const replay = await refundMembership(user.id, options, {
      listSubscriptionInvoices,
      createRefund,
      cancelSubscriptionImmediately,
    })

    expect(replay.revoked_access).toBe(true)
    expect(listSubscriptionInvoices).toHaveBeenCalledOnce()
    expect(createRefund).toHaveBeenCalledOnce()
    expect(cancelSubscriptionImmediately).toHaveBeenLastCalledWith({
      subscriptionId: originalSubscriptionId,
    })
    expect(await getMembershipById(replacementMembership.id)).toEqual(
      expect.objectContaining({
        stripe_subscription_id: replacementSubscriptionId,
        status: 'active',
      }),
    )
    await expect(getTestMembershipRaw(originalMembership.id)).resolves.toMatchObject({
      cancelled_at: expect.any(Date),
    })
    const refundChanges = (await getMembershipHistory(user.id)).filter(
      change => change.change_type === 'refund',
    )
    expect(refundChanges).toEqual([
      expect.objectContaining({
        membership_id: originalMembership.id,
        cancelled_at: expect.any(Date),
      }),
    ])
  })
})
