import type { TransactionQuery } from '@data-stores/psql'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { CONTRIBUTION_QUOTA_EXCEEDED } from '@modules/on-error/error-codes'
import sql from 'sql-template-strings'
import type {
  ContributionDailyOnlyPolicy,
  ContributionPolicySource,
  ContributionPolicyWindow,
} from './policy.mts'

export async function assertDailyOnlyContributionAdmissionCapacity(
  query: TransactionQuery,
  actorId: string,
  source: ContributionPolicySource,
  policy: ContributionDailyOnlyPolicy,
): Promise<void> {
  assertPolicyWindow(policy.global)
  assertPolicyWindow(policy.type)
  const quotaSource = contributionQuotaSource(source)
  const counts =
    await query<ContributionAdmissionDailyQuotaCounts>(sql`/* assertContributionAdmissionCapacity.dailyOnly */
    WITH observed_at AS (SELECT clock_timestamp() AS value)
    SELECT
      COUNT(*) FILTER (WHERE committed_at >= observed_at.value - (${policy.global.windowSeconds} * INTERVAL '1 second')) AS global_daily,
      COUNT(*) FILTER (WHERE source = ${quotaSource} AND committed_at >= observed_at.value - (${policy.type.windowSeconds} * INTERVAL '1 second')) AS type_daily
    FROM post_admission_quota_consumptions
    CROSS JOIN observed_at
    WHERE actor_id = ${actorId}`)
  const row = counts.rows[0]
  if (!row) throw new Error('Contribution admission quota counts were not returned')
  if (exceedsLimit(row.global_daily, policy.global) || exceedsLimit(row.type_daily, policy.type))
    throw createCodedError(
      429,
      'Contribution limit exceeded. Please try again later.',
      CONTRIBUTION_QUOTA_EXCEEDED,
    )
}

type ContributionAdmissionDailyQuotaCounts = {
  global_daily: string
  type_daily: string
}

function contributionQuotaSource(source: ContributionPolicySource): string {
  if (source === 'link' || source === 'story' || source === 'rss_item_discussion')
    return 'discussion'
  return source
}

function assertPolicyWindow(window: ContributionPolicyWindow): void {
  if (
    !Number.isInteger(window.limit) ||
    window.limit < -1 ||
    !Number.isInteger(window.windowSeconds) ||
    window.windowSeconds <= 0 ||
    window.windowSeconds > 86_400
  )
    throw new Error('Invalid contribution admission policy')
}

function exceedsLimit(count: string, window: ContributionPolicyWindow): boolean {
  return window.limit !== -1 && Number(count) >= window.limit
}
