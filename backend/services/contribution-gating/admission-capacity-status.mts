import type { ContributionPolicy, ContributionPolicySource } from './policy.mts'
import { queryContributionAdmissionCapacityStatus } from './admission-capacity-query.mts'
import { assertContributionPolicyWindow, contributionQuotaSource } from './admission-quota.mts'

export type ContributionAdmissionCapacityStatus = {
  allowed: boolean
  reason?: 'global_limit' | 'type_limit'
  retryAfterSeconds?: number
}

/** Returns client-safe capacity without exposing server-owned limits or raw counts. */
export async function getContributionAdmissionCapacityStatus(
  actorId: string,
  source: ContributionPolicySource,
  policy: ContributionPolicy,
): Promise<ContributionAdmissionCapacityStatus> {
  const quotaSource = contributionQuotaSource(source)
  assertContributionPolicyWindow(policy.global.short)
  assertContributionPolicyWindow(policy.global.daily)
  assertContributionPolicyWindow(policy.type.short)
  assertContributionPolicyWindow(policy.type.daily)
  const result = await queryContributionAdmissionCapacityStatus(actorId, quotaSource, policy)
  const row = result.rows[0]
  if (!row) throw new Error('Contribution admission capacity was not returned')
  if (row.allowed) return { allowed: true }
  if (row.reason !== 'global_limit' && row.reason !== 'type_limit')
    throw new Error('Contribution admission capacity reason was not returned')
  const retryAfterSeconds = Number(row.retry_after_seconds)
  return {
    allowed: false,
    reason: row.reason,
    ...(Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0 ? { retryAfterSeconds } : {}),
  }
}
