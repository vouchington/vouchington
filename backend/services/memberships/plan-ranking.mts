import type { MembershipPlanSlug } from './types.mts'

/** Positive when `left` outranks `right`. Change classification passes `(next, previous)`. */
export function compareMembershipPlans(
  left: MembershipPlanSlug,
  right: MembershipPlanSlug,
): number {
  return getMembershipPlanRank(left) - getMembershipPlanRank(right)
}

export function isHigherMembershipPlan(
  candidate: MembershipPlanSlug,
  current: MembershipPlanSlug,
): boolean {
  return compareMembershipPlans(candidate, current) > 0
}

function getMembershipPlanRank(plan: MembershipPlanSlug): number {
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
