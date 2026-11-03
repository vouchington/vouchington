import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestMembership,
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
  getUserVerificationState,
} from '@voucha/test-helpers'
import { createPaymentPendingUser } from '@voucha/test-helpers/services/identity-verification/payment-pending-fixtures'
import {
  createStripeEvent,
  createTestStripeSubscription,
  createUniqueStripeId,
  createUniqueStripePriceId,
} from '@voucha/test-helpers/membership-stripe-fixtures'
import { getMembershipByUserId } from '@services/memberships'
import { insertStripeEvent } from '@services/stripe/insert-event'
import * as stripeCustomers from '@modules/stripe/customers'
import { getStripeInvoice } from '@modules/stripe'
import { getStripeSubscription } from '@modules/stripe/subscriptions'
import { getTestMembershipRefunds } from '@voucha/test-helpers/entities/membership-refund-event-state'
import { handleStripeEvent } from './event-handlers.mts'

const { mockGetStripeSubscription } = vi.hoisted(() => ({
  mockGetStripeSubscription: vi.fn<typeof getStripeSubscription>(),
}))
const applicationContext = { applicationId: `stripe-event-handlers-${randomUUID()}` }

vi.mock<typeof import('@modules/stripe')>(import('@modules/stripe'), async importActual => ({
  ...(await importActual()),
  getStripeInvoice: vi.fn<VitestLooseMock>(),
}))

vi.mock<typeof import('@modules/stripe/subscriptions')>(
  import('@modules/stripe/subscriptions'),
  async importActual => ({
    ...(await importActual()),
    getStripeSubscription: mockGetStripeSubscription,
  }),
)

function productionEvent(type: string, object: Record<string, unknown>) {
  const event = createStripeEvent(type, object)
  event.livemode = true
  return event
}

function productionSubscription(options: {
  id: string
  status: 'active' | 'past_due' | 'canceled'
  stripePriceId: string
  customerId: string
}) {
  const subscription = createTestStripeSubscription(options)
  return {
    ...subscription,
    customer: options.customerId,
    livemode: true,
    items: {
      ...subscription.items,
      data: [{ price: { id: options.stripePriceId, unit_amount: 500, currency: 'usd' } }],
    },
  } as Awaited<ReturnType<typeof getStripeSubscription>>
}

async function seedMembership(status: 'active' | 'past_due' | 'canceled') {
  const user = await createTestUser()
  const stripePriceId = createUniqueStripePriceId('handlers')
  const subscriptionId = createUniqueStripeId('sub', 'handlers')
  const customerId = createUniqueStripeId('cus', 'handlers')
  const sku = await createTestSku({
    stripe_price_id: stripePriceId,
    provider_application_id: applicationContext.applicationId,
  })
  const membership = await createTestMembership({
    user_id: user.id,
    sku_id: sku.id,
    stripe_subscription_id: subscriptionId,
    stripe_customer_id: customerId,
    provider_environment: 'production',
    provider_application_id: applicationContext.applicationId,
  })
  mockGetStripeSubscription.mockResolvedValue(
    productionSubscription({ id: subscriptionId, status, stripePriceId, customerId }),
  )
  return { membership, subscriptionId, customerId }
}

