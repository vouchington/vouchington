import {
  DirectMembershipSourceRejectedError,
  getRetainedDirectMembershipSourceByStripeIdentity,
  updateMembershipFromWebhook,
} from '@services/memberships'
import type { Membership } from '@services/memberships/types'
import type { StripeMembershipSourceIdentity } from '@services/memberships/create-types'
import type { MembershipUpdateResult } from '@services/memberships/update-result'
import type { QueryExecutor } from '@data-stores/psql'
import {
  getMembershipChangeType,
  getMembershipLifecycleSnapshotFromFields,
  isTerminalMembershipStatus,
  recordMembershipChangeIfNeeded,
} from '../membership-change-helpers.mts'
import { normalizeProviderEffectiveAt } from './clocks.mts'
import type { AcceptedStripeMembershipObservation } from './accepted-observation.mts'
import { createDirectMembershipFromStripe } from './create-direct-membership.mts'
import {
  getLockedStripeMembershipSource,
  type StripeMembershipSourceRoute,
} from './locked-source.mts'
import type { StripeSubscriptionMembershipValues } from './subscription-values.mts'

export async function reconcileStripeMembershipSource(
  eventId: string,
  membership: Membership | null,
  sourceIdentity: StripeMembershipSourceIdentity,
  values: StripeSubscriptionMembershipValues,
  retainedSource?: Awaited<ReturnType<typeof getRetainedDirectMembershipSourceByStripeIdentity>>,
  query?: QueryExecutor,
  observedAt?: Date,
  membershipProviderEvidenceId?: string,
  acceptedObservation?: AcceptedStripeMembershipObservation,
): Promise<MembershipUpdateResult | null> {
  if (!membership)
    return restoreRetainedDirectSource(
      eventId,
      sourceIdentity,
      values,
      retainedSource,
      query,
      observedAt,
      membershipProviderEvidenceId,
      acceptedObservation,
    )
  if (isTerminalMembershipStatus(membership.status)) {
    if (isTerminalMembershipStatus(values.status)) return null
    await createDirectMembershipFromStripe(
      membership.user_id,
      eventId,
      sourceIdentity,
      values,
      query,
      observedAt,
      membershipProviderEvidenceId,
      acceptedObservation,
    )
    return null
  }
  const effectiveAt = normalizeProviderEffectiveAt(
    values.effectiveAt,
    values.expiresAt,
    values.terminalEffectiveAt,
    membership.started_at,
  )
  return syncExistingMembership(
    eventId,
    membership,
    values,
    effectiveAt,
    query,
    observedAt,
    membershipProviderEvidenceId,
    acceptedObservation,
  )
}

export async function reconcileLockedStripeMembershipSource(
  eventId: string,
  sourceIdentity: StripeMembershipSourceIdentity,
  values: StripeSubscriptionMembershipValues,
  query: QueryExecutor,
  observedAt: Date,
  route?: StripeMembershipSourceRoute,
  membershipProviderEvidenceId?: string,
  acceptedObservation?: AcceptedStripeMembershipObservation,
): Promise<MembershipUpdateResult | null> {
  const lockedRoute = route ?? (await getLockedStripeMembershipSource(sourceIdentity, query))
  return reconcileStripeMembershipSource(
    eventId,
    lockedRoute.membership,
    sourceIdentity,
    values,
    lockedRoute.retained,
    query,
    observedAt,
    membershipProviderEvidenceId,
    acceptedObservation,
  )
}

async function restoreRetainedDirectSource(
  eventId: string,
  sourceIdentity: StripeMembershipSourceIdentity,
  values: StripeSubscriptionMembershipValues,
  preloadedRetained?: Awaited<ReturnType<typeof getRetainedDirectMembershipSourceByStripeIdentity>>,
  query?: QueryExecutor,
  observedAt?: Date,
  membershipProviderEvidenceId?: string,
  acceptedObservation?: AcceptedStripeMembershipObservation,
): Promise<MembershipUpdateResult | null> {
  const retained =
    preloadedRetained === undefined
      ? await getRetainedDirectMembershipSourceByStripeIdentity(sourceIdentity)
      : preloadedRetained
  if (
    !retained ||
    values.status === 'paused' ||
    (preloadedRetained === undefined &&
      isTerminalMembershipStatus(retained.status) &&
      isTerminalMembershipStatus(values.status))
  )
    return null
  try {
    await createDirectMembershipFromStripe(
      retained.userId,
      eventId,
      sourceIdentity,
      values,
      query,
      observedAt,
      membershipProviderEvidenceId,
      acceptedObservation,
    )
  } catch (error) {
    if (error instanceof DirectMembershipSourceRejectedError) return null
    throw error
  }
  return null
}

async function syncExistingMembership(
  eventId: string,
  membership: Membership,
  values: StripeSubscriptionMembershipValues,
  effectiveAt: Date,
  query?: QueryExecutor,
  observedAt?: Date,
  membershipProviderEvidenceId?: string,
  acceptedObservation?: AcceptedStripeMembershipObservation,
): Promise<MembershipUpdateResult | null> {
  return updateMembershipFromWebhook(
    {
      membershipId: membership.id,
      status: values.status,
      plan: values.plan,
      skuId: values.skuId,
      expiresAt: values.expiresAt,
      effectiveAt,
      terminalEffectiveAt: values.terminalEffectiveAt ?? observedAt,
      transitionEffectiveAt: observedAt,
      cancelAtPeriodEnd: acceptedObservation
        ? !acceptedObservation.autoRenews
        : values.cancelAtPeriodEnd,
      query,
    },
    async (updated, query) => {
      const changeType = getMembershipChangeType({
        previousStatus: updated.previous.status,
        nextStatus: updated.current.status,
        previousPlan: updated.previous.plan,
        nextPlan: updated.current.plan,
        previousSkuId: updated.previous.sku_id,
        nextSkuId: updated.current.sku_id,
      })
      const expiryChanged =
        updated.previous.expires_at?.getTime() !== updated.current.expires_at?.getTime()
      const cancelAtPeriodEndChanged =
        updated.previous.cancel_at_period_end !== updated.current.cancel_at_period_end
      if (!changeType && !expiryChanged && !cancelAtPeriodEndChanged) return false
      await recordMembershipChangeIfNeeded({
        membershipId: membership.id,
        userId: updated.current.user_id,
        changeType: changeType ?? 'renewal',
        fromPlan: updated.previous.plan,
        toPlan: updated.current.plan,
        fromSkuId: updated.previous.sku_id,
        toSkuId: updated.current.sku_id,
        ...getMembershipLifecycleSnapshotFromFields(updated.current),
        membershipProviderEvidenceId,
        stripeEventId: eventId,
        query,
      })
      return false
    },
  )
}
