import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT } from '@services/memberships/create-types'
import { handleStripeWebhookEvent } from './webhook-handlers.mts'

const mockOnVerificationSessionCanceled =
  vi.fn<(eventId: string, eventData: Record<string, unknown>) => Promise<void>>()
const mockHandleCheckoutSessionPaymentFailed =
  vi.fn<
    (
      eventId: string,
      eventData: Record<string, unknown>,
      dependencies: undefined,
      applicationContext: { applicationId: string },
    ) => Promise<void>
  >()
const mockHandleSubscriptionDeleted =
  vi.fn<
    (
      eventId: string,
      eventData: Record<string, unknown>,
      onMembershipLapse: undefined,
      applicationContext: { applicationId: string },
    ) => Promise<void>
  >()
const mockHandleInvoicePaymentPaid =
  vi.fn<
    (
      eventData: Record<string, unknown>,
      providerEnvironment: 'test' | 'production',
      dependencies: undefined,
      applicationContext: { applicationId: string },
    ) => Promise<void>
  >()
const mockHandleChargeDisputeClosed =
  vi.fn<
    (
      eventData: Record<string, unknown>,
      providerEnvironment: 'test' | 'production',
      dependencies: undefined,
      applicationContext: { applicationId: string },
    ) => Promise<void>
  >()

function makeEvent(type: string, data: Record<string, unknown> = {}): Stripe.Event {
  return { id: 'evt_1', type, data: { object: data } } as unknown as Stripe.Event
}

