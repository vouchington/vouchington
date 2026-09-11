import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, vi, beforeEach } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, createTestMembership } from '@voucha/test-helpers'
import * as stripeInvoices from '@modules/stripe/invoices'
import * as stripeRefunds from '@modules/stripe/refunds'
import * as stripeSubscriptions from '@modules/stripe/subscriptions'
import { getMembershipRefunds } from '@services/memberships/refunds'
import type { PrivateUser } from '@services/users/types'

function fakeInvoiceList(
  invoiceId: string,
  chargeId: string | null,
  paymentIntentId: string | null,
  amountMinorUnits = 1000,
) {
  return {
    data: [
      {
        status: 'paid',
        id: invoiceId,
        amount_paid: amountMinorUnits,
        currency: 'usd',
        created: 1700000000,
        description: null,
        payments: {
          data: [
            {
              payment: chargeId
                ? { type: 'charge', charge: chargeId }
                : { type: 'payment_intent', payment_intent: paymentIntentId },
            },
          ],
        },
      },
    ],
  } as never
}

async function seedRefundableMembership() {
  const target = await createTestUser()
  const subscriptionId = `sub_test_${Math.random().toString(36).slice(2, 10)}`
  await createTestMembership({ user_id: target.id, stripe_subscription_id: subscriptionId })
  return { target, subscriptionId }
}

