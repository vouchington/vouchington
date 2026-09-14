import { randomUUID } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { STRIPE_PROVIDER_ENVIRONMENT } from '@voucha/config'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import * as stripeInvoices from '@modules/stripe/invoices'
import * as stripeRefunds from '@modules/stripe/refunds'
import { getMembershipRefunds } from '@services/memberships/refunds'
import type { PrivateUser } from '@services/users/types'

describe('POST /api/v1/memberships/refunds', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the completed union after persisting the durable refund receipt', async () => {
    const fixture = await seedRefundableMembership()
    vi.spyOn(stripeInvoices, 'listStripeSubscriptionInvoices').mockResolvedValue(
      fakeInvoiceList(fixture),
    )
    vi.spyOn(stripeRefunds, 'createStripeRefund').mockResolvedValue(
      fakeStripeRefund(fixture, 'succeeded'),
    )
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .post('/api/v1/memberships/refunds')
      .send(refundRequest(fixture))
      .expect(201)

    expect(response.headers['retry-after']).toBeUndefined()
    expect(response.body).toEqual({
      outcome: 'completed',
      refund: { id: expect.any(String) },
      cancellation_status: 'not_requested',
    })
    expect(await getMembershipRefunds(fixture.target.id)).toEqual([
      expect.objectContaining({
        amount: { amount: 1000, currency: 'usd' },
        source: 'admin',
        stripe_charge_id: fixture.chargeId,
        stripe_refund_id: fixture.refundId,
      }),
    ])
  })

  it('returns 202 with Retry-After and exact replays do not create another refund', async () => {
    const fixture = await seedRefundableMembership()
    const listInvoices = vi
      .spyOn(stripeInvoices, 'listStripeSubscriptionInvoices')
      .mockResolvedValue(fakeInvoiceList(fixture))
    const createRefund = vi
      .spyOn(stripeRefunds, 'createStripeRefund')
      .mockResolvedValue(fakeStripeRefund(fixture, 'pending'))
    const request = createRequest()
    await request.authenticateAs(admin)
    const body = refundRequest(fixture)

    const first = await request.post('/api/v1/memberships/refunds').send(body).expect(202)
    await createTestMembership({
      user_id: fixture.target.id,
      stripe_subscription_id: `sub_replacement_${randomUUID()}`,
      provider_application_id: 'voucha-web',
      provider_environment: STRIPE_PROVIDER_ENVIRONMENT,
    })
    const replay = await request.post('/api/v1/memberships/refunds').send(body).expect(202)

    for (const response of [first, replay]) {
      expect(response.headers['retry-after']).toBe('300')
      expect(response.body).toEqual({ outcome: 'reconciling', retry_after_seconds: 300 })
    }
    expect(createRefund).toHaveBeenCalledOnce()
    expect(listInvoices).toHaveBeenCalledOnce()
    expect(await getMembershipRefunds(fixture.target.id)).toEqual([])
  })

  it('returns 409 when an idempotency key is replayed with a changed request', async () => {
    const fixture = await seedRefundableMembership()
    vi.spyOn(stripeInvoices, 'listStripeSubscriptionInvoices').mockResolvedValue(
      fakeInvoiceList(fixture),
    )
    const createRefund = vi
      .spyOn(stripeRefunds, 'createStripeRefund')
      .mockResolvedValue(fakeStripeRefund(fixture, 'pending'))
    const request = createRequest()
    await request.authenticateAs(admin)
    const body = refundRequest(fixture)

    await request.post('/api/v1/memberships/refunds').send(body).expect(202)
    const conflict = await request
      .post('/api/v1/memberships/refunds')
      .send({ ...body, reason: 'dispute' })
      .expect(409)

    expect(conflict.body).toMatchObject({
      message: 'Administrator refund idempotency key was reused for a different request',
    })
    expect(createRefund).toHaveBeenCalledOnce()
  })
})

type RefundFixture = Awaited<ReturnType<typeof seedRefundableMembership>>

async function seedRefundableMembership() {
  const target = await createTestUser()
  const subscriptionId = `sub_refund_${randomUUID()}`
  await createTestMembership({
    user_id: target.id,
    stripe_subscription_id: subscriptionId,
    provider_application_id: 'voucha-web',
    provider_environment: STRIPE_PROVIDER_ENVIRONMENT,
  })
  return {
    target,
    subscriptionId,
    chargeId: `ch_refund_${randomUUID()}`,
    invoiceId: `in_refund_${randomUUID()}`,
    refundId: `re_refund_${randomUUID()}`,
    idempotencyKey: randomUUID(),
  }
}

function refundRequest(fixture: RefundFixture) {
  return {
    user_id: fixture.target.id,
    charge_id: fixture.chargeId,
    invoice_id: fixture.invoiceId,
    reason: 'requested',
    idempotency_key: fixture.idempotencyKey,
  }
}

function fakeInvoiceList(fixture: RefundFixture) {
  return {
    data: [
      {
        status: 'paid',
        id: fixture.invoiceId,
        amount_paid: 1000,
        currency: 'usd',
        created: 1_700_000_000,
        description: null,
        payments: {
          data: [
            {
              amount_paid: 1000,
              payment: { type: 'charge', charge: fixture.chargeId },
            },
          ],
        },
      },
    ],
  } as never
}

function fakeStripeRefund(fixture: RefundFixture, status: 'pending' | 'succeeded') {
  return {
    id: fixture.refundId,
    charge: fixture.chargeId,
    payment_intent: null,
    amount: 1000,
    currency: 'usd',
    status,
  } as never
}
