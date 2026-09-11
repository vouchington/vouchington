import type { QueryExecutor } from '@data-stores/psql'
import type { enqueueDeliverMembershipEntitlementEffectsBestEffort } from '@queues/memberships/enqueues'
import { DuplicateStripeMembershipEventError, recordMembershipChange } from '../changes.mts'
import type {
  CreateMembershipOptions,
  MembershipProviderEvidenceDependency,
} from '../create-types.mts'
import { pauseOpenGrantActivations } from '../grants/pause-open-activations.mts'
import { resumeGrantAfterDirectAccessSuspensionInTransaction } from '../grants/resume-after-direct-termination.mts'
import { lockMembershipUser } from '../lock-user.mts'
import { isHigherMembershipPlan } from '../plan-ranking.mts'
import { insertMembershipProjection, upsertMembershipSourceState } from '../projections/create.mts'
import {
  reconcileSourceProjection,
  type CreatedMembership,
  type PriorMembership,
} from '../reconcile-source-projection.mts'
import { getSourceAutoRenews } from '../source-auto-renews.mts'
import { isTerminalMembershipStatus } from '../update-result.mts'
import type { MembershipStatus } from '../types.mts'
import { getCreatedMembershipChange } from './change.mts'
import { prepareMembershipCreation } from './prepare-source.mts'
import * as providerEvidence from './provider-evidence.mts'
import { retireCurrentMembershipProjection } from './retire-current-projection.mts'

