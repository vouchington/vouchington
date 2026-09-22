import { describe, it, expect, beforeAll, vi, beforeEach } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, createTestMembership } from '@voucha/test-helpers'
import * as stripeInvoices from '@modules/stripe/invoices'
import { recordMembershipRefundEvent } from '@services/memberships/refunds'
import type { PrivateUser } from '@services/users/types'

function fakeInvoiceList(
  invoiceId: string,
  chargeId: string,
  amountMinorUnits = 1000,
  currency = 'usd',
) {
  return {
    data: [
      {
        status: 'paid',
        id: invoiceId,
        amount_paid: amountMinorUnits,
        currency,
        created: 1700000000,
        description: null,
        payments: {
          data: [{ payment: { type: 'charge', charge: chargeId } }],
        },
      },
    ],
  } as never
}

async function seedRefundableMembership() {
  const target = await createTestUser()
  const subscriptionId = `sub_test_${Math.random().toString(36).slice(2, 10)}`
  const membership = await createTestMembership({
    user_id: target.id,
    stripe_subscription_id: subscriptionId,
  })
  return { target, membership }
}

describe('GET /api/v1/memberships/refundable-charges', () => {
  let admin: PrivateUser
  let formerSupport: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    formerSupport = await createTestUser({ extraRoles: ['customer_support'] })
    regularUser = await createTestUser()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/memberships/refundable-charges').expect(401)
  })

  it('returns 403 when user is not an administrator', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.get('/api/v1/memberships/refundable-charges').expect(403)
  })

  it('returns 403 for a former support role', async () => {
    const request = createRequest()
    await request.authenticateAs(formerSupport)
    await request.get('/api/v1/memberships/refundable-charges').expect(403)
  })

  it('returns 400 when user_id is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get('/api/v1/memberships/refundable-charges').expect(400)
  })

  it('returns 200 with real refundable charges for admin', async () => {
    const { target } = await seedRefundableMembership()
    const invoiceId = `in_admin_${Math.random().toString(36).slice(2, 8)}`
    const chargeId = `ch_admin_${Math.random().toString(36).slice(2, 8)}`
    vi.spyOn(stripeInvoices, 'listStripeSubscriptionInvoices').mockResolvedValue(
      fakeInvoiceList(invoiceId, chargeId),
    )

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get(`/api/v1/memberships/refundable-charges?user_id=${target.id}`)
      .expect(200)

    expect(response.body.charges).toEqual([
      expect.objectContaining({
        charge_id: chargeId,
        invoice_id: invoiceId,
        amount: { amount: 1000, currency: 'usd' },
        amount_refunded: { amount: 0, currency: 'usd' },
      }),
    ])
  })

  it('does not expose a Stripe charge in an unsupported currency', async () => {
    const { target } = await seedRefundableMembership()
    vi.spyOn(stripeInvoices, 'listStripeSubscriptionInvoices').mockResolvedValue(
      fakeInvoiceList('in_bhd', 'ch_bhd', 1000, 'bhd'),
    )
    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get(`/api/v1/memberships/refundable-charges?user_id=${target.id}`)
      .expect(200)
    expect(response.body.charges).toEqual([])
  })

  it('reflects a prior real refund in amount_refunded', async () => {
    const { target, membership } = await seedRefundableMembership()
    const invoiceId = `in_partial_${Math.random().toString(36).slice(2, 8)}`
    const chargeId = `ch_partial_${Math.random().toString(36).slice(2, 8)}`
    vi.spyOn(stripeInvoices, 'listStripeSubscriptionInvoices').mockResolvedValue(
      fakeInvoiceList(invoiceId, chargeId, 1000),
    )
    await recordMembershipRefundEvent({
      membershipId: membership.id,
      membershipSourceId: membership.membership_source_id,
      userId: target.id,
      stripeRefundId: `re_partial_${Math.random().toString(36).slice(2, 8)}`,
      stripeChargeId: chargeId,
      stripePaymentIntentId: null,
      amount: { amount: 400, currency: 'usd' },
      stripeEventId: `evt_partial_${Math.random().toString(36).slice(2, 8)}`,
    })

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get(`/api/v1/memberships/refundable-charges?user_id=${target.id}`)
      .expect(200)

    expect(response.body.charges).toEqual([
      expect.objectContaining({
        charge_id: chargeId,
        amount_refunded: { amount: 400, currency: 'usd' },
      }),
    ])
  })

  it('reflects a prior real refund recorded by payment_intent_id in amount_refunded', async () => {
    const { target, membership } = await seedRefundableMembership()
    const invoiceId = `in_pi_${Math.random().toString(36).slice(2, 8)}`
    const paymentIntentId = `pi_partial_${Math.random().toString(36).slice(2, 8)}`
    // Stripe always attaches the underlying charge to a refund response, even when the refund
    // was requested by payment_intent_id (see refund.test.mts) — membership_refunds.stripe_charge_id
    // is NOT NULL, so a real persisted row always has one alongside the payment_intent_id.
    const derivedChargeId = `ch_pi_derived_${Math.random().toString(36).slice(2, 8)}`
    vi.spyOn(stripeInvoices, 'listStripeSubscriptionInvoices').mockResolvedValue({
      data: [
        {
          status: 'paid',
          id: invoiceId,
          amount_paid: 1000,
          currency: 'usd',
          created: 1700000000,
          description: null,
          payments: {
            data: [{ payment: { type: 'payment_intent', payment_intent: paymentIntentId } }],
          },
        },
      ],
    } as never)
    await recordMembershipRefundEvent({
      membershipId: membership.id,
      membershipSourceId: membership.membership_source_id,
      userId: target.id,
      stripeRefundId: `re_pi_${Math.random().toString(36).slice(2, 8)}`,
      stripeChargeId: derivedChargeId,
      stripePaymentIntentId: paymentIntentId,
      amount: { amount: 250, currency: 'usd' },
      stripeEventId: `evt_pi_${Math.random().toString(36).slice(2, 8)}`,
    })

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get(`/api/v1/memberships/refundable-charges?user_id=${target.id}`)
      .expect(200)

    expect(response.body.charges).toEqual([
      expect.objectContaining({
        payment_intent_id: paymentIntentId,
        amount_refunded: { amount: 250, currency: 'usd' },
      }),
    ])
  })
})
