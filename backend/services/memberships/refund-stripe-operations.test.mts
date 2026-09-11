import { describe, expect, it, vi } from 'vitest'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import {
  buildAlreadyRefundedMinorUnitsQuery,
  listRefundableChargesForSubscription,
  type MembershipStripeOperations,
} from './refund-stripe-operations.mts'
import { recordMembershipRefundWebhook } from './refunds.mts'

describe('membership refund Stripe operations', () => {
  it('loads charge, payment-intent, and unmatched refund totals for a batch', async () => {
    const user = await createTestUser()
    const suffix = Math.random().toString(36).slice(2)
    const membership = await createTestMembership({
      user_id: user.id,
      stripe_subscription_id: `sub_batch_${suffix}`,
    })
    const chargeId = `ch_batch_${suffix}`
    const paymentIntentId = `pi_batch_${suffix}`
    await Promise.all([
      recordMembershipRefundWebhook({
        membershipId: membership.id,
        membershipSourceId: membership.membership_source_id,
        userId: user.id,
        stripeRefundId: `re_charge_a_${suffix}`,
        stripeChargeId: chargeId,
        stripePaymentIntentId: `pi_charge_${suffix}`,
        amount: { amount: 125, currency: 'usd' },
        stripeEventId: `evt_charge_a_${suffix}`,
      }),
      recordMembershipRefundWebhook({
        membershipId: membership.id,
        membershipSourceId: membership.membership_source_id,
        userId: user.id,
        stripeRefundId: `re_charge_b_${suffix}`,
        stripeChargeId: chargeId,
        stripePaymentIntentId: `pi_charge_${suffix}`,
        amount: { amount: 75, currency: 'usd' },
        stripeEventId: `evt_charge_b_${suffix}`,
      }),
      recordMembershipRefundWebhook({
        membershipId: membership.id,
        membershipSourceId: membership.membership_source_id,
        userId: user.id,
        stripeRefundId: `re_payment_intent_${suffix}`,
        stripeChargeId: `ch_for_payment_intent_${suffix}`,
        stripePaymentIntentId: paymentIntentId,
        amount: { amount: 300, currency: 'usd' },
        stripeEventId: `evt_payment_intent_${suffix}`,
      }),
    ])
    const listSubscriptionInvoices = vi.fn<MembershipStripeOperations['listSubscriptionInvoices']>()
    listSubscriptionInvoices.mockResolvedValue([
      {
        status: 'paid',
        id: `in_batch_${suffix}`,
        amountPaid: 3000,
        currency: 'usd',
        created: 1_700_000_000,
        description: null,
        payments: [
          {
            amountPaid: 1000,
            payment: { type: 'charge', chargeId, paymentIntentId: null },
          },
          {
            amountPaid: 1000,
            payment: { type: 'payment_intent', chargeId: null, paymentIntentId },
          },
          {
            amountPaid: 1000,
            payment: {
              type: 'charge',
              chargeId: `ch_unmatched_${suffix}`,
              paymentIntentId: null,
            },
          },
        ],
      },
    ])

    const charges = await listRefundableChargesForSubscription(membership.stripe_subscription_id!, {
      listSubscriptionInvoices,
    })

    expect(charges.map(charge => charge.amount_refunded.amount)).toEqual([200, 300, 0])
    expect(charges.every(charge => charge.amount_refunded.currency === 'usd')).toBe(true)
    expect(listSubscriptionInvoices).toHaveBeenCalledOnce()
  })

  it('does not multiply a refund total when Stripe returns a duplicate identifier', async () => {
    const user = await createTestUser()
    const suffix = Math.random().toString(36).slice(2)
    const membership = await createTestMembership({
      user_id: user.id,
      stripe_subscription_id: `sub_duplicate_${suffix}`,
    })
    const chargeId = `ch_duplicate_${suffix}`
    await recordMembershipRefundWebhook({
      membershipId: membership.id,
      membershipSourceId: membership.membership_source_id,
      userId: user.id,
      stripeRefundId: `re_duplicate_${suffix}`,
      stripeChargeId: chargeId,
      stripePaymentIntentId: null,
      amount: { amount: 400, currency: 'usd' },
      stripeEventId: `evt_duplicate_${suffix}`,
    })
    const payment = {
      amountPaid: 1000,
      payment: { type: 'charge' as const, chargeId, paymentIntentId: null },
    }
    const listSubscriptionInvoices = vi.fn<MembershipStripeOperations['listSubscriptionInvoices']>()
    listSubscriptionInvoices.mockResolvedValue([
      {
        status: 'paid',
        id: `in_duplicate_${suffix}`,
        amountPaid: 2000,
        currency: 'usd',
        created: 1_700_000_000,
        description: null,
        payments: [payment, payment],
      },
    ])

    const charges = await listRefundableChargesForSubscription(membership.stripe_subscription_id!, {
      listSubscriptionInvoices,
    })

    expect(charges.map(charge => charge.amount_refunded.amount)).toEqual([400, 400])
  })
})

