import { getStripeObjectString } from './webhook-utils.mts'
import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import { reconcileWonStripeDispute } from '@services/memberships/reconcile-won-stripe-dispute'

type ChargeDisputeClosedDependencies = {
  reconcileWonStripeDispute: typeof reconcileWonStripeDispute
}

export async function handleChargeDisputeClosed(
  eventData: Record<string, unknown>,
  providerEnvironment: 'test' | 'production',
  dependencies?: Partial<ChargeDisputeClosedDependencies>,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<void> {
  const disputeId = getStripeObjectString(eventData.id)
  if (!disputeId) return
  const reconcile = dependencies?.reconcileWonStripeDispute ?? reconcileWonStripeDispute
  await reconcile({
    disputeId,
    providerApplicationId: applicationContext.applicationId,
    providerEnvironment,
  })
}
