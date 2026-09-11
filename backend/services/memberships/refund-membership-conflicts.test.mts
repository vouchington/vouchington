import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestMembership,
  createTestUser,
  deleteTestMembershipAndCountRefundLedgerRows,
} from '@voucha/test-helpers'
import { refundMembership, type MembershipStripeOperations } from './refund-membership.mts'
import { recordMembershipRefundWebhook } from './refunds.mts'

describe('membership refund receipt conflicts', () => {
  it('translates a conflicting webhook receipt into HTTP 409', async () => {
    const user = await createTestUser()
    const uniqueId = Math.random().toString(36).slice(2, 10)
    const chargeId = `ch_conflict_${uniqueId}`
    const refundId = `re_conflict_${uniqueId}`
    const membership = await createTestMembership({
      user_id: user.id,
      stripe_subscription_id: `sub_conflict_${uniqueId}`,
    })
    await recordMembershipRefundWebhook({
      membershipId: membership.id,
      membershipSourceId: membership.membership_source_id,
      userId: user.id,
      stripeRefundId: refundId,
      stripeChargeId: chargeId,
      stripePaymentIntentId: null,
      amount: { amount: 400, currency: 'usd' },
      stripeEventId: `evt_conflict_${uniqueId}`,
    })
    const stripeOperations: MembershipStripeOperations = {
      listSubscriptionInvoices: async () => [
        {
          status: 'paid',
          id: 'in_test',
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
      ],
      createRefund: async () => ({
        id: refundId,
        chargeId,
        paymentIntentId: null,
        amount: 500,
        currency: 'usd',
      }),
      cancelSubscriptionImmediately: async () => null,
    }

    try {
      await expect(
        refundMembership(
          user.id,
          {
            targetUserId: user.id,
            chargeId,
            paymentIntentId: null,
            invoiceId: 'in_test',
            reason: 'goodwill',
            cancel: false,
            amount: { amount: 500, currency: 'usd' },
            idempotencyToken: randomUUID(),
          },
          stripeOperations,
        ),
      ).rejects.toMatchObject({ status: 409 })
    } finally {
      await deleteTestMembershipAndCountRefundLedgerRows(membership.id)
    }
  })
})
