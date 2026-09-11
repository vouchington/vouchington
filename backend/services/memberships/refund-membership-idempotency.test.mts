import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import { refundMembership, type MembershipStripeOperations } from './refund-membership.mts'
import {
  claimMembershipRefundIntent,
  getMembershipRefundIntentByStripeIdempotencyKey,
} from './refund-intents.mts'
import {
  createRefundRequestFingerprint,
  createStripeRefundIdempotencyKey,
} from './refund-idempotency.mts'
import { recordMembershipRefundWebhook } from './refunds.mts'
import { getMembershipSourceIdByMembershipId } from './get.mts'

const mockInvoicesList = vi.fn<MembershipStripeOperations['listSubscriptionInvoices']>()
const mockRefundsCreate = vi.fn<MembershipStripeOperations['createRefund']>()
const mockSubsCancel = vi.fn<MembershipStripeOperations['cancelSubscriptionImmediately']>()

function stripeOperations(): MembershipStripeOperations {
  return {
    listSubscriptionInvoices: mockInvoicesList,
    createRefund: mockRefundsCreate,
    cancelSubscriptionImmediately: mockSubsCancel,
  }
}

function fakeInvoice(chargeId: string | null, piId: string | null) {
  return [
    {
      status: 'paid',
      id: 'in_test',
      amountPaid: 1000,
      currency: 'usd',
      created: 1700000000,
      description: null,
      payments: [
        {
          amountPaid: 1000,
          payment: chargeId
            ? { type: 'charge', chargeId, paymentIntentId: null }
            : { type: 'payment_intent', chargeId: null, paymentIntentId: piId },
        },
      ],
    },
  ]
}

