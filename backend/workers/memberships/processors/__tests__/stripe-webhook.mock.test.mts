import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestMembership,
  createTestSku,
  createTestUser,
  getTestMembershipRaw,
} from '@voucha/test-helpers'
import { getMembershipByUserId } from '@services/memberships'
import { getStripeEventByStripeEventId, insertStripeEvent } from '@services/stripe/events'
import * as stripeCustomers from '@modules/stripe/customers'
import { getStripeSubscription } from '@modules/stripe/subscriptions'
import {
  createStripeEvent,
  createTestStripeSubscription,
  createUniqueStripeId,
  createUniqueStripePriceId,
  toJobData,
} from '../stripe-webhook-test-fixtures.mts'
import { processStripeWebhook } from '../stripe-webhook.mts'

const { mockGetStripeSubscription } = vi.hoisted(() => ({
  mockGetStripeSubscription: vi.fn<typeof getStripeSubscription>(),
}))
const applicationContext = { applicationId: `stripe-webhook-${randomUUID()}` }

vi.mock<typeof import('@modules/stripe/subscriptions')>(
  import('@modules/stripe/subscriptions'),
  async importActual => ({
    ...(await importActual()),
    getStripeSubscription: mockGetStripeSubscription,
  }),
)

describe('stripe-webhook', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockGetStripeSubscription.mockReset()
  })
  describe('processStripeWebhook', () => {
    it('creates membership from invoice.paid', async () => {
      const user = await createTestUser()
      const stripePriceId = createUniqueStripePriceId('invoice_paid')
      const customerId = createUniqueStripeId('cus', 'invoice_paid')
      const subscriptionId = createUniqueStripeId('sub', 'invoice_paid')
      const invoiceId = createUniqueStripeId('in', 'invoice_paid')
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
        createProductionStripeSubscription({
          id: subscriptionId,
          status: 'active',
          stripePriceId,
          customerId,
        }),
      )

      const storedEvent = await insertStripeEvent(
        createProductionStripeEvent('invoice.paid', {
          id: invoiceId,
          object: 'invoice',
          customer: customerId,
          subscription: subscriptionId,
        }),
      )
      await processStripeWebhook(toJobData(storedEvent), true, undefined, applicationContext)

      const membership = await getMembershipByUserId(user.id)
      expect(membership).not.toBeNull()
      expect(membership?.plan).toBe('plus')
      expect(membership?.status).toBe('active')

      const raw = await getTestMembershipRaw(membership!.id)
      expect(raw?.expires_at).not.toBeNull()

      const processedEvent = await getStripeEventByStripeEventId(storedEvent.stripe_event_id)
      expect(processedEvent?.status).toBe('processed')
    })

    it('marks existing membership past_due on invoice.payment_failed', async () => {
      const user = await createTestUser()
      const stripePriceId = createUniqueStripePriceId('payment_failed')
      const subscriptionId = createUniqueStripeId('sub', 'payment_failed')
      const customerId = createUniqueStripeId('cus', 'payment_failed')
      const invoiceId = createUniqueStripeId('in', 'payment_failed')
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
        createProductionStripeSubscription({
          id: subscriptionId,
          status: 'past_due',
          stripePriceId,
          customerId,
        }),
      )

      const storedEvent = await insertStripeEvent(
        createProductionStripeEvent('invoice.payment_failed', {
          id: invoiceId,
          object: 'invoice',
          customer: customerId,
          subscription: subscriptionId,
        }),
      )
      await processStripeWebhook(toJobData(storedEvent), true, undefined, applicationContext)

      const raw = await getTestMembershipRaw(membership.id)
      expect(raw?.status).toBe('past_due')
      expect(mockGetStripeSubscription).toHaveBeenCalledWith(subscriptionId)
    })

    it('marks existing membership paused from customer.subscription.paused', async () => {
      const user = await createTestUser()
      const stripePriceId = createUniqueStripePriceId('paused')
      const subscriptionId = createUniqueStripeId('sub', 'paused')
      const customerId = createUniqueStripeId('cus', 'paused')
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
        createProductionStripeSubscription({
          id: subscriptionId,
          status: 'paused',
          stripePriceId,
          customerId,
        }),
      )

      const storedEvent = await insertStripeEvent(
        createProductionStripeEvent('customer.subscription.paused', {
          id: subscriptionId,
          object: 'subscription',
          customer: customerId,
          status: 'paused',
          cancel_at_period_end: false,
          current_period_end: Math.floor(Date.now() / 1000) + 60 * 60,
          items: { data: [{ price: { id: stripePriceId } }] },
        }),
      )
      await processStripeWebhook(toJobData(storedEvent), true, undefined, applicationContext)

      const raw = await getTestMembershipRaw(membership.id)
      expect(raw?.status).toBe('paused')
      expect(mockGetStripeSubscription).toHaveBeenCalledWith(subscriptionId)
    })

    it('marks non-membership events ignored', async () => {
      const customerId = createUniqueStripeId('cus', 'upcoming')
      const subscriptionId = createUniqueStripeId('sub', 'upcoming')
      const invoiceId = createUniqueStripeId('in', 'upcoming')
      const storedEvent = await insertStripeEvent(
        createStripeEvent('invoice.upcoming', {
          id: invoiceId,
          object: 'invoice',
          customer: customerId,
          subscription: subscriptionId,
        }),
      )
      await processStripeWebhook(toJobData(storedEvent), true, undefined, applicationContext)

      const ignoredEvent = await getStripeEventByStripeEventId(storedEvent.stripe_event_id)
      expect(ignoredEvent?.status).toBe('ignored')
    })

    it('skips duplicate jobs after processing has been acquired', async () => {
      const user = await createTestUser()
      const stripePriceId = createUniqueStripePriceId('duplicate_processing')
      const subscriptionId = createUniqueStripeId('sub', 'duplicate_processing')
      const customerId = createUniqueStripeId('cus', 'duplicate_processing')
      const invoiceId = createUniqueStripeId('in', 'duplicate_processing')
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
        createProductionStripeSubscription({
          id: subscriptionId,
          status: 'past_due',
          stripePriceId,
          customerId,
        }),
      )

      const storedEvent = await insertStripeEvent(
        createProductionStripeEvent('invoice.payment_failed', {
          id: invoiceId,
          object: 'invoice',
          customer: customerId,
          subscription: subscriptionId,
        }),
      )
      await processStripeWebhook(toJobData(storedEvent), true, undefined, applicationContext)
      await processStripeWebhook(toJobData(storedEvent), true, undefined, applicationContext)

      const processedEvent = await getStripeEventByStripeEventId(storedEvent.stripe_event_id)
      expect(processedEvent?.processing_attempts).toBe(1)

      const raw = await getTestMembershipRaw(membership.id)
      expect(raw?.status).toBe('past_due')
      expect(mockGetStripeSubscription).toHaveBeenCalledOnce()
      expect(mockGetStripeSubscription).toHaveBeenCalledWith(subscriptionId)
    })
  })
})

function createProductionStripeEvent(type: string, object: Record<string, unknown>) {
  const event = createStripeEvent(type, object)
  event.livemode = true
  return event
}

function createProductionStripeSubscription(
  options: Parameters<typeof createTestStripeSubscription>[0] & { customerId: string },
) {
  const subscription = createTestStripeSubscription(options)
  return {
    ...subscription,
    customer: options.customerId,
    livemode: true,
    items: {
      ...subscription.items,
      data: [
        {
          price: {
            id: options.stripePriceId,
            unit_amount: 500,
            currency: 'usd',
          },
        },
      ],
    },
  } as Awaited<ReturnType<typeof getStripeSubscription>>
}
