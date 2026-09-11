import {
  ensureMembershipFromStripeSubscription,
  syncMembershipFromStripeSubscription,
} from './membership-sync.mts'
import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import { reconcileRecordedIneligibleStripePurchaseReversal } from '@services/memberships/reconcile-recorded-ineligible-stripe-purchase-reversal'
import { isTerminalMembershipStatus } from './membership-change-helpers.mts'
import { getStripeObjectId, getStripeObjectString } from './webhook-utils.mts'

type InvoicePaymentPaidDependencies = {
  reconcileRecordedIneligibleStripePurchaseReversal: typeof reconcileRecordedIneligibleStripePurchaseReversal
}

export async function handleInvoicePaymentPaid(
  eventData: Record<string, unknown>,
  providerEnvironment: 'test' | 'production',
  dependencies?: Partial<InvoicePaymentPaidDependencies>,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const invoiceId = getStripeObjectId(eventData.invoice)
  if (!invoiceId) return
  const reconcile =
    dependencies?.reconcileRecordedIneligibleStripePurchaseReversal ??
    reconcileRecordedIneligibleStripePurchaseReversal
  await reconcile({
    originatingInvoiceId: invoiceId,
    providerApplicationId: applicationContext.applicationId,
    providerEnvironment,
  })
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
  onMembershipLapse?: (userId: string) => void,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const subscriptionId = getStripeObjectString(eventData.id)
  if (!subscriptionId) return
  const updatedMembership = await syncMembershipFromStripeSubscription(
    eventId,
    subscriptionId,
    applicationContext,
  )
  if (
    updatedMembership &&
    isTerminalMembershipStatus(updatedMembership.current.status) &&
    !isTerminalMembershipStatus(updatedMembership.previous.status)
  )
    onMembershipLapse?.(updatedMembership.current.user_id)
}
export async function handleSubscriptionDeleted(
  eventId: string,
  eventData: Record<string, unknown>,
  onMembershipLapse?: (userId: string) => void,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const subscriptionId = getStripeObjectString(eventData.id)
  if (!subscriptionId) return
  const updatedMembership = await syncMembershipFromStripeSubscription(
    eventId,
    subscriptionId,
    applicationContext,
  )
  if (
    updatedMembership &&
    isTerminalMembershipStatus(updatedMembership.current.status) &&
    !isTerminalMembershipStatus(updatedMembership.previous.status)
  )
    onMembershipLapse?.(updatedMembership.current.user_id)
}
