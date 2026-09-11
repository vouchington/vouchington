import type { QueryExecutor } from '@data-stores/psql'
import { classifyMembershipChange } from '@vouchington/memberships'
import sql from 'sql-template-strings'
import { recordMembershipChange } from './changes.mts'
import { isTerminalMembershipStatus } from './update-result.mts'
import type { MembershipPlanSlug, MembershipStatus } from './types.mts'

export type CreatedMembership = {
  id: string
  grantId: string | null
  cancelled_at: Date | null
  expired_at: Date | null
  past_due_at: Date | null
  paused_at: Date | null
  cancel_at_period_end: boolean
  projected: boolean
}

export type PriorMembership = Omit<CreatedMembership, 'grantId' | 'projected'> & {
  membership_source_id: string
  membership_product_id: string
  plan: MembershipPlanSlug
  expires_at: Date | null
  projection_ended_at: Date | null
}

export async function reconcileSourceProjection(
  options: {
    prior: PriorMembership
    userId: string
    productId: string
    plan: MembershipPlanSlug
    status: MembershipStatus
    effectiveAt: Date | null
    expiresAt: Date | null
    terminalEffectiveAt: Date | null
    transitionEffectiveAt: Date | null
    cancelAtPeriodEnd: boolean
    reactivateProjection: boolean
    membershipProviderEvidenceId?: string | null
    stripeEventId: string | null
  },
  query: QueryExecutor,
): Promise<CreatedMembership> {
  const { prior, status } = options
  const cancelAtPeriodEnd = isTerminalMembershipStatus(status) ? false : options.cancelAtPeriodEnd
  const { rows } = await query(sql`/* reconcileSourceProjection */
    UPDATE memberships SET
      membership_product_id = ${options.productId},
      effective_at = COALESCE(${options.effectiveAt}::timestamptz, effective_at),
      expires_at = ${options.expiresAt},
      cancelled_at = CASE WHEN ${status} = 'cancelled' THEN COALESCE(cancelled_at, ${options.terminalEffectiveAt}::timestamptz, CURRENT_TIMESTAMP) ELSE NULL END,
      expired_at = CASE WHEN ${status} = 'expired' THEN COALESCE(expired_at, ${options.terminalEffectiveAt}::timestamptz, CURRENT_TIMESTAMP) ELSE NULL END,
      past_due_at = CASE WHEN ${status} = 'past_due' THEN COALESCE(past_due_at, ${options.transitionEffectiveAt}::timestamptz, CURRENT_TIMESTAMP) ELSE NULL END,
      paused_at = CASE WHEN ${status} = 'paused' THEN COALESCE(paused_at, ${options.transitionEffectiveAt}::timestamptz, CURRENT_TIMESTAMP) ELSE NULL END,
      cancel_at_period_end = ${cancelAtPeriodEnd},
      projection_ended_at = CASE
        WHEN ${options.reactivateProjection} THEN NULL
        ELSE projection_ended_at
      END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ${prior.id} AND membership_source_id = ${prior.membership_source_id}
    RETURNING cancelled_at, expired_at, past_due_at, paused_at, cancel_at_period_end`)
  const current = rows[0] as Omit<CreatedMembership, 'id' | 'grantId' | 'projected'>
  const previousStatus = getStatus(prior)
  const changeType = classifyMembershipProjectionChange(
    prior,
    options.productId,
    options.plan,
    status,
  )
  const expiryChanged = prior.expires_at?.getTime() !== options.expiresAt?.getTime()
  const recordedChangeType = changeType ?? (expiryChanged ? 'renewal' : null)
  if (recordedChangeType) {
    const change = {
      membershipId: prior.id,
      userId: options.userId,
      changeType: recordedChangeType,
      fromSkuId: prior.membership_product_id,
      toSkuId: options.productId,
      cancelledAt: current.cancelled_at,
      expiredAt: current.expired_at,
      pastDueAt: current.past_due_at,
      pausedAt: current.paused_at,
      cancelAtPeriodEnd: current.cancel_at_period_end,
      membershipProviderEvidenceId: options.membershipProviderEvidenceId ?? null,
      stripeEventId: options.stripeEventId,
      query,
    }
    const recorded = await recordMembershipChange({ ...change, ignoreDuplicateStripeEvent: true })
    if (!recorded) await recordMembershipChange({ ...change, stripeEventId: null })
  }
  return {
    id: prior.id,
    grantId: null,
    ...current,
    projected:
      (options.reactivateProjection && prior.projection_ended_at !== null) ||
      prior.membership_product_id !== options.productId ||
      previousStatus !== status ||
      prior.cancel_at_period_end !== current.cancel_at_period_end ||
      expiryChanged,
  }
}

export function classifyMembershipProjectionChange(
  prior: PriorMembership,
  nextSku: string,
  nextPlan: MembershipPlanSlug,
  nextStatus: MembershipStatus,
) {
  return classifyMembershipChange({
    previousStatus: getStatus(prior),
    nextStatus,
    previousPlan: prior.plan,
    nextPlan,
    previousSku: prior.membership_product_id,
    nextSku,
    comparePlans: (left, right) => getPlanRank(left) - getPlanRank(right),
  })
}

function getStatus(membership: PriorMembership): MembershipStatus {
  if (membership.cancelled_at) return 'cancelled'
  if (membership.expired_at) return 'expired'
  if (membership.paused_at) return 'paused'
  if (membership.past_due_at) return 'past_due'
  return 'active'
}

function getPlanRank(plan: MembershipPlanSlug): number {
  return plan === 'plus' ? 1 : 2
}
