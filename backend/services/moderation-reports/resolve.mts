import {
  beginTransaction,
  withTransactionOptions,
  write,
  type QueryOptions,
} from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import {
  createModerationReportReviewedNotification,
  createModerationReportReviewedNotifications,
} from '@services/notifications'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import {
  type ModerationReport,
  type ModerationReportEntityType,
  reportEntityFkColumn,
} from './config.mts'
import { recordModeratorAction, recordModeratorActions } from '@services/moderator-actions'
import { recordModerationTrainingFeedback } from '@services/moderation-training'
import { maybeResolveCase } from '@services/moderation-cases'
import { getModerationSystemUserId } from '@services/users/system-users'
import { enqueueReportResolutionNotificationsBestEffort } from './enqueue-report-resolution-notifications.mts'
import { getReportResolutionContext } from './resolution-context.mts'
import { ownsReportResolutionTransaction } from './transaction-ownership.mts'
export { getReportResolutionContext } from './resolution-context.mts'
type ReportResolutionScope = {
  communityId?: string
  resolvedById: string | null
  status: 'reviewed' | 'dismissed' | 'actioned'
}
export async function resolveModerationReport(
  reportId: string,
  options: ReportResolutionScope,
  queryOptions?: QueryOptions,
): Promise<ModerationReport> {
  const shouldEnqueueNotifications = await ownsReportResolutionTransaction(queryOptions)
  const run = async (query: TransactionQuery) => {
    const context = await getReportResolutionContext(reportId, options.communityId, { query })
    assert(context, 404, 'Report not found')
    if (options.communityId) assert(context.is_in_community_scope, 403, 'Forbidden')
    assert(context.status === 'pending', 409, 'Report is already resolved')
    const { rows } = await write(
      sql`/* resolveModerationReport */
          WITH updated AS (
            UPDATE moderation_reports
            SET reviewed_at = CURRENT_TIMESTAMP,
                resolution_action = ${options.status},
                resolved_by_id = ${options.resolvedById}
            WHERE id = ${reportId}
              AND reviewed_at IS NULL
            RETURNING
              id, case_id, created_at, reviewed_at, reporter_user_id,
              post_id, reported_user_id, hostname_id, rss_feed_item_id,
              reason, note, resolution_action, resolved_by_id
          )
          SELECT
            u.id,
            u.case_id,
            u.created_at,
            u.reviewed_at,
            u.reporter_user_id,
            u.reason,
            u.note,
            u.resolution_action::text AS status,
            u.resolved_by_id,
            CASE
              WHEN u.post_id IS NOT NULL AND p.post_type = 'comment' THEN 'comment'
              WHEN u.post_id IS NOT NULL THEN 'post'
              WHEN u.reported_user_id IS NOT NULL THEN 'user'
              WHEN u.hostname_id IS NOT NULL THEN 'url_hostname'
              WHEN u.rss_feed_item_id IS NOT NULL THEN 'rss_feed_item'
            END::moderation_report_entity_type AS entity_type,
            COALESCE(u.post_id, u.reported_user_id, u.hostname_id, u.rss_feed_item_id) AS entity_id
          FROM updated u
          LEFT JOIN posts p ON u.post_id IS NOT NULL AND p.id = u.post_id
        `,
      { query },
    )
    const report = rows[0] as ModerationReport | undefined
    assert(report, 409, 'Report is already resolved')
    const [notifications] = await Promise.all([
      createModerationReportReviewedNotification(report.id, { query }),
      lockModerationCases([report.case_id], { query }).then(() =>
        maybeResolveCase(report.case_id, options.resolvedById, { query }),
      ),
      recordModerationTrainingFeedback(
        {
          sourceType: 'moderation_report',
          eventType: 'report_resolved',
          label: options.status === 'dismissed' ? 'rejected' : 'accepted',
          humanAction: `report_${options.status}`,
          actorUserId: options.resolvedById,
          communityId: options.communityId ?? context.derived_community_id ?? null,
          postId: context.target_post_id,
          moderationReportId: report.id,
          metadata: {
            entity_type: report.entity_type,
            entity_id: report.entity_id,
            report_reason: report.reason,
          },
        },
        { query },
      ),
    ])
    if (options.resolvedById) {
      await recordModeratorAction(
        options.resolvedById,
        {
          actionType: options.status === 'dismissed' ? 'dismiss_report' : 'resolve_report',
          communityId: options.communityId ?? context.derived_community_id ?? null,
          reportId,
        },
        { query },
      )
    }
    return { report, notifications }
  }
  const { report, notifications } =
    queryOptions?.query || queryOptions?.client
      ? await withTransactionOptions(queryOptions, run)
      : await runInOwnedTransaction(run)
  if (shouldEnqueueNotifications) enqueueReportResolutionNotificationsBestEffort(notifications)
  return report
}
export async function dismissPendingReportsForDeletedEntity(
  entityType: ModerationReportEntityType,
  entityId: string,
  queryOptions?: QueryOptions,
): Promise<number> {
  const [shouldEnqueueNotifications, moderationSystemUserId] = await Promise.all([
    ownsReportResolutionTransaction(queryOptions),
    getModerationSystemUserId(),
  ])
  const run = async (query: TransactionQuery) => {
    const fkColumn = reportEntityFkColumn(entityType)
    const updateQuery = sql`/* dismissPendingReportsForDeletedEntity */
      WITH updated AS (
        UPDATE moderation_reports
        SET reviewed_at = CURRENT_TIMESTAMP,
            resolution_action = 'dismissed',
            resolved_by_id = ${moderationSystemUserId}
        WHERE `
    updateQuery.append(fkColumn)
    updateQuery.append(sql` = ${entityId}::uuid AND reviewed_at IS NULL
        RETURNING id, case_id, post_id
      )
      SELECT u.id, u.case_id, p.community_id AS post_or_comment_community_id
      FROM updated u
      LEFT JOIN posts p ON p.id = u.post_id
    `)
    const { rows } = await write<{
      id: string
      case_id: string
      post_or_comment_community_id: string | null
    }>(updateQuery, { query })
    const caseIds = [...new Set(rows.map(row => row.case_id))]
    const [notifications] = await Promise.all([
      createModerationReportReviewedNotifications(
        rows.map(row => row.id),
        { query },
      ),
      lockModerationCases(caseIds, { query }).then(() =>
        Promise.all(
          caseIds.map(caseId => maybeResolveCase(caseId, moderationSystemUserId, { query })),
        ),
      ),
      recordModeratorActions(
        moderationSystemUserId,
        rows.map(row => ({
          actionType: 'dismiss_report',
          communityId: row.post_or_comment_community_id,
          reportId: row.id,
        })),
        { query },
      ),
    ])
    return { count: rows.length, notifications }
  }
  const { count, notifications } =
    queryOptions?.query || queryOptions?.client
      ? await withTransactionOptions(queryOptions, run)
      : await runInOwnedTransaction(run)
  if (shouldEnqueueNotifications) enqueueReportResolutionNotificationsBestEffort(notifications)
  return count
}
async function runInOwnedTransaction<T>(run: (query: TransactionQuery) => Promise<T>): Promise<T> {
  await using transaction = await beginTransaction()
  const result = await run(transaction)
  await transaction.commit()
  return result
}
async function lockModerationCases(caseIds: string[], options: QueryOptions): Promise<void> {
  const ids = [...new Set(caseIds)]
  if (ids.length === 0) return
  await write(
    sql`/* lockModerationCases */ SELECT id FROM moderation_cases WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`,
    options,
  )
}