describe('handleStripeWebhookEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes identity.verification_session.redacted to onVerificationSessionCanceled', async () => {
    const result = await handleStripeWebhookEvent(
      makeEvent('identity.verification_session.redacted', { id: 'vs_test' }),
      {
        onVerificationSessionCanceled: mockOnVerificationSessionCanceled as never,
      },
    )
    expect(result).toBe('processed')
    expect(mockOnVerificationSessionCanceled).toHaveBeenCalledWith('evt_1', { id: 'vs_test' })
  })

  it('routes identity.verification_session.canceled to onVerificationSessionCanceled', async () => {
    const result = await handleStripeWebhookEvent(
      makeEvent('identity.verification_session.canceled', { id: 'vs_test' }),
      {
        onVerificationSessionCanceled: mockOnVerificationSessionCanceled as never,
      },
    )
    expect(result).toBe('processed')
    expect(mockOnVerificationSessionCanceled).toHaveBeenCalledWith('evt_1', { id: 'vs_test' })
  })

  it('routes checkout.session.async_payment_failed to handleCheckoutSessionPaymentFailed', async () => {
    const eventData = { subscription: 'sub_1' }
    const result = await handleStripeWebhookEvent(
      makeEvent('checkout.session.async_payment_failed', eventData),
      {
        handleCheckoutSessionPaymentFailed: mockHandleCheckoutSessionPaymentFailed as never,
      },
    )

    expect(result).toBe('processed')
    expect(mockHandleCheckoutSessionPaymentFailed).toHaveBeenCalledWith(
      'evt_1',
      eventData,
      undefined,
      DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
    )
  })

  it('propagates a custom membership application context to async checkout failures', async () => {
    const eventData = { subscription: 'sub_1' }
    const applicationContext = { applicationId: 'test-custom-stripe-context' }
    await handleStripeWebhookEvent(
      makeEvent('checkout.session.async_payment_failed', eventData),
      { handleCheckoutSessionPaymentFailed: mockHandleCheckoutSessionPaymentFailed as never },
      applicationContext,
    )

    expect(mockHandleCheckoutSessionPaymentFailed).toHaveBeenCalledWith(
      'evt_1',
      eventData,
      undefined,
      applicationContext,
    )
  })

  it('routes invoice_payment.paid by InvoicePayment invoice and provider environment', async () => {
    const eventData = { invoice: 'in_invoice_payment_paid' }
    const result = await handleStripeWebhookEvent(makeEvent('invoice_payment.paid', eventData), {
      handleInvoicePaymentPaid: mockHandleInvoicePaymentPaid as never,
    })

    expect(result).toBe('processed')
    expect(mockHandleInvoicePaymentPaid).toHaveBeenCalledWith(
      eventData,
      'test',
      undefined,
      DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
    )
  })

  it('routes customer.subscription.deleted to handleSubscriptionDeleted', async () => {
    const eventData = { id: 'sub_1' }
    const result = await handleStripeWebhookEvent(
      makeEvent('customer.subscription.deleted', eventData),
      {
        handleSubscriptionDeleted: mockHandleSubscriptionDeleted as never,
      },
    )

    expect(result).toBe('processed')
    expect(mockHandleSubscriptionDeleted).toHaveBeenCalledWith(
      'evt_1',
      eventData,
      undefined,
      DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
    )
  })

  it('propagates a custom membership application context to subscription handlers', async () => {
    const eventData = { id: 'sub_1' }
    const applicationContext = { applicationId: 'test-custom-stripe-context' }
    await handleStripeWebhookEvent(
      makeEvent('customer.subscription.deleted', eventData),
      { handleSubscriptionDeleted: mockHandleSubscriptionDeleted as never },
      applicationContext,
    )

    expect(mockHandleSubscriptionDeleted).toHaveBeenCalledWith(
      'evt_1',
      eventData,
      undefined,
      applicationContext,
    )
  })

  it('routes checkout.session.async_payment_succeeded with the default membership application context', async () => {
    const eventData = { id: 'object_1' }
    const handler =
      vi.fn<
        (
          eventId: string,
          eventData: Record<string, unknown>,
          dependencies: undefined,
          applicationContext?: { applicationId: string },
        ) => Promise<void>
      >()
    const result = await handleStripeWebhookEvent(
      makeEvent('checkout.session.async_payment_succeeded', eventData),
      {
        handleCheckoutSessionCompleted: handler as never,
      },
    )

    expect(result).toBe('processed')
    expect(handler).toHaveBeenCalledWith(
      'evt_1',
      eventData,
      undefined,
      DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
    )
  })

  it.each([
    ['checkout.session.expired', 'onCheckoutAbortedForIdentity'],
    ['identity.verification_session.verified', 'onVerificationSessionVerified'],
    ['identity.verification_session.requires_input', 'onVerificationSessionRequiresInput'],
  ] as const)('routes %s to its handler', async (type, dependencyName) => {
    const eventData = { id: 'object_1' }
    const handler = vi.fn<(eventId: string, eventData: Record<string, unknown>) => Promise<void>>()

    const result = await handleStripeWebhookEvent(makeEvent(type, eventData), {
      [dependencyName]: handler,
    } as never)

    expect(result).toBe('processed')
    expect(handler).toHaveBeenCalledWith('evt_1', eventData)
  })

  it('routes charge.refunded with its provider environment', async () => {
    const eventData = { id: 'object_1' }
    const handler =
      vi.fn<
        (
          eventId: string,
          eventData: Record<string, unknown>,
          providerEnvironment: 'test' | 'production',
          applicationContext?: { applicationId: string },
        ) => Promise<void>
      >()

    const result = await handleStripeWebhookEvent(makeEvent('charge.refunded', eventData), {
      handleChargeRefunded: handler,
    })

    expect(result).toBe('processed')
    expect(handler).toHaveBeenCalledWith(
      'evt_1',
      eventData,
      'test',
      DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
    )
  })

  it.each(['charge.dispute.closed', 'charge.dispute.funds_reinstated'])(
    'routes %s with its provider environment',
    async eventType => {
      const eventData = { charge: 'ch_dispute_recovery', id: 'dp_dispute_recovery' }
      const result = await handleStripeWebhookEvent(makeEvent(eventType, eventData), {
        handleChargeDisputeClosed: mockHandleChargeDisputeClosed,
      } as never)

      expect(result).toBe('processed')
      expect(mockHandleChargeDisputeClosed).toHaveBeenCalledWith(
        eventData,
        'test',
        undefined,
        DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
      )
    },
  )

  it('propagates a custom membership application context to Stripe reversal handlers', async () => {
    const applicationContext = { applicationId: 'test-custom-stripe-context' }
    const refundHandler =
      vi.fn<
        (
          eventId: string,
          eventData: Record<string, unknown>,
          providerEnvironment: 'test' | 'production',
          applicationContext: { applicationId: string },
        ) => Promise<void>
      >()
    const invoiceData = { invoice: 'in_1' }
    const refundData = { id: 'ch_1' }
    const disputeData = { id: 'dp_1' }

    await handleStripeWebhookEvent(
      makeEvent('invoice_payment.paid', invoiceData),
      { handleInvoicePaymentPaid: mockHandleInvoicePaymentPaid as never },
      applicationContext,
    )
    await handleStripeWebhookEvent(
      makeEvent('charge.refunded', refundData),
      { handleChargeRefunded: refundHandler as never },
      applicationContext,
    )
    await handleStripeWebhookEvent(
      makeEvent('charge.dispute.closed', disputeData),
      { handleChargeDisputeClosed: mockHandleChargeDisputeClosed as never },
      applicationContext,
    )

    expect(mockHandleInvoicePaymentPaid).toHaveBeenCalledWith(
      invoiceData,
      'test',
      undefined,
      applicationContext,
    )
    expect(refundHandler).toHaveBeenCalledWith('evt_1', refundData, 'test', applicationContext)
    expect(mockHandleChargeDisputeClosed).toHaveBeenCalledWith(
      disputeData,
      'test',
      undefined,
      applicationContext,
    )
  })
})
