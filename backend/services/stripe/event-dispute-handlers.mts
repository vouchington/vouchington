import { getStripeObjectString } from '@vouchington/stripe'
import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import { reconcileWonStripeDispute } from '@services/memberships/reconcile-won-stripe-dispute'

export async function handleChargeDisputeClosed(
  eventData: Record<string, unknown>,
  providerEnvironment: 'test' | 'production',
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const disputeId = getStripeObjectString(eventData.id)
  if (!disputeId) return
  await reconcileWonStripeDispute({
    disputeId,
    providerApplicationId: applicationContext.applicationId,
    providerEnvironment,
  })
}
