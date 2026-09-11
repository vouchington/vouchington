import type { QueryExecutor } from '@data-stores/psql'
import { createMembership, DuplicateStripeMembershipEventError } from '@services/memberships'
import type { StripeMembershipSourceIdentity } from '@services/memberships/create-types'
import type Stripe from 'stripe'
import { recordStripeMembershipProviderFactsInTransaction } from '../membership-provider-facts.mts'
import type { StripeSubscriptionMembershipValues } from './subscription-values.mts'
import { getStripeEventReceivedAt } from './transaction.mts'

export async function createStripeMembershipSource(
  eventId: string,
  userId: string,
  subscriptionId: string,
  customerId: string,
  sourceIdentity: StripeMembershipSourceIdentity,
  values: StripeSubscriptionMembershipValues,
  subscription: Stripe.Subscription,
  query: QueryExecutor,
  observedAt: Date,
) {
  const receivedAt = await getStripeEventReceivedAt(eventId, query)
  const membershipObservedAt =
    subscription.status === 'canceled' || subscription.status === 'incomplete_expired'
      ? receivedAt
      : observedAt
  return createMembership(
    {
      userId,
      plan: values.plan,
      skuId: values.skuId,
      expiresAt: values.expiresAt,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId,
      providerEnvironment: sourceIdentity.environment,
      providerApplicationId: sourceIdentity.applicationId,
      status: values.status,
      effectiveAt: values.effectiveAt,
      observedAt: membershipObservedAt,
      terminalEffectiveAt: values.terminalEffectiveAt,
      cancelAtPeriodEnd: values.cancelAtPeriodEnd,
      stripeEventId: eventId,
    },
    {
      query,
      getMembershipProviderEvidence: async membership => {
        let cancelAtPeriodEnd: boolean | undefined
        const facts = await recordStripeMembershipProviderFactsInTransaction(
          {
            stripeEventId: eventId,
            membershipId: membership.id,
            observedAt,
            onAcceptedObservation: async (_query, _lifecycleAt, _evidenceId, snapshot) => {
              cancelAtPeriodEnd = !snapshot.autoRenews
            },
          },
          subscription,
          query,
        )
        if (!facts.observationId) throw new DuplicateStripeMembershipEventError()
        return {
          membershipProviderEvidenceId: facts.evidenceId,
          cancelAtPeriodEnd,
        }
      },
    },
  )
}