export async function createMembershipWithQuery(
  options: CreateMembershipOptions,
  dependencies: MembershipProviderEvidenceDependency,
  enqueueEntitlementEffects: typeof enqueueDeliverMembershipEntitlementEffectsBestEffort,
  timingContext: {
    status: MembershipStatus
    effectiveAt: Date
    directTermEffectiveAt: Date | undefined
  },
  query: QueryExecutor,
): Promise<CreatedMembership> {
  const { status, effectiveAt, directTermEffectiveAt } = timingContext
  await lockMembershipUser(options.userId, query, !options.stripeSubscriptionId)
  const { productId, priorRows, retainedSourceRows, source } = await prepareMembershipCreation(
    options,
    query,
    enqueueEntitlementEffects,
    directTermEffectiveAt,
  )
  const prior = priorRows[0] as
    | (PriorMembership & { source_kind: 'admin_grant' | 'direct' | 'family' })
    | undefined
  const retainedSource = retainedSourceRows[0] as PriorMembership | undefined
  const sourceExpiresAt =
    source.kind === 'admin_grant' ? source.expiresAt : (options.expiresAt ?? null)
  const observedAt = options.observedAt ?? new Date()
  const terminalEffectiveAt = isTerminalMembershipStatus(status)
    ? (options.terminalEffectiveAt ?? observedAt)
    : null
  const transitionEffectiveAt =
    terminalEffectiveAt ?? (status === 'past_due' || status === 'paused' ? observedAt : null)
  const sourceEffectiveAt = [sourceExpiresAt, transitionEffectiveAt].reduce<Date>(
    (earliest, candidate) => (candidate && candidate < earliest ? candidate : earliest),
    options.sourceEffectiveAt ?? effectiveAt,
  )
  const timing = {
    authoritativeEffectiveAt: options.effectiveAt ?? null,
    effectiveAt: sourceEffectiveAt,
    expiresAt: sourceExpiresAt,
    terminalEffectiveAt,
    transitionEffectiveAt,
  }
  const persistedSourceState = await upsertMembershipSourceState(
    source,
    productId,
    status,
    timing,
    options.sourceAutoRenews ??
      getSourceAutoRenews(source.kind, status, options.cancelAtPeriodEnd ?? false),
    query,
  )
  if (!persistedSourceState.advanced || !persistedSourceState.effectiveAt)
    throw new Error('Membership creation source state did not advance')
  const projectionAt = options.sourceEffectiveAt ? effectiveAt : persistedSourceState.effectiveAt
  const sourceProjection = prior?.membership_source_id === source.id ? prior : retainedSource
  const directStatusDoesNotEntitle =
    source.kind === 'direct' && (isTerminalMembershipStatus(status) || status === 'paused')
  const directTermPausesGrant =
    source.kind === 'direct' &&
    status !== 'paused' &&
    !source.queued &&
    (prior?.source_kind !== 'admin_grant' || isHigherMembershipPlan(options.plan, prior.plan))
  if (sourceProjection) {
    if (!directStatusDoesNotEntitle && sourceProjection.projection_ended_at !== null && prior) {
      if (directTermPausesGrant)
        await pauseOpenGrantActivations(options.userId, sourceEffectiveAt, query)
      await retireCurrentMembershipProjection(options.userId, query)
    }
    const resolvedProviderEvidence = await providerEvidence.resolveMembershipProviderEvidence(
      dependencies,
      sourceProjection,
      query,
    )
    return reconcileSourceProjection(
      {
        prior: sourceProjection,
        userId: options.userId,
        productId,
        plan: options.plan,
        status,
        effectiveAt: projectionAt,
        expiresAt: sourceExpiresAt,
        terminalEffectiveAt,
        transitionEffectiveAt,
        cancelAtPeriodEnd:
          resolvedProviderEvidence?.cancelAtPeriodEnd ?? options.cancelAtPeriodEnd ?? false,
        reactivateProjection: !directStatusDoesNotEntitle,
        membershipProviderEvidenceId:
          resolvedProviderEvidence?.membershipProviderEvidenceId ?? null,
        stripeEventId: options.stripeEventId ?? null,
      },
      query,
    )
  }
  if (source.queued) {
    if (!prior) throw new Error('Queued membership grant has no effective membership')
    return {
      id: prior.id,
      grantId: source.grantId,
      cancelled_at: null,
      expired_at: null,
      past_due_at: null,
      paused_at: null,
      cancel_at_period_end: false,
      projected: false,
    }
  }
  if (directTermPausesGrant)
    await pauseOpenGrantActivations(options.userId, sourceEffectiveAt, query)
  if (prior && !directStatusDoesNotEntitle)
    await retireCurrentMembershipProjection(options.userId, query)
  // ast-grep-ignore: no-three-sequential-awaits -- projection creates provider fact context; accepted evidence must update it before its audit
  const created = await insertMembershipProjection(
    options.userId,
    source.id,
    productId,
    status,
    { ...timing, effectiveAt: projectionAt },
    options.cancelAtPeriodEnd ?? false,
    !directStatusDoesNotEntitle,
    query,
  )
  const { membership: accepted, membershipProviderEvidenceId } =
    await providerEvidence.acceptMembershipProviderEvidence(dependencies, created, status, query)
  const recorded = await recordMembershipChange({
    membershipId: accepted.id,
    userId: options.userId,
    membershipSourceId: source.id,
    membershipGrantId: source.grantId,
    ...getCreatedMembershipChange(
      source.kind,
      status,
      prior,
      productId,
      options.plan,
      directStatusDoesNotEntitle,
    ),
    toSkuId: productId,
    cancelledAt: accepted.cancelled_at,
    expiredAt: accepted.expired_at,
    pastDueAt: accepted.past_due_at,
    pausedAt: accepted.paused_at,
    cancelAtPeriodEnd: accepted.cancel_at_period_end,
    changedById: options.grantedById ?? null,
    note: options.note ?? null,
    membershipProviderEvidenceId,
    stripeEventId: options.stripeEventId ?? null,
    ignoreDuplicateStripeEvent: true,
    query,
  })
  if (!recorded) throw new DuplicateStripeMembershipEventError()
  if (
    source.kind === 'direct' &&
    isTerminalMembershipStatus(status) &&
    prior?.source_kind === 'admin_grant'
  )
    await resumeGrantAfterDirectAccessSuspensionInTransaction(options.userId, accepted.id, query)
  return { ...accepted, grantId: source.grantId, projected: !directStatusDoesNotEntitle }
}
