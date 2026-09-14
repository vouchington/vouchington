import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT } from '@services/memberships/create-types'
import {
  handleCheckoutSessionCompleted,
  handleCheckoutSessionPaymentFailed,
} from './event-checkout-handlers.mts'

const mockOnCheckoutCompletedForIdentity =
  vi.fn<(eventId: string, eventData: Record<string, unknown>) => Promise<void>>()
const mockOnCheckoutAbortedForIdentity =
  vi.fn<(eventId: string, eventData: Record<string, unknown>) => Promise<void>>()
const mockEnsureMembershipFromStripeSubscription =
  vi.fn<
    (
      eventId: string,
      subscriptionId: string,
      customerId: string,
      applicationContext: { applicationId: string },
    ) => Promise<void>
  >()
const mockHandleCheckoutSessionPaymentFailure =
  vi.fn<
    (
      eventId: string,
      eventData: Record<string, unknown>,
      applicationContext: { applicationId: string },
    ) => Promise<void>
  >()

describe('handleCheckoutSessionCompleted (payment mode, identity-verification)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('invokes onCheckoutCompletedForIdentity when payment_status is paid', async () => {
    await handleCheckoutSessionCompleted(
      'evt_1',
      {
        mode: 'payment',
        payment_status: 'paid',
        metadata: { intent: 'identity-verification', user_id: 'user-1' },
        id: 'cs_test',
      },
      {
        onCheckoutCompletedForIdentity: mockOnCheckoutCompletedForIdentity as never,
      },
    )
    expect(mockOnCheckoutCompletedForIdentity).toHaveBeenCalledOnce()
  })

  it('invokes onCheckoutCompletedForIdentity when payment_status is no_payment_required (zero-fee checkout)', async () => {
    await handleCheckoutSessionCompleted(
      'evt_1',
      {
        mode: 'payment',
        payment_status: 'no_payment_required',
        metadata: { intent: 'identity-verification', user_id: 'user-1' },
        id: 'cs_test',
      },
      {
        onCheckoutCompletedForIdentity: mockOnCheckoutCompletedForIdentity as never,
      },
    )
    expect(mockOnCheckoutCompletedForIdentity).toHaveBeenCalledOnce()
  })

  it('skips when payment_status is unpaid', async () => {
    await handleCheckoutSessionCompleted(
      'evt_1',
      {
        mode: 'payment',
        payment_status: 'unpaid',
        metadata: { intent: 'identity-verification', user_id: 'user-1' },
        id: 'cs_test',
      },
      {
        onCheckoutCompletedForIdentity: mockOnCheckoutCompletedForIdentity as never,
      },
    )
    expect(mockOnCheckoutCompletedForIdentity).not.toHaveBeenCalled()
  })

  it('ensures membership from paid subscription checkout', async () => {
    await handleCheckoutSessionCompleted(
      'evt_1',
      {
        mode: 'subscription',
        payment_status: 'paid',
        subscription: 'sub_1',
        customer: 'cus_1',
      },
      {
        ensureMembershipFromStripeSubscription: mockEnsureMembershipFromStripeSubscription as never,
      },
    )
    expect(mockEnsureMembershipFromStripeSubscription).toHaveBeenCalledWith(
      'evt_1',
      'sub_1',
      'cus_1',
      DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
    )
  })

  it('passes a custom membership application context to subscription checkout fulfillment', async () => {
    const applicationContext = { applicationId: 'test-custom-stripe-context' }
    await handleCheckoutSessionCompleted(
      'evt_1',
      {
        mode: 'subscription',
        payment_status: 'paid',
        subscription: 'sub_1',
        customer: 'cus_1',
      },
      {
        ensureMembershipFromStripeSubscription: mockEnsureMembershipFromStripeSubscription as never,
      },
      applicationContext,
    )

    expect(mockEnsureMembershipFromStripeSubscription).toHaveBeenCalledWith(
      'evt_1',
      'sub_1',
      'cus_1',
      applicationContext,
    )
  })

  it('routes checkout payment failure to subscription and identity handlers', async () => {
    const eventData = { subscription: 'sub_1', metadata: { intent: 'identity-verification' } }

    await handleCheckoutSessionPaymentFailed('evt_1', eventData, {
      handleCheckoutSessionPaymentFailure: mockHandleCheckoutSessionPaymentFailure as never,
      onCheckoutAbortedForIdentity: mockOnCheckoutAbortedForIdentity as never,
    })

    expect(mockHandleCheckoutSessionPaymentFailure).toHaveBeenCalledWith(
      'evt_1',
      eventData,
      DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
    )
    expect(mockOnCheckoutAbortedForIdentity).toHaveBeenCalledWith('evt_1', eventData)
  })

  it('passes a custom membership application context to checkout payment failure handling', async () => {
    const eventData = { subscription: 'sub_1' }
    const applicationContext = { applicationId: 'test-custom-stripe-context' }
    await handleCheckoutSessionPaymentFailed(
      'evt_1',
      eventData,
      {
        handleCheckoutSessionPaymentFailure: mockHandleCheckoutSessionPaymentFailure as never,
      },
      applicationContext,
    )

    expect(mockHandleCheckoutSessionPaymentFailure).toHaveBeenCalledWith(
      'evt_1',
      eventData,
      applicationContext,
    )
  })
})
