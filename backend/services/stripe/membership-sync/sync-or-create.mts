import type { QueryExecutor } from '@data-stores/psql'
import { getStripeSubscription } from '@modules/stripe/subscriptions'
import {
  getMembershipByStripeSubscriptionId,
  getMembershipByUserId,
  getRetainedDirectMembershipSourceByStripeIdentity,
} from '@services/memberships'
import { lockMembershipUser } from '@services/memberships/lock-user'
import { isHigherMembershipPlan } from '@services/memberships/plan-ranking'
import type { StripeMembershipSourceIdentity } from '@services/memberships/create-types'
import type { Membership } from '@services/memberships/types'
import { recordStripeMembershipProviderFactsInTransaction } from '../membership-provider-facts.mts'
import { createStripeMembershipSource } from './create-source.mts'
import {
  getLockedStripeMembershipSource,
  type StripeMembershipSourceRoute,
} from './locked-source.mts'
import { reconcileLockedStripeMembershipSource } from './reconcile-source.mts'
import { getStripeSubscriptionMembershipValues } from './subscription-values.mts'

export async function syncOrCreateStripeMembershipInTransaction(
  options: {
    eventId: string
    userId: string
    subscriptionId: string
    customerId: string
    sourceIdentity: StripeMembershipSourceIdentity
    values: Awaited<ReturnType<typeof getStripeSubscriptionMembershipValues>>
    subscription: Awaited<ReturnType<typeof getStripeSubscription>>
    observedAt: Date
  },
  query: QueryExecutor,
): Promise<void> {
  const {
    eventId,
    userId,
    subscriptionId,
    customerId,
    sourceIdentity,
    values,
    subscription,
    observedAt,
  } = options
  await lockMembershipUser(userId, query)
  const lockedMembership = await getMembershipByStripeSubscriptionId(sourceIdentity, { query })
  const lockedRetained = lockedMembership
    ? null
    : await getRetainedDirectMembershipSourceByStripeIdentity(sourceIdentity, { query })
  const lockedFactMembershipId = lockedMembership?.id ?? lockedRetained?.membershipId
  if (lockedFactMembershipId) {
    let route: StripeMembershipSourceRoute | undefined
    await recordStripeMembershipProviderFactsInTransaction(
      {
        stripeEventId: eventId,
        membershipId: lockedFactMembershipId,
        observedAt,
        onLockedSource: async query => {
          route = await getLockedStripeMembershipSource(sourceIdentity, query)
        },
        onAcceptedObservation: async (query, lifecycleAt, evidenceId, snapshot) => {
          if (!route) throw new Error('Stripe membership route was not locked')
          await reconcileLockedStripeMembershipSource(
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
      },
      subscription,
      query,
    )
    return
  }
  const existingUserMembership = await getMembershipByUserId(userId, { query })
  if (
    existingUserMembership &&
    !hasElapsedFiniteMembership(existingUserMembership) &&
    values.status !== 'active' &&
    values.status !== 'past_due'
  )
    return
  if (
    existingUserMembership &&
    !hasElapsedFiniteMembership(existingUserMembership) &&
    (existingUserMembership.stripe_subscription_id ||
      !isHigherMembershipPlan(values.plan, existingUserMembership.plan))
  )
    return
  await createStripeMembershipSource(
    eventId,
    userId,
    subscriptionId,
    customerId,
    sourceIdentity,
    values,
    subscription,
    query,
    observedAt,
  )
}

function hasElapsedFiniteMembership(membership: Membership | null): boolean {
  return (
    !!membership?.expires_at &&
    membership.expires_at <= new Date() &&
    (membership.stripe_subscription_id === null || membership.status === 'paused')
  )
}
