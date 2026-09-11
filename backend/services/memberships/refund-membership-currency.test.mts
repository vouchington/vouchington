import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import { refundMembership, type MembershipStripeOperations } from './refund-membership.mts'

const listSubscriptionInvoices = vi.fn<MembershipStripeOperations['listSubscriptionInvoices']>()
const createRefund = vi.fn<MembershipStripeOperations['createRefund']>()
const cancelSubscriptionImmediately =
  vi.fn<MembershipStripeOperations['cancelSubscriptionImmediately']>()

function stripeOperations(): MembershipStripeOperations {
  return {
    listSubscriptionInvoices,
    createRefund,
    cancelSubscriptionImmediately,
  }
}

describe('membership refund currencies', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('rejects a requested amount in a different currency from its charge', async () => {
    const user = await createTestUser()
    const suffix = Math.random().toString(36).slice(2, 10)
    const chargeId = `ch_currency_${suffix}`
    await createTestMembership({
      user_id: user.id,
      stripe_subscription_id: `sub_currency_${suffix}`,
    })
    listSubscriptionInvoices.mockResolvedValue([
      {
        status: 'paid',
        id: `in_currency_${suffix}`,
        amountPaid: 1000,
        currency: 'usd',
        created: 1_700_000_000,
        description: null,
        payments: [
          {
            amountPaid: 1000,
            payment: {
              type: 'charge',
              chargeId,
              paymentIntentId: null,
            },
          },
        ],
      },
    ])

    await expect(
      refundMembership(
        user.id,
        {
          targetUserId: user.id,
          chargeId,
          paymentIntentId: null,
          invoiceId: `in_currency_${suffix}`,
          amount: { amount: 500, currency: 'jpy' },
          reason: 'goodwill',
          cancel: false,
          idempotencyToken: randomUUID(),
        },
        stripeOperations(),
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Refund currency must match the refundable charge currency',
    })
    expect(createRefund).not.toHaveBeenCalled()
  })

  it('rejects an unsupported currency returned by Stripe', async () => {
    const user = await createTestUser()
    const suffix = Math.random().toString(36).slice(2, 10)
    const chargeId = `ch_provider_currency_${suffix}`
    await createTestMembership({
      user_id: user.id,
      stripe_subscription_id: `sub_provider_currency_${suffix}`,
    })
    listSubscriptionInvoices.mockResolvedValue([
      {
        status: 'paid',
        id: `in_provider_currency_${suffix}`,
        amountPaid: 1000,
        currency: 'usd',
        created: 1_700_000_000,
        description: null,
        payments: [
          {
            amountPaid: 1000,
            payment: {
              type: 'charge',
              chargeId,
              paymentIntentId: null,
            },
          },
        ],
      },
    ])
    createRefund.mockResolvedValue({
      id: `re_provider_currency_${suffix}`,
      chargeId,
      paymentIntentId: null,
      amount: 1000,
      currency: 'bhd',
    })

    await expect(
      refundMembership(
        user.id,
        {
          targetUserId: user.id,
          chargeId,
          paymentIntentId: null,
          invoiceId: `in_provider_currency_${suffix}`,
          reason: 'goodwill',
          cancel: false,
          idempotencyToken: randomUUID(),
        },
        stripeOperations(),
      ),
    ).rejects.toMatchObject({
      status: 502,
      message: 'Stripe refund returned an unsupported currency',
    })
  })
})
