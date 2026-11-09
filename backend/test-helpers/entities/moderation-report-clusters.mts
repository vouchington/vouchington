import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { ENTITY_TYPE_TO_REPORT_FK } from './moderation-report-status.mts'

export type TestModerationReportCluster = {
  resolution_action: 'reviewed' | 'actioned' | 'dismissed' | null
  first_reported_at: Date
  last_reported_at: Date
}

export async function getTestModerationReportClusters(
  entityType: 'post' | 'comment' | 'user' | 'url_hostname' | 'rss_feed_item',
  entityId: string,
): Promise<TestModerationReportCluster[]> {
  const fkColumn = ENTITY_TYPE_TO_REPORT_FK[entityType]
  const query = sql`/* getTestModerationReportClusters */
    SELECT resolution_action, first_reported_at, last_reported_at
    FROM moderation_report_clusters WHERE `
  query.append(fkColumn)
  query.append(sql` = ${entityId}::uuid ORDER BY resolution_action NULLS FIRST`)
  const { rows } = await write<TestModerationReportCluster>(query)
  return rows
}

export async function deleteTestModerationReports(reportIds: string[]): Promise<void> {
  await write(sql`/* deleteTestModerationReports */
    DELETE FROM moderation_reports WHERE id = ANY(${reportIds}::uuid[])`)
}

export async function resolveTestModerationReports(
  reportIds: string[],
  resolutionAction: 'reviewed' | 'actioned' | 'dismissed',
): Promise<void> {
  await write(sql`/* resolveTestModerationReports */
    UPDATE moderation_reports SET reviewed_at = NOW(), resolution_action = ${resolutionAction}
    WHERE id = ANY(${reportIds}::uuid[])`)
}

export async function swapTestModerationReportStatuses(
  pendingReportId: string,
  reviewedReportId: string,
): Promise<void> {
  await Promise.all([
    write(sql`/* swapTestModerationReportStatuses:review */
      UPDATE moderation_reports
      SET reviewed_at = NOW(), resolution_action = 'reviewed'
      WHERE id = ${pendingReportId}::uuid`),
    write(sql`/* swapTestModerationReportStatuses:reopen */
      UPDATE moderation_reports
      SET reviewed_at = NULL, resolution_action = NULL
      WHERE id = ${reviewedReportId}::uuid`),
  ])
}
