import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getStripeSubscription } from '@modules/stripe/subscriptions'
import {
  getMembershipByStripeSubscriptionId,
  getMembershipByUserId,
  getRetainedDirectMembershipSourceByStripeIdentity,
} from '@services/memberships'
import { lockMembershipUser } from '@services/memberships/lock-user'
import { isHigherMembershipPlan } from '@services/memberships/plan-ranking'
import { getDirectMembershipSourceAdmission } from '@services/memberships/direct-source-authority'
import { recordIneligibleStripePurchaseCollisionWork } from '@services/memberships/ineligible-stripe-purchase-reversal/collision-work'
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
  if (existingUserMembership && !hasElapsedFiniteMembership(existingUserMembership)) {
    const admission = await getDirectMembershipSourceAdmission(
      userId,
      values.plan,
      sourceIdentity,
      query,
    )
    if (
      !admission.accepted &&
      (admission.currentSourceKind === 'family' ||
        (admission.currentSourceKind === 'direct' && admission.currentProvider !== 'stripe'))
    ) {
      const { rows } = await query(
        buildGetStripeCollisionWinnerEffectiveAtQuery(existingUserMembership.id, userId),
      )
      const winner = rows[0] as { effectiveAt: Date } | undefined
      if (!winner) throw new Error('Winning membership projection disappeared during collision')
      await recordIneligibleStripePurchaseCollisionWork(
        {
          userId,
          sourceIdentity: { ...sourceIdentity, providerAccountId: customerId },
          winningSourceKind: admission.currentSourceKind,
          winningPlan: existingUserMembership.plan,
          collisionAt: winner.effectiveAt,
        },
        query,
      )
      return
    }
    if (
      existingUserMembership.stripe_subscription_id ||
      !isHigherMembershipPlan(values.plan, existingUserMembership.plan)
    )
      return
  }
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

export function buildGetStripeCollisionWinnerEffectiveAtQuery(
  membershipId: string,
  userId: string,
) {
  return sql`/* getStripeCollisionWinnerEffectiveAt */
        SELECT effective_at AS "effectiveAt" FROM memberships
        WHERE id = ${membershipId} AND user_id = ${userId}
        FOR SHARE`
}

function hasElapsedFiniteMembership(membership: Membership | null): boolean {
  return (
    !!membership?.expires_at &&
    membership.expires_at <= new Date() &&
    (membership.stripe_subscription_id === null || membership.status === 'paused')
  )
}
