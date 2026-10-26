import { beginTransaction, read, readPool } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import { createHash } from 'node:crypto'
import { enqueueInvalidateCommunityMemberUserMetrics } from '@queues/background/enqueues/communities'
import { awaitReportedEnqueueAdmission } from '@queues/background/enqueues'
import onError from '@modules/on-error'
import type { InvalidateCommunityMemberUserMetricsData } from '@queues/background/enqueues/communities-jobs'
import { invalidate } from '@services/entity-cache/invalidate'
import { getCommunitiesWorkLimit } from '../work-limits.mts'
import sql from 'sql-template-strings'

type CommunityMemberMetricPageRow = { id: string; user_id: string }
export type CommunityMemberMetricInvalidationMetadata = {
  xmin: string
  updatedAt: string
  minimumReplayLsn: string
  upperBoundMembershipId: string | null
}

export async function invalidateCommunityMemberUserMetrics(...userIds: string[]): Promise<void> {
  if (userIds.length === 0) return
  await invalidate.user_metrics(...userIds)
}

export async function invalidateCommunityMemberUserMetricsPage(
  data: InvalidateCommunityMemberUserMetricsData,
): Promise<{
  invalidated: number
  nextPageData: InvalidateCommunityMemberUserMetricsData | null
}> {
  const pageSize = getCommunitiesWorkLimit('member_metric_invalidation_page_size')
  const rows =
    (await readReplicaCommunityMemberMetricPage(data, pageSize)) ??
    (await readPrimaryCommunityMemberMetricPage(data, pageSize))
  await invalidateCommunityMemberUserMetrics(...rows.map(row => row.user_id))
  const last = rows.at(-1)
  return {
    invalidated: rows.length,
    nextPageData: rows.length === pageSize && last ? { ...data, afterMembershipId: last.id } : null,
  }
}

export function communityMemberMetricInvalidationData(
  communityId: string,
  metadata: CommunityMemberMetricInvalidationMetadata & { upperBoundMembershipId: string },
): InvalidateCommunityMemberUserMetricsData {
  return {
    communityId,
    generation: createHash('sha256')
      .update(`${communityId}\0${metadata.xmin}\0${metadata.updatedAt}`)
      .digest('hex'),
    minimumReplayLsn: metadata.minimumReplayLsn,
    upperBoundMembershipId: metadata.upperBoundMembershipId,
  }
}

export async function enqueueCommunityMemberMetricInvalidationBestEffort(
  communityId: string,
): Promise<void> {
  const metadata = await captureCommunityMemberMetricInvalidationMetadata(communityId).catch(
    err => {
      onError(
        err instanceof Error
          ? err
          : new Error('Community invalidation metadata failed', { cause: err }),
      )
      return null
    },
  )
  if (!metadata?.upperBoundMembershipId) return
  const upperBoundMembershipId = metadata.upperBoundMembershipId
  return awaitReportedEnqueueAdmission(() =>
    enqueueInvalidateCommunityMemberUserMetrics(
      communityMemberMetricInvalidationData(communityId, {
        ...metadata,
        upperBoundMembershipId,
      }),
    ),
  )
}

async function readReplicaCommunityMemberMetricPage(
  data: InvalidateCommunityMemberUserMetricsData,
  pageSize: number,
): Promise<CommunityMemberMetricPageRow[] | null> {
  const client = await readPool.connect()
  try {
    await using transaction = await beginTransaction({ client })
    const { rows } = await transaction<{
      is_in_recovery: boolean
      transaction_read_only: 'on' | 'off'
      replay_caught_up: boolean
    }>(
      `/* communityMemberMetricReplicaBarrier */
      SELECT pg_is_in_recovery() AS is_in_recovery,
        current_setting('transaction_read_only') AS transaction_read_only,
        COALESCE(pg_last_wal_replay_lsn() >= $1::pg_lsn, false) AS replay_caught_up`,
      [data.minimumReplayLsn],
    )
    const state = rows[0]
    const safeReader =
      state?.transaction_read_only === 'off' || (state?.is_in_recovery && state.replay_caught_up)
    if (!safeReader) return null
    const page = await queryCommunityMemberMetricPage(transaction, data, pageSize)
    await transaction.commit()
    return page
  } finally {
    client.release()
  }
}

async function readPrimaryCommunityMemberMetricPage(
  data: InvalidateCommunityMemberUserMetricsData,
  pageSize: number,
): Promise<CommunityMemberMetricPageRow[]> {
  const statement = communityMemberMetricPageStatement(data, pageSize)
  return (
    await read<CommunityMemberMetricPageRow>(statement.text, statement.values, {
      readOnly: false,
    })
  ).rows
}

async function queryCommunityMemberMetricPage(
  query: QueryExecutor,
  data: InvalidateCommunityMemberUserMetricsData,
  pageSize: number,
): Promise<CommunityMemberMetricPageRow[]> {
  const statement = communityMemberMetricPageStatement(data, pageSize)
  return (await query<CommunityMemberMetricPageRow>(statement.text, statement.values)).rows
}

function communityMemberMetricPageStatement(
  data: InvalidateCommunityMemberUserMetricsData,
  pageSize: number,
) {
  return sql`/* readCommunityMemberMetricPage */
    SELECT member.id, member.user_id
    FROM community_members member
    WHERE member.community_id = ${data.communityId}
      AND member.removed_at IS NULL
      AND member.id > ${data.afterMembershipId ?? '00000000-0000-0000-0000-000000000000'}
      AND member.id <= ${data.upperBoundMembershipId}
    ORDER BY member.id
    LIMIT ${pageSize}`
}

async function captureCommunityMemberMetricInvalidationMetadata(
  communityId: string,
): Promise<CommunityMemberMetricInvalidationMetadata | null> {
  const { rows } = await read<{
    xmin: string
    updated_at: string
    minimum_replay_lsn: string
    upper_bound_membership_id: string | null
  }>(
    sql`/* captureCommunityMemberMetricInvalidationMetadata */
      SELECT community.xmin::text AS xmin,
        community.updated_at::text AS updated_at,
        pg_current_wal_insert_lsn()::text AS minimum_replay_lsn,
        (
          SELECT member.id
          FROM community_members member
          WHERE member.community_id = community.id AND member.removed_at IS NULL
          ORDER BY member.id DESC
          LIMIT 1
        ) AS upper_bound_membership_id
      FROM communities community
      WHERE community.id = ${communityId}
    `,
    { readOnly: false },
  )
  const row = rows[0]
  return row
    ? {
        xmin: row.xmin,
        updatedAt: row.updated_at,
        minimumReplayLsn: row.minimum_replay_lsn,
        upperBoundMembershipId: row.upper_bound_membership_id,
      }
    : null
}
