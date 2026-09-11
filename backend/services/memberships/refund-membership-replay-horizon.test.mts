import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestMembership,
  createTestUser,
  insertMembershipRefundIntentAtProviderReplayHorizonForTest,
} from '@voucha/test-helpers'
import {
  createRefundRequestFingerprint,
  createStripeRefundIdempotencyKey,
} from './refund-idempotency.mts'
import { refundMembership, type MembershipStripeOperations } from './refund-membership.mts'
import { getMembershipSourceIdByMembershipId } from './get.mts'

describe('membership refund replay horizon', () => {
  it('requires reconciliation before replaying an intent claimed at least 23 hours ago', async () => {
    const user = await createTestUser()
    const uniqueId = Math.random().toString(36).slice(2, 10)
    const chargeId = `ch_stale_replay_${uniqueId}`
    const membership = await createTestMembership({
      user_id: user.id,
      stripe_subscription_id: `sub_stale_replay_${uniqueId}`,
    })
    const options = {
      targetUserId: user.id,
      chargeId,
      paymentIntentId: null,
      invoiceId: `in_stale_replay_${uniqueId}`,
      reason: 'requested' as const,
      cancel: false,
      amount: { amount: 600, currency: 'usd' as const },
      idempotencyToken: randomUUID(),
    }
    await insertMembershipRefundIntentAtProviderReplayHorizonForTest({
      membershipId: membership.id,
      membershipSourceId: (await getMembershipSourceIdByMembershipId(membership.id))!,
      issuedById: user.id,
      stripeIdempotencyKey: createStripeRefundIdempotencyKey(user.id, options.idempotencyToken),
      requestFingerprint: createRefundRequestFingerprint(membership.id, options),
    })
    const listSubscriptionInvoices = vi.fn<MembershipStripeOperations['listSubscriptionInvoices']>()
    const createRefund = vi.fn<MembershipStripeOperations['createRefund']>()
    const cancelSubscriptionImmediately =
      vi.fn<MembershipStripeOperations['cancelSubscriptionImmediately']>()

    await expect(
      refundMembership(user.id, options, {
        listSubscriptionInvoices,
        createRefund,
        cancelSubscriptionImmediately,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Refund outcome is unknown; reconciliation is required before retrying',
    })
    expect(listSubscriptionInvoices).not.toHaveBeenCalled()
    expect(createRefund).not.toHaveBeenCalled()
  })
})