describe('buildAlreadyRefundedMinorUnitsQuery', () => {
  it('renders the batched UNNEST lookup for a single charge', () => {
    const query = buildAlreadyRefundedMinorUnitsQuery(['charge'], ['ch_test123'])
    expect(query.text).toMatchInlineSnapshot(`
      "/* getAlreadyRefundedMinorUnits */
          WITH requested_refunds AS (
            SELECT lookup_type, lookup_id
            FROM UNNEST($1::TEXT[], $2::TEXT[])
              AS requested_refund(lookup_type, lookup_id)
          )
          SELECT
            requested_refunds.lookup_type || ':' || requested_refunds.lookup_id AS lookup_key,
            COALESCE(SUM(membership_refunds.amount_minor_units), 0)::TEXT AS total
          FROM requested_refunds
          LEFT JOIN membership_refunds
            ON (
              requested_refunds.lookup_type = 'charge'
              AND membership_refunds.stripe_charge_id = requested_refunds.lookup_id
            )
            OR (
              requested_refunds.lookup_type = 'payment_intent'
              AND membership_refunds.stripe_payment_intent_id = requested_refunds.lookup_id
            )
          GROUP BY requested_refunds.lookup_type, requested_refunds.lookup_id
        "
    `)
    expect(query.values).toMatchInlineSnapshot(`
      [
        [
          "charge",
        ],
        [
          "ch_test123",
        ],
      ]
    `)
  })

  it('renders the batched UNNEST lookup for a mixed charge/payment-intent batch', () => {
    const query = buildAlreadyRefundedMinorUnitsQuery(
      ['charge', 'payment_intent'],
      ['ch_test123', 'pi_test456'],
    )
    expect(query.text).toMatchInlineSnapshot(`
      "/* getAlreadyRefundedMinorUnits */
          WITH requested_refunds AS (
            SELECT lookup_type, lookup_id
            FROM UNNEST($1::TEXT[], $2::TEXT[])
              AS requested_refund(lookup_type, lookup_id)
          )
          SELECT
            requested_refunds.lookup_type || ':' || requested_refunds.lookup_id AS lookup_key,
            COALESCE(SUM(membership_refunds.amount_minor_units), 0)::TEXT AS total
          FROM requested_refunds
          LEFT JOIN membership_refunds
            ON (
              requested_refunds.lookup_type = 'charge'
              AND membership_refunds.stripe_charge_id = requested_refunds.lookup_id
            )
            OR (
              requested_refunds.lookup_type = 'payment_intent'
              AND membership_refunds.stripe_payment_intent_id = requested_refunds.lookup_id
            )
          GROUP BY requested_refunds.lookup_type, requested_refunds.lookup_id
        "
    `)
    expect(query.values).toMatchInlineSnapshot(`
      [
        [
          "charge",
          "payment_intent",
        ],
        [
          "ch_test123",
          "pi_test456",
        ],
      ]
    `)
  })
})