describe('handleStripeEvent', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockGetStripeSubscription.mockReset()
  })

  it.each(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])(
    'creates the membership from a paid subscription %s',
    async type => {
      const user = await createTestUser()
      const stripePriceId = createUniqueStripePriceId('checkout')
      const customerId = createUniqueStripeId('cus', 'checkout')
      const subscriptionId = createUniqueStripeId('sub', 'checkout')
      await createTestSku({
        plan: 'plus',
        stripe_price_id: stripePriceId,
        provider_application_id: applicationContext.applicationId,
      })
      vi.spyOn(stripeCustomers, 'getStripeCustomer').mockResolvedValue({
        id: customerId,
        object: 'customer',
        metadata: { userId: user.id },
      } as unknown as Awaited<ReturnType<typeof stripeCustomers.getStripeCustomer>>)
      mockGetStripeSubscription.mockResolvedValue(
        productionSubscription({ id: subscriptionId, status: 'active', stripePriceId, customerId }),
      )
      const event = await insertStripeEvent(
        productionEvent(type, {
          id: createUniqueStripeId('cs', 'checkout'),
          mode: 'subscription',
          payment_status: 'paid',
          subscription: subscriptionId,
          customer: customerId,
        }),
      )

      const result = await handleStripeEvent(event.payload, applicationContext)

      expect(result).toBe('processed')
      expect(await getMembershipByUserId(user.id)).toMatchObject({ plan: 'plus', status: 'active' })
    },
  )

  it('does not fetch the subscription for an unpaid subscription checkout', async () => {
    const result = await handleStripeEvent(
      productionEvent('checkout.session.completed', {
        id: createUniqueStripeId('cs', 'unpaid'),
        mode: 'subscription',
        payment_status: 'unpaid',
        subscription: createUniqueStripeId('sub', 'unpaid'),
        customer: createUniqueStripeId('cus', 'unpaid'),
      }),
      applicationContext,
    )

    expect(result).toBe('processed')
    expect(mockGetStripeSubscription).not.toHaveBeenCalled()
  })

  it('synchronizes the subscription and releases the identity checkout on async payment failure', async () => {
    const { membership, subscriptionId, customerId } = await seedMembership('past_due')
    const identity = await createPaymentPendingUser()
    const event = await insertStripeEvent(
      productionEvent('checkout.session.async_payment_failed', {
        id: identity.checkoutSessionId,
        subscription: subscriptionId,
        customer: customerId,
        metadata: { intent: 'identity-verification', user_id: identity.user.id },
      }),
    )

    const result = await handleStripeEvent(event.payload, applicationContext)

    expect(result).toBe('processed')
    expect(mockGetStripeSubscription).toHaveBeenCalledWith(subscriptionId)
    expect((await getTestMembershipRaw(membership.id))?.status).toBe('past_due')
    expect((await getUserVerificationState(identity.user.id))?.verification_status).toBe(
      'unverified',
    )
  })

  it.each(['customer.subscription.updated', 'customer.subscription.resumed'])(
    'synchronizes the membership from %s',
    async type => {
      const { membership, subscriptionId, customerId } = await seedMembership('past_due')
      const event = await insertStripeEvent(
        productionEvent(type, { id: subscriptionId, object: 'subscription', customer: customerId }),
      )

      const result = await handleStripeEvent(event.payload, applicationContext)

      expect(result).toBe('processed')
      expect((await getTestMembershipRaw(membership.id))?.status).toBe('past_due')
    },
  )

  it('cancels the membership from customer.subscription.deleted', async () => {
    const { membership, subscriptionId, customerId } = await seedMembership('canceled')
    const event = await insertStripeEvent(
      productionEvent('customer.subscription.deleted', {
        id: subscriptionId,
        object: 'subscription',
        customer: customerId,
      }),
    )

    const result = await handleStripeEvent(event.payload, applicationContext)

    expect(result).toBe('processed')
    expect((await getTestMembershipRaw(membership.id))?.status).toBe('cancelled')
  })

  it.each(['invoice.payment_failed', 'invoice.payment_action_required'])(
    'moves the active membership to past_due from %s',
    async type => {
      const { membership, subscriptionId, customerId } = await seedMembership('past_due')
      const event = await insertStripeEvent(
        productionEvent(type, {
          id: createUniqueStripeId('in', 'handlers'),
          object: 'invoice',
          customer: customerId,
          subscription: subscriptionId,
        }),
      )

      const result = await handleStripeEvent(event.payload, applicationContext)

      expect(result).toBe('processed')
      expect((await getTestMembershipRaw(membership.id))?.status).toBe('past_due')
    },
  )

  it('records the refund receipt from charge.refunded', async () => {
    const user = await createTestUser()
    const sku = await createTestSku({
      provider_application_id: applicationContext.applicationId,
      provider_environment: 'test',
    })
    const subscriptionId = createUniqueStripeId('sub', 'refund')
    await createTestMembership({
      user_id: user.id,
      sku_id: sku.id,
      stripe_subscription_id: subscriptionId,
      provider_application_id: applicationContext.applicationId,
      provider_environment: 'test',
    })
    vi.mocked(getStripeInvoice).mockResolvedValue({
      parent: { subscription_details: { subscription: subscriptionId } },
    } as never)
    const refundId = createUniqueStripeId('re', 'refund')

    const result = await handleStripeEvent(
      createStripeEvent('charge.refunded', {
        id: createUniqueStripeId('ch', 'refund'),
        invoice: 'in_1',
        created: 1_700_000_000,
        refunds: {
          data: [{ id: refundId, amount: 1000, currency: 'usd', metadata: {} }],
          has_more: false,
        },
      }),
      applicationContext,
    )

    expect(result).toBe('processed')
    expect(
      (await getTestMembershipRefunds(user.id)).find(
        refund => refund.stripe_refund_id === refundId,
      ),
    ).toMatchObject({ source: 'stripe_dashboard', has_revoked_access: false })
  })

  it.each(['customer.subscription.created', 'invoice.finalized', 'payment_intent.created'])(
    'ignores %s',
    async type => {
      const result = await handleStripeEvent(productionEvent(type, { id: 'obj_1' }))

      expect(result).toBe('ignored')
    },
  )
})