describe('membership refund idempotency', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns the durable refund receipt without another Stripe call after response loss', async () => {
    const user = await createTestUser()
    const uniqueId = Math.random().toString(36).slice(2, 10)
    const subId = `sub_retry_${uniqueId}`
    const chargeId = `ch_retry_${uniqueId}`
    await createTestMembership({ user_id: user.id, stripe_subscription_id: subId })
    mockInvoicesList.mockResolvedValue(fakeInvoice(chargeId, null))
    mockRefundsCreate.mockResolvedValue({
      id: `re_retry_${uniqueId}`,
      chargeId,
      paymentIntentId: null,
      amount: 700,
      currency: 'usd',
    })
    const options = {
      targetUserId: user.id,
      chargeId,
      paymentIntentId: null,
      invoiceId: 'in_test',
      reason: 'goodwill' as const,
      cancel: false,
      amount: { amount: 700, currency: 'usd' as const },
      idempotencyToken: randomUUID(),
    }

    const firstResult = await refundMembership(user.id, options, stripeOperations())
    const replayResult = await refundMembership(user.id, options, stripeOperations())

    const firstKey = mockRefundsCreate.mock.calls[0]![0].idempotencyKey
    expect(firstResult.id).toBe(replayResult.id)
    expect(mockRefundsCreate).toHaveBeenCalledOnce()
    expect(mockInvoicesList).toHaveBeenCalledOnce()
    expect(firstKey).toMatch(/^voucha-membership-refund-v2:[a-f0-9]{64}$/)
    expect(firstKey.length).toBeLessThanOrEqual(100)
  })

  it('rejects reuse of the same token for changed refund intent', async () => {
    const user = await createTestUser()
    const uniqueId = Math.random().toString(36).slice(2, 10)
    const subId = `sub_partial_${uniqueId}`
    const chargeId = `ch_partial_${uniqueId}`
    await createTestMembership({ user_id: user.id, stripe_subscription_id: subId })
    mockInvoicesList.mockResolvedValue(fakeInvoice(chargeId, null))
    mockRefundsCreate.mockResolvedValueOnce({
      id: `re_partial_1_${uniqueId}`,
      chargeId,
      paymentIntentId: null,
      amount: 250,
      currency: 'usd',
    })
    const options = {
      targetUserId: user.id,
      chargeId,
      paymentIntentId: null,
      invoiceId: 'in_test',
      reason: 'goodwill' as const,
      cancel: false,
      amount: { amount: 250, currency: 'usd' as const },
      idempotencyToken: randomUUID(),
    }

    await refundMembership(user.id, options, stripeOperations())
    await expect(
      refundMembership(
        user.id,
        { ...options, amount: { amount: 300, currency: 'usd' } },
        stripeOperations(),
      ),
    ).rejects.toMatchObject({ status: 409 })
    expect(mockRefundsCreate).toHaveBeenCalledOnce()
  })

  it('allows an existing intent to attach its full-refund webhook receipt', async () => {
    const user = await createTestUser()
    const uniqueId = Math.random().toString(36).slice(2, 10)
    const chargeId = `ch_webhook_first_${uniqueId}`
    const refundId = `re_webhook_first_${uniqueId}`
    const membership = await createTestMembership({
      user_id: user.id,
      stripe_subscription_id: `sub_webhook_first_${uniqueId}`,
    })
    const options = {
      targetUserId: user.id,
      chargeId,
      paymentIntentId: null,
      invoiceId: 'in_test',
      reason: 'requested' as const,
      cancel: false,
      idempotencyToken: randomUUID(),
    }
    const stripeIdempotencyKey = createStripeRefundIdempotencyKey(user.id, options.idempotencyToken)
    await claimMembershipRefundIntent({
      membershipId: membership.id,
      membershipSourceId: (await getMembershipSourceIdByMembershipId(membership.id))!,
      issuedById: user.id,
      stripeIdempotencyKey,
      requestFingerprint: createRefundRequestFingerprint(membership.id, options),
    })
    await recordMembershipRefundWebhook({
      membershipId: membership.id,
      membershipSourceId: membership.membership_source_id,
      userId: user.id,
      stripeRefundId: refundId,
      stripeChargeId: chargeId,
      stripePaymentIntentId: null,
      amount: { amount: 1000, currency: 'usd' },
      stripeEventId: `evt_webhook_first_${uniqueId}`,
    })
    mockInvoicesList.mockResolvedValue(fakeInvoice(chargeId, null))
    mockRefundsCreate.mockResolvedValue({
      id: refundId,
      chargeId,
      paymentIntentId: null,
      amount: 1000,
      currency: 'usd',
    })

    const result = await refundMembership(user.id, options, stripeOperations())

    expect(result.source).toBe('admin')
    expect(result.stripe_idempotency_key).toBe(stripeIdempotencyKey)
    expect(result.admin_request_fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(mockRefundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amountMinorUnits: undefined }),
    )
  })

  it('reaches Stripe cached replay when a webhook-first partial exceeds the local remainder', async () => {
    const user = await createTestUser()
    const uniqueId = Math.random().toString(36).slice(2, 10)
    const chargeId = `ch_webhook_replay_${uniqueId}`
    const refundId = `re_webhook_replay_${uniqueId}`
    const membership = await createTestMembership({
      user_id: user.id,
      stripe_subscription_id: `sub_webhook_replay_${uniqueId}`,
    })
    const options = {
      targetUserId: user.id,
      chargeId,
      paymentIntentId: null,
      invoiceId: 'in_test',
      reason: 'requested' as const,
      cancel: false,
      amount: { amount: 600, currency: 'usd' as const },
      idempotencyToken: randomUUID(),
    }
    const stripeIdempotencyKey = createStripeRefundIdempotencyKey(user.id, options.idempotencyToken)
    await claimMembershipRefundIntent({
      membershipId: membership.id,
      membershipSourceId: (await getMembershipSourceIdByMembershipId(membership.id))!,
      issuedById: user.id,
      stripeIdempotencyKey,
      requestFingerprint: createRefundRequestFingerprint(membership.id, options),
    })
    await recordMembershipRefundWebhook({
      membershipId: membership.id,
      membershipSourceId: membership.membership_source_id,
      userId: user.id,
      stripeRefundId: refundId,
      stripeChargeId: chargeId,
      stripePaymentIntentId: null,
      amount: { amount: 600, currency: 'usd' as const },
      stripeEventId: `evt_webhook_replay_${uniqueId}`,
    })
    mockInvoicesList.mockResolvedValue(fakeInvoice(chargeId, null))
    mockRefundsCreate.mockResolvedValue({
      id: refundId,
      chargeId,
      paymentIntentId: null,
      amount: 600,
      currency: 'usd',
    })

    const result = await refundMembership(user.id, options, stripeOperations())

    expect(result.source).toBe('admin')
    expect(result.stripe_idempotency_key).toBe(stripeIdempotencyKey)
    expect(mockInvoicesList).toHaveBeenCalledOnce()
    expect(mockRefundsCreate).toHaveBeenCalledOnce()
  })

  it('rejects a new partial refund above the locally remaining amount before Stripe', async () => {
    const user = await createTestUser()
    const uniqueId = Math.random().toString(36).slice(2, 10)
    const chargeId = `ch_webhook_partial_${uniqueId}`
    const refundId = `re_webhook_partial_${uniqueId}`
    const membership = await createTestMembership({
      user_id: user.id,
      stripe_subscription_id: `sub_webhook_partial_${uniqueId}`,
    })
    await recordMembershipRefundWebhook({
      membershipId: membership.id,
      membershipSourceId: membership.membership_source_id,
      userId: user.id,
      stripeRefundId: refundId,
      stripeChargeId: chargeId,
      stripePaymentIntentId: null,
      amount: { amount: 600, currency: 'usd' as const },
      stripeEventId: `evt_webhook_partial_${uniqueId}`,
    })
    mockInvoicesList.mockResolvedValue(fakeInvoice(chargeId, null))
    const options = {
      targetUserId: user.id,
      chargeId,
      paymentIntentId: null,
      invoiceId: 'in_test',
      reason: 'requested' as const,
      cancel: false,
      amount: { amount: 600, currency: 'usd' as const },
      idempotencyToken: randomUUID(),
    }
    await expect(refundMembership(user.id, options, stripeOperations())).rejects.toMatchObject({
      status: 400,
      message: 'Refund amount exceeds remaining refundable amount of 400 minor units',
    })

    expect(mockRefundsCreate).not.toHaveBeenCalled()
    await expect(
      getMembershipRefundIntentByStripeIdempotencyKey(
        createStripeRefundIdempotencyKey(user.id, options.idempotencyToken),
      ),
    ).resolves.toBeNull()
  })
})
