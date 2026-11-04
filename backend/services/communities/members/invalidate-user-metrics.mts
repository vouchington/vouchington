import { read } from '@data-stores/psql'
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
  const rows = await readPrimaryCommunityMemberMetricPage(data, pageSize)
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
    upper_bound_membership_id: string | null
  }>(
    sql`/* captureCommunityMemberMetricInvalidationMetadata */
      SELECT community.xmin::text AS xmin,
        community.updated_at::text AS updated_at,
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
        upperBoundMembershipId: row.upper_bound_membership_id,
      }
    : null
}
