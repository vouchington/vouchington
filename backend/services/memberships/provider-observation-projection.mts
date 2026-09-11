import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { enqueueDeliverMembershipEntitlementEffectsBestEffort } from '@queues/memberships/enqueues'
import { recordMembershipChange } from './changes.mts'
import type { MembershipProviderSourceIdentity } from './create-types.mts'
import { getFamilyMembershipSourceProjectionAdmission } from './create/prepare-source.mts'
import { createProviderMembershipSource } from './create-source.mts'
import { assertDirectMembershipSourceAdmission } from './direct-source-authority.mts'
import { restoreFallbackAfterCurrentAccessEndsInTransaction } from './fallback/restore-after-current-access-ends.mts'
import { membershipProjectionWithEntitlementEffects } from './entitlement-effects-after-commit.mts'
import { lockMembershipUser } from './lock-user.mts'
import { insertMembershipProjection, upsertMembershipSourceState } from './projections/create.mts'
import { reconcileSourceProjection, type PriorMembership } from './reconcile-source-projection.mts'
import { retireCurrentMembershipProjection } from './create/retire-current-projection.mts'
import {
  getCurrentProviderProjection,
  getLatestProviderSourceProjection,
  getVerifiedProviderObservation,
  type VerifiedProviderObservation,
} from './provider-observation.mts'
import { isTerminalMembershipStatus } from './update-result.mts'

export type ProjectVerifiedProviderMembershipObservationOptions = {
  userId: string
  membershipProviderObservationId: string
  sourceIdentity?: MembershipProviderSourceIdentity
}

type ProjectDependencies = {
  enqueueEntitlementEffects?: typeof enqueueDeliverMembershipEntitlementEffectsBestEffort
  query?: QueryExecutor
}
export async function projectVerifiedProviderMembershipObservation(
  options: ProjectVerifiedProviderMembershipObservationOptions,
  dependencies: ProjectDependencies = {},
): Promise<{ membershipId: string | null; projected: boolean }> {
  const enqueue =
    dependencies.enqueueEntitlementEffects ?? enqueueDeliverMembershipEntitlementEffectsBestEffort
  if (dependencies.query) return projectWithQuery(options, dependencies.query, enqueue)
  await using query = await beginTransaction()
  const result = await projectWithQuery(options, query, enqueue)
  await query.commit()
  if (result.projected) void enqueue()
  return result
}

async function projectWithQuery(
  options: ProjectVerifiedProviderMembershipObservationOptions,
  query: QueryExecutor,
  enqueue: typeof enqueueDeliverMembershipEntitlementEffectsBestEffort,
): Promise<{ membershipId: string | null; projected: boolean }> {
  const observation = await getVerifiedProviderObservation(options, query)
  const source = await lockUserAndCreateProviderSource(options.userId, observation, query)
  if (observation.sourceKind === 'direct' && !isTerminalMembershipStatus(observation.status))
    await assertDirectMembershipSourceAdmission(
      options.userId,
      observation.plan,
      observation.sourceIdentity,
      query,
    )
  const sourceState = await upsertMembershipSourceState(
    { ...source, membershipProviderObservationId: options.membershipProviderObservationId },
    observation.membershipProductId,
    observation.status,
    observation.timing,
    observation.autoRenews,
    query,
  )
  if (!sourceState.advanced) return { membershipId: null, projected: false }
  return projectAdvancedProviderObservation(options, observation, source.id, query, enqueue)
}

async function lockUserAndCreateProviderSource(
  userId: string,
  observation: VerifiedProviderObservation,
  query: QueryExecutor,
) {
  await lockMembershipUser(userId, query)
  return createProviderMembershipSource(
    {
      userId,
      sourceKind: observation.sourceKind,
      sourceIdentity: observation.sourceIdentity,
    },
    query,
  )
}

