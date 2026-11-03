import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import type { ingestStripeEvent } from '@services/stripe/events'
import { expireStripeMembershipPurchaseIntentForCheckout } from '@services/memberships/purchase-intents'
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

type StripeEvent = Parameters<typeof ingestStripeEvent>[0]

export async function handleStripeEvent(
  event: StripeEvent,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<'processed' | 'ignored'> {
  const eventData = event.data.object as unknown as Record<string, unknown>
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      await handleCheckoutSessionCompleted(event.id, eventData, applicationContext)
      return 'processed'
    case 'checkout.session.async_payment_failed':
      await handleCheckoutSessionPaymentFailed(event.id, eventData, applicationContext)
      return 'processed'
    case 'checkout.session.expired':
      if (eventData.mode === 'subscription' && typeof eventData.id === 'string') {
        await expireStripeMembershipPurchaseIntentForCheckout({
          checkoutId: eventData.id,
          environment: event.livemode ? 'production' : 'test',
          applicationId: applicationContext.applicationId,
        })
      }
      await onCheckoutAbortedForIdentity(event.id, eventData)
      return 'processed'
    case 'invoice.paid':
      await handleInvoicePaid(event.id, eventData, applicationContext)
      return 'processed'
    case 'invoice.payment_failed':
    case 'invoice.payment_action_required':
      await handleInvoicePaymentFailure(event.id, eventData, applicationContext)
      return 'processed'
    case 'invoice_payment.paid':
      await handleInvoicePaymentPaid(
        eventData,
        event.livemode ? 'production' : 'test',
        applicationContext,
      )
      return 'processed'
    case 'customer.subscription.updated':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      await handleSubscriptionUpdated(event.id, eventData, applicationContext)
      return 'processed'
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.id, eventData, applicationContext)
      return 'processed'
    case 'identity.verification_session.verified':
      await onVerificationSessionVerified(event.id, eventData)
      return 'processed'
    case 'identity.verification_session.requires_input':
      await onVerificationSessionRequiresInput(event.id, eventData)
      return 'processed'
    case 'identity.verification_session.canceled':
    case 'identity.verification_session.redacted':
      await onVerificationSessionCanceled(event.id, eventData)
      return 'processed'
    case 'charge.refunded':
      await handleChargeRefunded(
        event.id,
        eventData,
        event.livemode ? 'production' : 'test',
        applicationContext,
      )
      return 'processed'
    case 'charge.dispute.closed':
    case 'charge.dispute.funds_reinstated':
      await handleChargeDisputeClosed(
        eventData,
        event.livemode ? 'production' : 'test',
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
