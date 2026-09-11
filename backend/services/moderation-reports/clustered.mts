import onError from '@modules/on-error'
import type {
  ClusteredModerationReportsResponse,
  ListClusteredModerationReportsOptions,
  ModerationReportEntityCluster,
} from './clustered-types.mts'
import { buildDuplicateClusters } from './clustered-duplicates.mts'
import { selectEntityClusterRows, selectReportsByCluster } from './clustered-query.mts'
import { selectPostIndicators } from './clustered-indicators.mts'
import {
  applyDeletedClusterLabel,
  clusterId,
  emptyIndicators,
  encodeClusterCursor,
  parseReasonBreakdown,
} from './clustered-utils.mts'

export type {
  ClusteredModerationReportsResponse,
  ListClusteredModerationReportsOptions,
} from './clustered-types.mts'

export async function listClusteredModerationReports(
  options: ListClusteredModerationReportsOptions,
): Promise<ClusteredModerationReportsResponse> {
  const {
    limit,
    status = 'pending',
    sort = 'created_at_desc',
    beforeCursor,
    cursorScope,
    cursorDirection = 'after',
  } = options
  const sortAsc = sort === 'created_at_asc'
  const rows = await selectEntityClusterRows({
    limit,
    status,
    sortAsc,
    beforeCursor,
    cursorDirection,
  })
  const hasMoreInQueryDirection = rows.length > limit
  let pageRows = hasMoreInQueryDirection ? rows.slice(0, limit) : rows
  if (cursorDirection === 'before') pageRows = pageRows.toReversed()
  const hasNextPage = cursorDirection === 'before' ? Boolean(beforeCursor) : hasMoreInQueryDirection
  const hasPreviousPage =
    cursorDirection === 'before' ? hasMoreInQueryDirection : Boolean(beforeCursor)
  const [reportsByCluster, indicatorsByPostId] = await Promise.all([
    selectReportsByCluster(status, pageRows, sortAsc),
    selectPostIndicators(pageRows).catch(error => {
      onError(error instanceof Error ? error : new Error(String(error)))
      return new Map()
    }),
  ])

  const clusters = pageRows.map(row => {
    const labelled = applyDeletedClusterLabel(row)
    const id = clusterId(row.entity_type, row.entity_id)
    return {
      id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      report_count: row.report_count,
      reporter_count: row.reporter_count,
      reason_breakdown: parseReasonBreakdown(row.reason_counts),
      first_reported_at: row.first_reported_at,
      last_reported_at: row.last_reported_at,
      target_label: labelled.target_label,
      target_content: labelled.target_content,
      target_path: labelled.target_path,
      admin_action_path: labelled.admin_action_path,
      target_user_id: row.target_user_id,
      target_available: row.target_available,
      target_is_restricted: row.target_is_restricted,
      indicators:
        row.entity_type === 'post'
          ? (indicatorsByPostId.get(row.entity_id)?.indicators ?? emptyIndicators())
          : emptyIndicators(),
      reports: reportsByCluster.get(id) ?? [],
    } satisfies ModerationReportEntityCluster
  })

  const duplicate_clusters = await buildDuplicateClusters(clusters, indicatorsByPostId).catch(
    error => {
      onError(error instanceof Error ? error : new Error(String(error)))
      return []
    },
  )
  const lastRow = pageRows[pageRows.length - 1]
  return {
    cluster_mode: 'entity',
    results: clusters,
    duplicate_clusters,
    page_info: {
      has_next_page: hasNextPage,
      has_previous_page: hasPreviousPage,
      end_cursor:
        hasNextPage && lastRow ? encodeClusterCursor(lastRow, sort, status, cursorScope) : null,
      start_cursor: pageRows[0]
        ? encodeClusterCursor(pageRows[0], sort, status, cursorScope)
        : null,
    },
  }
}