async function projectAdvancedProviderObservation(
  options: ProjectVerifiedProviderMembershipObservationOptions,
  observation: VerifiedProviderObservation,
  sourceId: string,
  query: QueryExecutor,
  enqueue: typeof enqueueDeliverMembershipEntitlementEffectsBestEffort,
) {
  const sourceProjection = await getLatestProviderSourceProjection(sourceId, query)
  if (sourceProjection) {
    if (observation.sourceKind === 'family' && sourceProjection.projection_ended_at !== null) {
      const admission = await getFamilyMembershipSourceProjectionAdmission(
        {
          userId: options.userId,
          membershipSourceId: sourceId,
          plan: observation.plan,
          effectiveAt: observation.effectiveAt,
        },
        query,
      )
      if (!admission.accepted) return { membershipId: null, projected: false }
    }
    return reconcileProviderSourceProjection(
      options,
      sourceProjection,
      observation,
      observation.timing,
      query,
      enqueue,
    )
  }
  if (observation.sourceKind === 'family') {
    const admission = await getFamilyMembershipSourceProjectionAdmission(
      {
        userId: options.userId,
        membershipSourceId: sourceId,
        plan: observation.plan,
        effectiveAt: observation.effectiveAt,
      },
      query,
    )
    if (!admission.accepted) return { membershipId: null, projected: false }
  }
  const prior = await getCurrentProviderProjection(options.userId, query)
  const project = !isTerminalMembershipStatus(observation.status) && observation.status !== 'paused'
  if (!project) return { membershipId: null, projected: false }
  if (prior) await retireCurrentMembershipProjection(options.userId, query)
  const membership = await insertMembershipProjection(
    options.userId,
    sourceId,
    observation.membershipProductId,
    observation.status,
    observation.timing,
    !observation.autoRenews,
    project,
    query,
  )
  await recordMembershipChange({
    membershipId: membership.id,
    userId: options.userId,
    membershipSourceId: sourceId,
    changeType: isTerminalMembershipStatus(observation.status) ? 'expiration' : 'renewal',
    fromSkuId: prior?.membership_product_id ?? null,
    toSkuId: observation.membershipProductId,
    cancelledAt: membership.cancelled_at,
    expiredAt: membership.expired_at,
    pastDueAt: membership.past_due_at,
    pausedAt: membership.paused_at,
    cancelAtPeriodEnd: membership.cancel_at_period_end,
    membershipProviderEvidenceId: observation.membershipProviderEvidenceId,
    query,
  })
  if (isTerminalMembershipStatus(observation.status))
    await restoreFallbackAfterCurrentAccessEndsInTransaction(options.userId, membership.id, query)
  return membershipProjectionWithEntitlementEffects(query, enqueue, membership.id, project)
}

async function reconcileProviderSourceProjection(
  options: ProjectVerifiedProviderMembershipObservationOptions,
  prior: PriorMembership,
  observation: VerifiedProviderObservation,
  timing: VerifiedProviderObservation['timing'],
  query: QueryExecutor,
  enqueue: typeof enqueueDeliverMembershipEntitlementEffectsBestEffort,
): Promise<{ membershipId: string; projected: boolean }> {
  const entitles =
    !isTerminalMembershipStatus(observation.status) && observation.status !== 'paused'
  const membership = await reconcileSourceProjection(
    {
      prior,
      userId: options.userId,
      productId: observation.membershipProductId,
      plan: observation.plan,
      status: observation.status,
      effectiveAt: observation.effectiveAt,
      expiresAt: observation.expiresAt,
      terminalEffectiveAt: timing.terminalEffectiveAt,
      transitionEffectiveAt: timing.transitionEffectiveAt,
      cancelAtPeriodEnd: !observation.autoRenews,
      reactivateProjection: entitles,
      membershipProviderEvidenceId: observation.membershipProviderEvidenceId,
      stripeEventId: null,
    },
    query,
  )
  if (isTerminalMembershipStatus(observation.status))
    await restoreFallbackAfterCurrentAccessEndsInTransaction(options.userId, membership.id, query)
  return membershipProjectionWithEntitlementEffects(
    query,
    enqueue,
    membership.id,
    membership.projected,
  )
}
