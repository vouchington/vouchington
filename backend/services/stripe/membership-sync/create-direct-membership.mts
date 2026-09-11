import type { QueryExecutor } from '@data-stores/psql'
import { createMembership } from '@services/memberships'
import type { StripeMembershipSourceIdentity } from '@services/memberships/create-types'
import type { AcceptedStripeMembershipObservation } from './accepted-observation.mts'
import type { StripeSubscriptionMembershipValues } from './subscription-values.mts'

export async function createDirectMembershipFromStripe(
  userId: string,
  eventId: string,
  sourceIdentity: StripeMembershipSourceIdentity,
  values: StripeSubscriptionMembershipValues,
  query?: QueryExecutor,
  observedAt?: Date,
  membershipProviderEvidenceId?: string,
  acceptedObservation?: AcceptedStripeMembershipObservation,
): Promise<void> {
  await createMembership(
    {
      userId,
      plan: values.plan,
      skuId: values.skuId,
      expiresAt: values.expiresAt,
      stripeSubscriptionId: sourceIdentity.providerLineageId,
      providerEnvironment: sourceIdentity.environment,
      providerApplicationId: sourceIdentity.applicationId,
      status: values.status,
      effectiveAt: values.currentPeriodStart ?? values.effectiveAt,
      sourceEffectiveAt: acceptedObservation?.effectiveAt,
      sourceAutoRenews: acceptedObservation?.autoRenews,
      observedAt,
      terminalEffectiveAt: values.terminalEffectiveAt ?? observedAt,
      cancelAtPeriodEnd: acceptedObservation
        ? !acceptedObservation.autoRenews
        : values.cancelAtPeriodEnd,
      stripeEventId: eventId,
    },
    query ? { query, membershipProviderEvidenceId } : { membershipProviderEvidenceId },
  )
}
