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
import { getStripeObjectString } from '@services/stripe/event-utils'
import {
  handleCheckoutSessionPaymentFailure,
  handleInvoicePaid,
  handleInvoicePaymentFailure,
} from '@services/stripe/event-subscription-handlers'

type CheckoutSessionCompletedDependencies = {
  ensureMembershipFromStripeSubscription: typeof ensureMembershipFromStripeSubscription
  onCheckoutCompletedForIdentity: typeof onCheckoutCompletedForIdentity
}

type CheckoutSessionPaymentFailedDependencies = {
  handleCheckoutSessionPaymentFailure: typeof handleCheckoutSessionPaymentFailure
  onCheckoutAbortedForIdentity: typeof onCheckoutAbortedForIdentity
}

export async function handleCheckoutSessionCompleted(
  eventId: string,
  eventData: Record<string, unknown>,
  dependencies?: Partial<CheckoutSessionCompletedDependencies>,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const ensureMembership =
    dependencies?.ensureMembershipFromStripeSubscription ?? ensureMembershipFromStripeSubscription
  const onCheckoutCompleted =
    dependencies?.onCheckoutCompletedForIdentity ?? onCheckoutCompletedForIdentity
  if (eventData.mode === 'subscription') {
    const paymentStatus = eventData.payment_status
    if (paymentStatus !== 'paid' && paymentStatus !== 'no_payment_required') return
    const subscriptionId = getStripeObjectString(eventData.subscription)
    const customerId = getStripeObjectString(eventData.customer)
    if (!subscriptionId || !customerId) return
    await ensureMembership(eventId, subscriptionId, customerId, applicationContext)
    return
  }

  if (eventData.mode === 'payment') {
    const paymentStatus = eventData.payment_status
    if (paymentStatus !== 'paid' && paymentStatus !== 'no_payment_required') return
    const metadata = eventData.metadata as Record<string, string> | undefined
    if (metadata?.intent === 'identity-verification') {
      await onCheckoutCompleted(eventId, eventData)
    }
  }
}

export async function handleCheckoutSessionPaymentFailed(
  eventId: string,
  eventData: Record<string, unknown>,
  dependencies?: Partial<CheckoutSessionPaymentFailedDependencies>,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const handlePaymentFailure =
    dependencies?.handleCheckoutSessionPaymentFailure ?? handleCheckoutSessionPaymentFailure
  const onCheckoutAborted =
    dependencies?.onCheckoutAbortedForIdentity ?? onCheckoutAbortedForIdentity
  await handlePaymentFailure(eventId, eventData, applicationContext)
  await onCheckoutAborted(eventId, eventData)
}

export {
  handleInvoicePaid,
  handleInvoicePaymentFailure,
  onCheckoutAbortedForIdentity,
  onVerificationSessionCanceled,
  onVerificationSessionRequiresInput,
  onVerificationSessionVerified,
}
