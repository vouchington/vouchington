import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import { refundMembership, type MembershipStripeOperations } from './refund-membership.mts'
import { getMembershipRefundIntentByStripeIdempotencyKey } from './refund-intents.mts'
import { createStripeRefundIdempotencyKey } from './refund-idempotency.mts'
import { recordMembershipRefundWebhook } from './refunds.mts'

const mockInvoicesList = vi.fn<MembershipStripeOperations['listSubscriptionInvoices']>()
const mockRefundsCreate = vi.fn<MembershipStripeOperations['createRefund']>()
const mockSubsCancel = vi.fn<MembershipStripeOperations['cancelSubscriptionImmediately']>()

describe('fully refunded membership charges', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('rejects a new refund before calling Stripe or claiming an intent', async () => {
    const user = await createTestUser()
    const uniqueId = Math.random().toString(36).slice(2, 10)
    const chargeId = `ch_fully_refunded_${uniqueId}`
    const membership = await createTestMembership({
      user_id: user.id,
      stripe_subscription_id: `sub_fully_refunded_${uniqueId}`,
    })
    await recordMembershipRefundWebhook({
      membershipId: membership.id,
      membershipSourceId: membership.membership_source_id,
      userId: user.id,
      stripeRefundId: `re_fully_refunded_${uniqueId}`,
      stripeChargeId: chargeId,
      stripePaymentIntentId: null,
      amount: { amount: 1000, currency: 'usd' },
      stripeEventId: `evt_fully_refunded_${uniqueId}`,
    })
    mockInvoicesList.mockResolvedValue([
      {
        status: 'paid',
        id: 'in_fully_refunded',
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
    const options = {
      targetUserId: user.id,
      chargeId,
      paymentIntentId: null,
      invoiceId: 'in_fully_refunded',
      reason: 'requested' as const,
      cancel: false,
      idempotencyToken: randomUUID(),
    }

    await expect(
      refundMembership(user.id, options, {
        listSubscriptionInvoices: mockInvoicesList,
        createRefund: mockRefundsCreate,
        cancelSubscriptionImmediately: mockSubsCancel,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Charge has already been fully refunded',
    })

    expect(mockRefundsCreate).not.toHaveBeenCalled()
    await expect(
      getMembershipRefundIntentByStripeIdempotencyKey(
        createStripeRefundIdempotencyKey(user.id, options.idempotencyToken),
      ),
    ).resolves.toBeNull()
  })
})
