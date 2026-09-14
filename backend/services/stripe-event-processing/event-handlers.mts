import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import type { ingestStripeEvent } from '@services/stripe/events'
import {
  handleCheckoutSessionCompleted,
  handleCheckoutSessionPaymentFailed,
  handleInvoicePaid,
  handleInvoicePaymentFailure,
  onCheckoutAbortedForIdentity,
  onVerificationSessionCanceled,
  onVerificationSessionRequiresInput,
  onVerificationSessionVerified,
} from './event-checkout-handlers.mts'
import { handleChargeRefunded } from '@services/stripe/event-charge-handlers'
import { handleChargeDisputeClosed } from '@services/stripe/event-dispute-handlers'
import {
  handleInvoicePaymentPaid,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
} from '@services/stripe/event-subscription-handlers'

type StripeEventDependencies = {
  handleCheckoutSessionCompleted: typeof handleCheckoutSessionCompleted
  handleCheckoutSessionPaymentFailed: typeof handleCheckoutSessionPaymentFailed
  handleInvoicePaid: typeof handleInvoicePaid
  handleInvoicePaymentFailure: typeof handleInvoicePaymentFailure
  handleInvoicePaymentPaid: typeof handleInvoicePaymentPaid
  handleSubscriptionDeleted: typeof handleSubscriptionDeleted
  handleSubscriptionUpdated: typeof handleSubscriptionUpdated
  handleChargeRefunded: typeof handleChargeRefunded
  handleChargeDisputeClosed: typeof handleChargeDisputeClosed
  onCheckoutAbortedForIdentity: typeof onCheckoutAbortedForIdentity
  onVerificationSessionCanceled: typeof onVerificationSessionCanceled
  onVerificationSessionRequiresInput: typeof onVerificationSessionRequiresInput
  onVerificationSessionVerified: typeof onVerificationSessionVerified
}

type StripeEvent = Parameters<typeof ingestStripeEvent>[0]

const defaultDependencies: StripeEventDependencies = {
  handleCheckoutSessionCompleted,
  handleCheckoutSessionPaymentFailed,
  handleInvoicePaid,
  handleInvoicePaymentFailure,
  handleInvoicePaymentPaid,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
  handleChargeRefunded,
  handleChargeDisputeClosed,
  onCheckoutAbortedForIdentity,
  onVerificationSessionCanceled,
  onVerificationSessionRequiresInput,
  onVerificationSessionVerified,
}

export async function handleStripeEvent(
  event: StripeEvent,
  dependencies?: Partial<StripeEventDependencies>,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<'processed' | 'ignored'> {
  const eventData = event.data.object as unknown as Record<string, unknown>
  const {
    handleCheckoutSessionCompleted: handleCheckoutCompleted,
    handleCheckoutSessionPaymentFailed: handleCheckoutPaymentFailed,
    handleInvoicePaid: handleInvoicePaidEvent,
    handleInvoicePaymentFailure: handleInvoicePaymentFailedEvent,
    handleInvoicePaymentPaid: handleInvoicePaymentPaidEvent,
    handleSubscriptionDeleted: handleSubscriptionDeletedEvent,
    handleSubscriptionUpdated: handleSubscriptionUpdatedEvent,
    handleChargeRefunded: handleChargeRefundedEvent,
    handleChargeDisputeClosed: handleChargeDisputeClosedEvent,
    onCheckoutAbortedForIdentity: onCheckoutAborted,
    onVerificationSessionCanceled: onVerificationCanceled,
    onVerificationSessionRequiresInput: onVerificationRequiresInput,
    onVerificationSessionVerified: onVerificationVerified,
  } = mergeDefinedDependencies(defaultDependencies, dependencies)
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      await handleCheckoutCompleted(event.id, eventData, undefined, applicationContext)
      return 'processed'
    case 'checkout.session.async_payment_failed':
      await handleCheckoutPaymentFailed(event.id, eventData, undefined, applicationContext)
      return 'processed'
    case 'checkout.session.expired':
      await onCheckoutAborted(event.id, eventData)
      return 'processed'
    case 'invoice.paid':
      await handleInvoicePaidEvent(event.id, eventData, applicationContext)
      return 'processed'
    case 'invoice.payment_failed':
    case 'invoice.payment_action_required':
      await handleInvoicePaymentFailedEvent(event.id, eventData, applicationContext)
      return 'processed'
    case 'invoice_payment.paid':
      await handleInvoicePaymentPaidEvent(
        eventData,
        event.livemode ? 'production' : 'test',
        undefined,
        applicationContext,
      )
      return 'processed'
    case 'customer.subscription.updated':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      await handleSubscriptionUpdatedEvent(event.id, eventData, undefined, applicationContext)
      return 'processed'
    case 'customer.subscription.deleted':
      await handleSubscriptionDeletedEvent(event.id, eventData, undefined, applicationContext)
      return 'processed'
    case 'identity.verification_session.verified':
      await onVerificationVerified(event.id, eventData)
      return 'processed'
    case 'identity.verification_session.requires_input':
      await onVerificationRequiresInput(event.id, eventData)
      return 'processed'
    case 'identity.verification_session.canceled':
    case 'identity.verification_session.redacted':
      await onVerificationCanceled(event.id, eventData)
      return 'processed'
    case 'charge.refunded':
      await handleChargeRefundedEvent(
        event.id,
        eventData,
        event.livemode ? 'production' : 'test',
        applicationContext,
      )
      return 'processed'
    case 'charge.dispute.closed':
    case 'charge.dispute.funds_reinstated':
      await handleChargeDisputeClosedEvent(
        eventData,
        event.livemode ? 'production' : 'test',
        undefined,
        applicationContext,
      )
      return 'processed'
    case 'customer.subscription.created':
    case 'customer.subscription.trial_will_end':
    case 'invoice.created':
    case 'invoice.finalized':
    case 'invoice.finalization_failed':
    case 'invoice.upcoming':
      return 'ignored'
    default:
      return 'ignored'
  }
}

function mergeDefinedDependencies<T extends Record<string, unknown>>(
  defaults: T,
  overrides: Partial<T> | undefined,
): T {
  if (!overrides) return { ...defaults }

  const merged = { ...defaults }
  for (const key of Object.keys(overrides) as Array<keyof T>) {
    const value = overrides[key]
    if (value === undefined) continue
    merged[key] = value as T[keyof T]
  }
  return merged
}
