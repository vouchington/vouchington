import type { QueryExecutor } from '@data-stores/psql'
import type {
  MembershipProviderEvidenceDependency,
  ResolvedMembershipProviderEvidence,
} from '../create-types.mts'
import {
  setMembershipProjectionCancelAtPeriodEnd,
  type CreatedMembership,
} from '../projections/create.mts'
import { isTerminalMembershipStatus } from '../update-result.mts'
import type { MembershipStatus } from '../types.mts'

export async function resolveMembershipProviderEvidence(
  dependencies: MembershipProviderEvidenceDependency,
  membership: Pick<CreatedMembership, 'id'>,
  query: QueryExecutor,
): Promise<ResolvedMembershipProviderEvidence | null> {
  if (dependencies.membershipProviderEvidenceId !== undefined)
    return dependencies.membershipProviderEvidenceId
      ? { membershipProviderEvidenceId: dependencies.membershipProviderEvidenceId }
      : null
  return (await dependencies.getMembershipProviderEvidence?.(membership, query)) ?? null
}

export async function acceptMembershipProviderEvidence(
  dependencies: MembershipProviderEvidenceDependency,
  membership: CreatedMembership,
  status: MembershipStatus,
  query: QueryExecutor,
): Promise<{ membership: CreatedMembership; membershipProviderEvidenceId: string | null }> {
  const evidence = await resolveMembershipProviderEvidence(dependencies, membership, query)
  const cancelAtPeriodEnd = isTerminalMembershipStatus(status)
    ? false
    : (evidence?.cancelAtPeriodEnd ?? membership.cancel_at_period_end)
  return {
    membership: await setMembershipProjectionCancelAtPeriodEnd(
      membership,
      cancelAtPeriodEnd,
      query,
    ),
    membershipProviderEvidenceId: evidence?.membershipProviderEvidenceId ?? null,
  }
}
