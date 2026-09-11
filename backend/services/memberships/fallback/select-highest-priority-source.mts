import { isHigherMembershipPlan } from '../plan-ranking.mts'
import type { MembershipPlanSlug } from '../types.mts'

export type MembershipSourcePriority = {
  effective_at: Date
  membership_source_id: string
  plan: MembershipPlanSlug
  source_kind: 'admin_grant' | 'direct' | 'family'
}

export function selectHighestPriorityMembershipSource<Source extends MembershipSourcePriority>(
  sources: Source[],
): Source | undefined {
  return sources.reduce<Source | undefined>(
    (preferred, candidate) =>
      !preferred || isHigherPriorityMembershipSource(candidate, preferred) ? candidate : preferred,
    undefined,
  )
}

function isHigherPriorityMembershipSource(
  candidate: MembershipSourcePriority,
  preferred: MembershipSourcePriority,
): boolean {
  if (isHigherMembershipPlan(candidate.plan, preferred.plan)) return true
  if (isHigherMembershipPlan(preferred.plan, candidate.plan)) return false
  if (
    getMembershipSourceKindPriority(candidate.source_kind) !==
    getMembershipSourceKindPriority(preferred.source_kind)
  )
    return (
      getMembershipSourceKindPriority(candidate.source_kind) >
      getMembershipSourceKindPriority(preferred.source_kind)
    )
  if (candidate.effective_at.getTime() !== preferred.effective_at.getTime())
    return candidate.effective_at > preferred.effective_at
  return candidate.membership_source_id > preferred.membership_source_id
}

function getMembershipSourceKindPriority(
  sourceKind: MembershipSourcePriority['source_kind'],
): number {
  switch (sourceKind) {
    case 'direct':
      return 3
    case 'admin_grant':
      return 2
    case 'family':
      return 1
  }
}
