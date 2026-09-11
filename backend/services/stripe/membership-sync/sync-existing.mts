import {
  getMembershipByStripeSubscriptionId,
  getRetainedDirectMembershipSourceByStripeIdentity,
} from '@services/memberships'
import type { MembershipUpdateResult } from '@services/memberships/update-result'
import { getStripeSubscription } from '@modules/stripe/subscriptions'
import {
  DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
  type StripeMembershipApplicationContext,
} from '@services/memberships/create-types'
import { recordStripeMembershipProviderFacts } from '../membership-provider-facts.mts'
import { getStripeMembershipSourceIdentity } from './source-identity.mts'
import { getStripeSubscriptionMembershipValues } from './subscription-values.mts'
import {
  getLockedStripeMembershipSource,
  type StripeMembershipSourceRoute,
} from './locked-source.mts'
import { reconcileLockedStripeMembershipSource } from './reconcile-source.mts'

export async function syncMembershipFromStripeSubscription(
  eventId: string,
  subscriptionId: string,
  applicationContext: StripeMembershipApplicationContext = DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT,
): Promise<MembershipUpdateResult | null> {
  const subscription = await getStripeSubscription(subscriptionId)
  const observedAt = new Date()
  const sourceIdentity = getStripeMembershipSourceIdentity(
    subscriptionId,
    subscription.livemode,
    applicationContext,
  )
  const membership = await getMembershipByStripeSubscriptionId(sourceIdentity)
  const retained = membership
    ? undefined
    : await getRetainedDirectMembershipSourceByStripeIdentity(sourceIdentity)
  const membershipId = membership?.id ?? retained?.membershipId
  if (!membershipId) return null
  const values = await getStripeSubscriptionMembershipValues(subscription, sourceIdentity)
  let updated: MembershipUpdateResult | null = null
  let route: StripeMembershipSourceRoute | undefined
  await recordStripeMembershipProviderFacts({
    stripeEventId: eventId,
    membershipId,
    subscription,
    observedAt,
    onLockedSource: async query => {
      route = await getLockedStripeMembershipSource(sourceIdentity, query)
    },
    onAcceptedObservation: async (query, lifecycleAt, evidenceId, snapshot) => {
      if (!route) throw new Error('Stripe membership route was not locked')
      updated = await reconcileLockedStripeMembershipSource(
        eventId,
        sourceIdentity,
        values,
        query,
        lifecycleAt,
        route,
        evidenceId,
        snapshot,
      )
    },
  })
  return updated
}