describe('POST /api/v1/memberships/refunds', () => {
  let admin: PrivateUser
  let customerSupport: PrivateUser
  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    customerSupport = await createTestUser({ extraRoles: ['customer_support'] })
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 201 and persists a membership_refunds row for admin', async () => {
    const { target } = await seedRefundableMembership()
    const invoiceId = `in_admin_${Math.random().toString(36).slice(2, 8)}`
    const chargeId = `ch_admin_${Math.random().toString(36).slice(2, 8)}`
    const stripeRefundId = `re_admin_${Math.random().toString(36).slice(2, 8)}`
    const idempotencyKey = randomUUID()
    vi.spyOn(stripeInvoices, 'listStripeSubscriptionInvoices').mockResolvedValue(
      fakeInvoiceList(invoiceId, chargeId, null),
    )
    vi.spyOn(stripeRefunds, 'createStripeRefund').mockResolvedValue({
      id: stripeRefundId,
      charge: chargeId,
      payment_intent: null,
      amount: 1000,
      currency: 'usd',
    } as never)

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .post('/api/v1/memberships/refunds')
      .send({
        user_id: target.id,
        charge_id: chargeId,
        invoice_id: invoiceId,
        reason: 'goodwill',
        idempotency_key: idempotencyKey,
      })
      .expect(201)

    expect(response.body.refund).toHaveProperty('id')
    expect(response.body.cancellation_status).toBe('not_requested')
    const refunds = await getMembershipRefunds(target.id)
    expect(refunds).toHaveLength(1)
    expect(refunds[0]).toMatchObject({
      stripe_refund_id: stripeRefundId,
      stripe_charge_id: chargeId,
      reason: 'goodwill',
      revoked_access: false,
      source: 'admin',
    })
  })

  it('returns 201 and persists a membership_refunds row for customer_support', async () => {
    const { target } = await seedRefundableMembership()
    const invoiceId = `in_cs_${Math.random().toString(36).slice(2, 8)}`
    const paymentIntentId = `pi_cs_${Math.random().toString(36).slice(2, 8)}`
    const stripeRefundId = `re_cs_${Math.random().toString(36).slice(2, 8)}`
    // Stripe always attaches the underlying charge to a refund response, even when the refund
    // was requested by payment_intent_id (Stripe v22+ payment_intent-only charge path).
    const derivedChargeId = `ch_cs_derived_${Math.random().toString(36).slice(2, 8)}`
    vi.spyOn(stripeInvoices, 'listStripeSubscriptionInvoices').mockResolvedValue(
      fakeInvoiceList(invoiceId, null, paymentIntentId),
    )
    vi.spyOn(stripeRefunds, 'createStripeRefund').mockResolvedValue({
      id: stripeRefundId,
      charge: derivedChargeId,
      payment_intent: paymentIntentId,
      amount: 1000,
      currency: 'usd',
    } as never)

    const request = createRequest()
    await request.authenticateAs(customerSupport)
    const response = await request
      .post('/api/v1/memberships/refunds')
      .send({
        user_id: target.id,
        payment_intent_id: paymentIntentId,
        invoice_id: invoiceId,
        reason: 'requested',
        idempotency_key: randomUUID(),
      })
      .expect(201)

    expect(response.body.refund).toHaveProperty('id')
    expect(response.body.cancellation_status).toBe('not_requested')
    const refunds = await getMembershipRefunds(target.id)
    expect(refunds.find(r => r.stripe_refund_id === stripeRefundId)).toMatchObject({
      stripe_payment_intent_id: paymentIntentId,
      reason: 'requested',
    })
  })

  it('returns 201 for goodwill refund (cancel=false) and leaves the subscription active', async () => {
    const { target } = await seedRefundableMembership()
    const invoiceId = `in_gw_${Math.random().toString(36).slice(2, 8)}`
    const chargeId = `ch_gw_${Math.random().toString(36).slice(2, 8)}`
    const stripeRefundId = `re_gw_${Math.random().toString(36).slice(2, 8)}`
    vi.spyOn(stripeInvoices, 'listStripeSubscriptionInvoices').mockResolvedValue(
      fakeInvoiceList(invoiceId, chargeId, null),
    )
    vi.spyOn(stripeRefunds, 'createStripeRefund').mockResolvedValue({
      id: stripeRefundId,
      charge: chargeId,
      payment_intent: null,
      amount: 1000,
      currency: 'usd',
    } as never)
    const cancelSpy = vi.spyOn(stripeSubscriptions, 'cancelStripeSubscriptionImmediately')

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .post('/api/v1/memberships/refunds')
      .send({
        user_id: target.id,
        charge_id: chargeId,
        invoice_id: invoiceId,
        reason: 'goodwill',
        cancel: false,
        idempotency_key: randomUUID(),
      })
      .expect(201)

    expect(response.body.refund).toHaveProperty('id')
    expect(response.body.cancellation_status).toBe('not_requested')
    expect(cancelSpy).not.toHaveBeenCalled()
    const refunds = await getMembershipRefunds(target.id)
    expect(refunds.find(r => r.stripe_refund_id === stripeRefundId)?.revoked_access).toBe(false)
  })

  it('returns 201 for revoke refund (cancel=true) and cancels the subscription', async () => {
    const { target, subscriptionId } = await seedRefundableMembership()
    const invoiceId = `in_rv_${Math.random().toString(36).slice(2, 8)}`
    const chargeId = `ch_rv_${Math.random().toString(36).slice(2, 8)}`
    const stripeRefundId = `re_rv_${Math.random().toString(36).slice(2, 8)}`
    vi.spyOn(stripeInvoices, 'listStripeSubscriptionInvoices').mockResolvedValue(
      fakeInvoiceList(invoiceId, chargeId, null),
    )
    vi.spyOn(stripeRefunds, 'createStripeRefund').mockResolvedValue({
      id: stripeRefundId,
      charge: chargeId,
      payment_intent: null,
      amount: 1000,
      currency: 'usd',
    } as never)
    const cancelSpy = vi
      .spyOn(stripeSubscriptions, 'cancelStripeSubscriptionImmediately')
      .mockResolvedValue({} as never)

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .post('/api/v1/memberships/refunds')
      .send({
        user_id: target.id,
        charge_id: chargeId,
        invoice_id: invoiceId,
        reason: 'dispute',
        cancel: true,
        idempotency_key: randomUUID(),
      })
      .expect(201)

    expect(response.body.refund).toHaveProperty('id')
    expect(response.body.cancellation_status).toBe('completed')
    expect(cancelSpy).toHaveBeenCalledWith(subscriptionId)
    const refunds = await getMembershipRefunds(target.id)
    expect(refunds.find(r => r.stripe_refund_id === stripeRefundId)?.revoked_access).toBe(true)
  })

  it('returns 201 with pending cancellation after the refund succeeds without revoking access', async () => {
    const { target } = await seedRefundableMembership()
    const invoiceId = `in_pending_${Math.random().toString(36).slice(2, 8)}`
    const chargeId = `ch_pending_${Math.random().toString(36).slice(2, 8)}`
    const stripeRefundId = `re_pending_${Math.random().toString(36).slice(2, 8)}`
    vi.spyOn(stripeInvoices, 'listStripeSubscriptionInvoices').mockResolvedValue(
      fakeInvoiceList(invoiceId, chargeId, null),
    )
    vi.spyOn(stripeRefunds, 'createStripeRefund').mockResolvedValue({
      id: stripeRefundId,
      charge: chargeId,
      payment_intent: null,
      amount: 1000,
      currency: 'usd',
    } as never)
    vi.spyOn(stripeSubscriptions, 'cancelStripeSubscriptionImmediately').mockRejectedValue(
      new Error('Stripe cancellation unavailable'),
    )

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .post('/api/v1/memberships/refunds')
      .send({
        user_id: target.id,
        charge_id: chargeId,
        invoice_id: invoiceId,
        reason: 'dispute',
        cancel: true,
        idempotency_key: randomUUID(),
      })
      .expect(201)

    expect(response.body).toEqual({
      refund: { id: expect.any(String) },
      cancellation_status: 'pending',
    })
    const refunds = await getMembershipRefunds(target.id)
    expect(refunds.find(r => r.stripe_refund_id === stripeRefundId)?.revoked_access).toBe(false)
  })
})
