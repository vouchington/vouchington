import {
  ensureMembershipFromStripeSubscription,
  syncMembershipFromStripeSubscription,
} from './membership-sync.mts'
import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import { reconcileRecordedIneligibleStripePurchaseReversal } from '@services/memberships/reconcile-recorded-ineligible-stripe-purchase-reversal'
import { detectIneligibleStripePurchaseFromInvoicePayment } from './membership-sync/detect-ineligible-purchase.mts'
import { getStripeObjectId, getStripeObjectString } from '@vouchington/stripe'

export async function handleInvoicePaymentPaid(
  eventData: Record<string, unknown>,
  providerEnvironment: 'test' | 'production',
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const invoiceId = getStripeObjectId(eventData.invoice)
  if (!invoiceId) return
  const lookup = {
    originatingInvoiceId: invoiceId,
    providerApplicationId: applicationContext.applicationId,
    providerEnvironment,
  }
  if (await reconcileRecordedIneligibleStripePurchaseReversal(lookup)) return
  await detectIneligibleStripePurchaseFromInvoicePayment(
    invoiceId,
    providerEnvironment,
    applicationContext,
  )
  await reconcileRecordedIneligibleStripePurchaseReversal(lookup)
}

export async function handleInvoicePaid(
  eventId: string,
  eventData: Record<string, unknown>,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const subscriptionId = getStripeObjectString(eventData.subscription)
  const customerId = getStripeObjectString(eventData.customer)
  if (!subscriptionId || !customerId) return
  await ensureMembershipFromStripeSubscription(
    eventId,
    subscriptionId,
    customerId,
    applicationContext,
  )
}
export async function handleInvoicePaymentFailure(
  eventId: string,
  eventData: Record<string, unknown>,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const subscriptionId = getStripeObjectString(eventData.subscription)
  if (!subscriptionId) return
  await syncMembershipFromStripeSubscription(eventId, subscriptionId, applicationContext)
}
export async function handleCheckoutSessionPaymentFailure(
  eventId: string,
  eventData: Record<string, unknown>,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const subscriptionId = getStripeObjectString(eventData.subscription)
  if (!subscriptionId) return
  await handleInvoicePaymentFailure(eventId, { subscription: subscriptionId }, applicationContext)
}

export async function handleSubscriptionUpdated(
  eventId: string,
  eventData: Record<string, unknown>,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const subscriptionId = getStripeObjectString(eventData.id)
  if (!subscriptionId) return
  await syncMembershipFromStripeSubscription(eventId, subscriptionId, applicationContext)
}
export async function handleSubscriptionDeleted(
  eventId: string,
  eventData: Record<string, unknown>,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const subscriptionId = getStripeObjectString(eventData.id)
  if (!subscriptionId) return
  await syncMembershipFromStripeSubscription(eventId, subscriptionId, applicationContext)
}
