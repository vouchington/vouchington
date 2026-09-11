import {
  DuplicateStripeMembershipEventError,
  isTerminalMembershipStatus,
  recordMembershipChange,
  type MembershipLifecycleFields,
} from '@services/memberships'
import type { QueryExecutor } from '@data-stores/psql'
import { classifyMembershipChange } from '@vouchington/memberships'
import type {
  Membership,
  MembershipChangeType,
  MembershipStatus,
} from '@services/memberships/types'

export function getMembershipChangeType(options: {
  previousStatus: MembershipStatus
  nextStatus: MembershipStatus
  previousPlan: Membership['plan']
  nextPlan: Membership['plan']
  previousSkuId: string
  nextSkuId: string
}): MembershipChangeType | null {
  const { previousStatus, nextStatus, previousPlan, nextPlan, previousSkuId, nextSkuId } = options
  return classifyMembershipChange({
    previousStatus,
    nextStatus,
    previousPlan,
    nextPlan,
    previousSku: previousSkuId,
    nextSku: nextSkuId,
    comparePlans: (left, right) => getMembershipPlanRank(left) - getMembershipPlanRank(right),
  })
}

export async function recordMembershipChangeIfNeeded(options: {
  membershipId: string
  userId: string
  changeType: MembershipChangeType
  fromPlan?: Membership['plan'] | null
  toPlan?: Membership['plan'] | null
  fromSkuId?: string | null
  toSkuId?: string | null
  cancelledAt?: Date | null
  expiredAt?: Date | null
  pastDueAt?: Date | null
  pausedAt?: Date | null
  cancelAtPeriodEnd?: boolean
  membershipProviderEvidenceId?: string | null
  stripeEventId: string
  query?: QueryExecutor
}): Promise<void> {
  const recorded = await recordMembershipChange({ ...options, ignoreDuplicateStripeEvent: true })
  if (!recorded) throw new DuplicateStripeMembershipEventError()
}

export function getMembershipLifecycleSnapshot(
  status: MembershipStatus,
  cancelAtPeriodEnd: boolean,
  membership: Pick<Membership, 'cancelled_at' | 'expired_at' | 'past_due_at' | 'paused_at'>,
) {
  return {
    cancelledAt: status === 'cancelled' ? membership.cancelled_at : null,
    expiredAt: status === 'expired' ? membership.expired_at : null,
    pastDueAt: status === 'past_due' ? membership.past_due_at : null,
    pausedAt: status === 'paused' ? membership.paused_at : null,
    cancelAtPeriodEnd,
  }
}

export function getMembershipLifecycleSnapshotFromFields(membership: MembershipLifecycleFields) {
  return getMembershipLifecycleSnapshot(
    membership.status,
    membership.cancel_at_period_end,
    membership,
  )
}

export { isTerminalMembershipStatus }

function getMembershipPlanRank(plan: Membership['plan']): number {
  switch (plan) {
    case 'plus':
      return 1
    case 'pro':
      return 2
    default:
      return assertNeverMembershipPlan(plan)
  }
}

function assertNeverMembershipPlan(plan: never): never {
  throw new Error(`Unhandled membership plan: ${plan}`)
}
