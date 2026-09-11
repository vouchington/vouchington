import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestMembership,
  createTestUser,
  insertMembershipRefundIntentAtProviderReplayHorizonForTest,
} from '@voucha/test-helpers'
import { refundMembership, type MembershipStripeOperations } from './refund-membership.mts'
import { claimMembershipRefundIntent } from './refund-intents.mts'
import {
  createRefundRequestFingerprint,
  createStripeRefundIdempotencyKey,
  type MembershipRefundRequestIntent,
} from './refund-idempotency.mts'
import { updateMembershipFromWebhook } from './update.mts'
import { getMembershipSourceIdByMembershipId } from './get.mts'

async function expireMembershipWithoutRecording(membershipId: string) {
  await updateMembershipFromWebhook({ membershipId, status: 'expired' }, async () => {})
}

const listSubscriptionInvoices = vi.fn<MembershipStripeOperations['listSubscriptionInvoices']>()
const createRefund = vi.fn<MembershipStripeOperations['createRefund']>()
const cancelSubscriptionImmediately =
  vi.fn<MembershipStripeOperations['cancelSubscriptionImmediately']>()

function operations(): MembershipStripeOperations {
  return { listSubscriptionInvoices, createRefund, cancelSubscriptionImmediately }
}

function request(targetUserId: string, chargeId: string): MembershipRefundRequestIntent {
  return {
    targetUserId,
    chargeId,
    paymentIntentId: null,
    invoiceId: 'in_original_intent',
    reason: 'requested',
    cancel: true,
    idempotencyToken: randomUUID(),
  }
}

function invoice(chargeId: string) {
  return [
    {
      status: 'paid' as const,
      id: 'in_original_intent',
      amountPaid: 1000,
      currency: 'usd',
      created: 1_700_000_000,
      description: null,
      payments: [
        {
          amountPaid: 1000,
          payment: { type: 'charge' as const, chargeId, paymentIntentId: null },
        },
      ],
    },
  ]
}

describe('client-token refund original intent membership', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('replays an active receiptless intent against its original subscription after replacement', async () => {
    const actor = await createTestUser()
    const target = await createTestUser()
    const chargeId = `ch_original_intent_${randomUUID()}`
    const originalSubscriptionId = `sub_original_intent_${randomUUID()}`
    const original = await createTestMembership({
      user_id: target.id,
      stripe_subscription_id: originalSubscriptionId,
    })
    const options = request(target.id, chargeId)
    const stripeIdempotencyKey = createStripeRefundIdempotencyKey(
      actor.id,
      options.idempotencyToken,
    )
    await claimMembershipRefundIntent({
      membershipId: original.id,
      membershipSourceId: (await getMembershipSourceIdByMembershipId(original.id))!,
      issuedById: actor.id,
      stripeIdempotencyKey,
      requestFingerprint: createRefundRequestFingerprint(original.id, options),
    })
    await expireMembershipWithoutRecording(original.id)
    await createTestMembership({
      user_id: target.id,
      stripe_subscription_id: `sub_replacement_${randomUUID()}`,
    })
    listSubscriptionInvoices.mockResolvedValue(invoice(chargeId))
    createRefund.mockResolvedValue({
      id: `re_original_intent_${randomUUID()}`,
      chargeId,
      paymentIntentId: null,
      amount: 1000,
      currency: 'usd',
    })
    cancelSubscriptionImmediately.mockResolvedValue(null)

    const result = await refundMembership(actor.id, options, operations())

    expect(result.membership_id).toBe(original.id)
    expect(listSubscriptionInvoices).toHaveBeenCalledWith({
      subscriptionId: originalSubscriptionId,
      limit: 100,
    })
    expect(createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: stripeIdempotencyKey }),
    )
    expect(cancelSubscriptionImmediately).toHaveBeenCalledWith({
      subscriptionId: originalSubscriptionId,
    })
  })

  it('rejects changed intent against the stored membership before Stripe', async () => {
    const actor = await createTestUser()
    const target = await createTestUser()
    const chargeId = `ch_original_changed_${randomUUID()}`
    const original = await createTestMembership({
      user_id: target.id,
    })
    const options = request(target.id, chargeId)
    await claimMembershipRefundIntent({
      membershipId: original.id,
      membershipSourceId: (await getMembershipSourceIdByMembershipId(original.id))!,
      issuedById: actor.id,
      stripeIdempotencyKey: createStripeRefundIdempotencyKey(actor.id, options.idempotencyToken),
      requestFingerprint: createRefundRequestFingerprint(original.id, options),
    })
    await expireMembershipWithoutRecording(original.id)
    await createTestMembership({
      user_id: target.id,
      stripe_subscription_id: `sub_changed_replacement_${randomUUID()}`,
    })

    await expect(
      refundMembership(actor.id, { ...options, note: 'changed' }, operations()),
    ).rejects.toMatchObject({ status: 409 })
    expect(listSubscriptionInvoices).not.toHaveBeenCalled()
    expect(createRefund).not.toHaveBeenCalled()
    expect(cancelSubscriptionImmediately).not.toHaveBeenCalled()
  })

  it('rejects the same token with a changed target user before Stripe', async () => {
    const actor = await createTestUser()
    const originalTarget = await createTestUser()
    const changedTarget = await createTestUser()
    const chargeId = `ch_original_changed_target_${randomUUID()}`
    const original = await createTestMembership({
      user_id: originalTarget.id,
      stripe_subscription_id: `sub_original_changed_target_${randomUUID()}`,
    })
    const options = request(originalTarget.id, chargeId)
    await claimMembershipRefundIntent({
      membershipId: original.id,
      membershipSourceId: (await getMembershipSourceIdByMembershipId(original.id))!,
      issuedById: actor.id,
      stripeIdempotencyKey: createStripeRefundIdempotencyKey(actor.id, options.idempotencyToken),
      requestFingerprint: createRefundRequestFingerprint(original.id, options),
    })

    await expect(
      refundMembership(actor.id, { ...options, targetUserId: changedTarget.id }, operations()),
    ).rejects.toMatchObject({ status: 409 })
    expect(listSubscriptionInvoices).not.toHaveBeenCalled()
    expect(createRefund).not.toHaveBeenCalled()
    expect(cancelSubscriptionImmediately).not.toHaveBeenCalled()
  })

  it('rejects a stale receiptless original intent before Stripe after replacement', async () => {
    const actor = await createTestUser()
    const target = await createTestUser()
    const chargeId = `ch_original_stale_${randomUUID()}`
    const original = await createTestMembership({
      user_id: target.id,
    })
    const options = request(target.id, chargeId)
    await insertMembershipRefundIntentAtProviderReplayHorizonForTest({
      membershipId: original.id,
      membershipSourceId: (await getMembershipSourceIdByMembershipId(original.id))!,
      issuedById: actor.id,
      stripeIdempotencyKey: createStripeRefundIdempotencyKey(actor.id, options.idempotencyToken),
      requestFingerprint: createRefundRequestFingerprint(original.id, options),
    })
    await expireMembershipWithoutRecording(original.id)
    await createTestMembership({
      user_id: target.id,
      stripe_subscription_id: `sub_stale_replacement_${randomUUID()}`,
    })

    await expect(refundMembership(actor.id, options, operations())).rejects.toMatchObject({
      status: 409,
      message: 'Refund outcome is unknown; reconciliation is required before retrying',
    })
    expect(listSubscriptionInvoices).not.toHaveBeenCalled()
    expect(createRefund).not.toHaveBeenCalled()
    expect(cancelSubscriptionImmediately).not.toHaveBeenCalled()
  })
})
