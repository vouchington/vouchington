import {
  onCheckoutAbortedForIdentity,
  onCheckoutCompletedForIdentity,
  onVerificationSessionCanceled,
  onVerificationSessionRequiresInput,
  onVerificationSessionVerified,
} from '@services/identity-verification'
import { ensureMembershipFromStripeSubscription } from '@services/stripe/membership-sync'
import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import { getStripeObjectString } from '@vouchington/stripe'
import {
  handleCheckoutSessionPaymentFailure,
  handleInvoicePaid,
  handleInvoicePaymentFailure,
} from '@services/stripe/event-subscription-handlers'

export async function handleCheckoutSessionCompleted(
  eventId: string,
  eventData: Record<string, unknown>,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  if (eventData.mode === 'subscription') {
    const paymentStatus = eventData.payment_status
    if (paymentStatus !== 'paid' && paymentStatus !== 'no_payment_required') return
    const subscriptionId = getStripeObjectString(eventData.subscription)
    const customerId = getStripeObjectString(eventData.customer)
    if (!subscriptionId || !customerId) return
    await ensureMembershipFromStripeSubscription(
      eventId,
      subscriptionId,
      customerId,
      applicationContext,
    )
    return
  }

  if (eventData.mode === 'payment') {
    const paymentStatus = eventData.payment_status
    if (paymentStatus !== 'paid' && paymentStatus !== 'no_payment_required') return
    const metadata = eventData.metadata as Record<string, string> | undefined
    if (metadata?.intent === 'identity-verification') {
      await onCheckoutCompletedForIdentity(eventId, eventData)
    }
  }
}

export async function handleCheckoutSessionPaymentFailed(
  eventId: string,
  eventData: Record<string, unknown>,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  await handleCheckoutSessionPaymentFailure(eventId, eventData, applicationContext)
  await onCheckoutAbortedForIdentity(eventId, eventData)
}

export {
  handleInvoicePaid,
  handleInvoicePaymentFailure,
  onCheckoutAbortedForIdentity,
  onVerificationSessionCanceled,
  onVerificationSessionRequiresInput,
  onVerificationSessionVerified,
}
