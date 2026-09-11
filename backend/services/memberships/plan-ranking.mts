import type { MembershipPlanSlug } from './types.mts'

export function isHigherMembershipPlan(
  candidate: MembershipPlanSlug,
  current: MembershipPlanSlug,
): boolean {
  return getMembershipPlanRank(candidate) > getMembershipPlanRank(current)
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
