import { type TransactionQuery, write } from '@data-stores/psql'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { CONTRIBUTION_QUOTA_EXCEEDED } from '@modules/on-error/error-codes'
import sql from 'sql-template-strings'
import type {
  ContributionAdmissionPolicy,
  ContributionAdmissionConsumptionMode,
  ContributionPolicy,
  ContributionPolicySource,
  ContributionPolicyWindow,
} from './policy.mts'
import { assertDailyOnlyContributionAdmissionCapacity } from './admission-daily-capacity.mts'

export const MAX_CONTRIBUTION_POLICY_WINDOW_SECONDS = 86_400
export const CONTRIBUTION_QUOTA_RETENTION_DAYS = 7

export async function pruneExpiredContributionAdmissionConsumptions(
  now?: Date,
  batchSize = 100,
  lowerBoundDate?: Date,
): Promise<number> {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('batchSize must be positive')
  const result = await write(sql`/* pruneExpiredContributionAdmissionConsumptions */
    WITH expired AS (
      SELECT reservation_id FROM post_admission_quota_consumptions
      WHERE committed_at < COALESCE(${now ?? null}::timestamptz, NOW())
        - (${CONTRIBUTION_QUOTA_RETENTION_DAYS} * INTERVAL '1 day')
        AND (${lowerBoundDate ?? null}::timestamptz IS NULL OR committed_at >= ${lowerBoundDate ?? null})
      ORDER BY committed_at, reservation_id
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM post_admission_quota_consumptions
    WHERE reservation_id IN (SELECT reservation_id FROM expired)`)
  return result.rowCount ?? 0
}

export async function assertContributionAdmissionCapacity(
  query: TransactionQuery,
  actorId: string,
  source: ContributionPolicySource,
  policy: ContributionAdmissionPolicy,
): Promise<void> {
  if ('kind' in policy)
    return assertDailyOnlyContributionAdmissionCapacity(query, actorId, source, policy)
  const quotaSource = contributionQuotaSource(source)
  assertContributionPolicyWindow(policy.global.short)
  assertContributionPolicyWindow(policy.global.daily)
  assertContributionPolicyWindow(policy.type.short)
  assertContributionPolicyWindow(policy.type.daily)
  const counts =
    await query<ContributionAdmissionQuotaCounts>(sql`/* assertContributionAdmissionCapacity.count */
    WITH observed_at AS (SELECT clock_timestamp() AS value)
    SELECT
      COUNT(*) FILTER (WHERE committed_at >= observed_at.value - (${policy.global.short.windowSeconds} * INTERVAL '1 second') AND consumption_mode = 'all_windows') AS global_short,
      COUNT(*) FILTER (WHERE committed_at >= observed_at.value - (${policy.global.daily.windowSeconds} * INTERVAL '1 second')) AS global_daily,
      COUNT(*) FILTER (WHERE source = ${quotaSource} AND committed_at >= observed_at.value - (${policy.type.short.windowSeconds} * INTERVAL '1 second') AND consumption_mode = 'all_windows') AS type_short,
      COUNT(*) FILTER (WHERE source = ${quotaSource} AND committed_at >= observed_at.value - (${policy.type.daily.windowSeconds} * INTERVAL '1 second')) AS type_daily
    FROM post_admission_quota_consumptions
    CROSS JOIN observed_at
    WHERE actor_id = ${actorId}`)
  const row = counts.rows[0]
  if (!row) throw new Error('Contribution admission quota counts were not returned')
  if (isOverCapacity(row, policy))
    throw createCodedError(
      429,
      'Contribution limit exceeded. Please try again later.',
      CONTRIBUTION_QUOTA_EXCEEDED,
    )
}

export async function recordContributionAdmissionConsumption(
  query: TransactionQuery,
  reservationId: string,
  actorId: string,
  source: ContributionPolicySource,
  committedAt: Date,
  consumptionMode: ContributionAdmissionConsumptionMode,
): Promise<Date> {
  const result = await query<{
    committed_at: Date
  }>(sql`/* recordContributionAdmissionConsumption.insert */
    INSERT INTO post_admission_quota_consumptions (reservation_id, actor_id, source, committed_at, consumption_mode)
    VALUES (${reservationId}, ${actorId}, ${contributionQuotaSource(source)}, ${committedAt}, ${consumptionMode})
    RETURNING committed_at`)
  const recordedAt = result.rows[0]?.committed_at
  if (!recordedAt) throw new Error('Contribution admission consumption timestamp was not returned')
  return recordedAt
}

type ContributionAdmissionQuotaCounts = {
  global_short: string
  global_daily: string
  type_short: string
  type_daily: string
}

function isOverCapacity(
  counts: ContributionAdmissionQuotaCounts,
  policy: ContributionPolicy,
): boolean {
  return (
    exceedsLimit(counts.global_short, policy.global.short) ||
    exceedsLimit(counts.global_daily, policy.global.daily) ||
    exceedsLimit(counts.type_short, policy.type.short) ||
    exceedsLimit(counts.type_daily, policy.type.daily)
  )
}

export function contributionQuotaSource(source: ContributionPolicySource): string {
  if (source === 'link' || source === 'story' || source === 'rss_item_discussion')
    return 'discussion'
  return source
}

export function assertContributionPolicyWindow(window: ContributionPolicyWindow): void {
  if (
    !Number.isInteger(window.limit) ||
    window.limit < -1 ||
    !Number.isInteger(window.windowSeconds) ||
    window.windowSeconds <= 0 ||
    window.windowSeconds > MAX_CONTRIBUTION_POLICY_WINDOW_SECONDS
  )
    throw new Error('Invalid contribution admission policy')
}

function exceedsLimit(count: string, window: ContributionPolicyWindow): boolean {
  return window.limit !== -1 && Number(count) >= window.limit
}
