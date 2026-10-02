import type { TransactionQuery } from '@data-stores/psql'
import { assertContributionAdmissionCapacity } from './admission-quota.mts'
import type { ContributionAdmissionPolicy, ContributionPolicySource } from './policy.mts'

export class RejectedContributionAdmissionCapacityError extends Error {
  readonly reason: unknown

  constructor(reason: unknown) {
    super('Contribution admission capacity was rejected')
    this.reason = reason
  }
}

export async function assertContributionAdmissionCapacityOrReject(
  query: TransactionQuery,
  actorId: string,
  source: ContributionPolicySource,
  policy: ContributionAdmissionPolicy,
): Promise<void> {
  return runContributionAdmissionCapacityCheckOrReject(() =>
    assertContributionAdmissionCapacity(query, actorId, source, policy),
  )
}

export async function runContributionAdmissionCapacityCheckOrReject<T>(
  check: () => Promise<T>,
): Promise<T> {
  try {
    return await check()
  } catch (err) {
    if (isContributionQuotaRejection(err)) throw new RejectedContributionAdmissionCapacityError(err)
    throw err
  }
}

function isContributionQuotaRejection(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === 'CONTRIBUTION_QUOTA_EXCEEDED'
  )
}
