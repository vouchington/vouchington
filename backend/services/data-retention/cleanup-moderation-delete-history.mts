import type { QueryExecutor } from '@data-stores/psql/types'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'
import type { ModerationCleanupKind } from './cleanup-moderation-kinds.mts'

/** Delete only terminal records after their window; the candidate ids are one locked keyset page. */
export async function deleteExpiredModerationHistory(
  kind: ModerationCleanupKind,
  query: QueryExecutor,
  ids: string[],
  now: Date,
): Promise<number> {
  if (ids.length === 0) return 0
  let rowCount: number | null
  switch (kind) {
    case 'reports':
      ;({ rowCount } = await query(sql`/* deleteExpiredModerationHistory:reports */
        DELETE FROM moderation_reports report
        WHERE report.id = ANY(${ids}::uuid[])
          AND report.reviewed_at < ${now}::timestamptz - interval '24 months'
      `))
      break
    case 'cases':
      ;({ rowCount } = await query(sql`/* deleteExpiredModerationHistory:cases */
        DELETE FROM moderation_cases moderation_case
        WHERE moderation_case.id = ANY(${ids}::uuid[])
          AND moderation_case.resolved_at < ${now}::timestamptz - interval '24 months'
          AND NOT EXISTS (SELECT 1 FROM moderation_reports report WHERE report.case_id = moderation_case.id)
          AND NOT EXISTS (SELECT 1 FROM moderation_appeals appeal WHERE appeal.case_id = moderation_case.id)
          AND NOT EXISTS (SELECT 1 FROM user_warnings warning WHERE warning.case_id = moderation_case.id)
          AND NOT EXISTS (SELECT 1 FROM community_bans ban WHERE ban.case_id = moderation_case.id)
          AND NOT EXISTS (SELECT 1 FROM moderation_report_judgements judgement WHERE judgement.case_id = moderation_case.id)
      `))
      break
    case 'appeals':
      ;({ rowCount } = await query(sql`/* deleteExpiredModerationHistory:appeals */
        DELETE FROM moderation_appeals appeal
        WHERE appeal.id = ANY(${ids}::uuid[])
          AND appeal.resolved_at < ${now}::timestamptz - interval '24 months'
      `))
      break
    case 'disputes':
      ;({ rowCount } = await query(sql`/* deleteExpiredModerationHistory:disputes */
        DELETE FROM review_disputes dispute
        WHERE dispute.id = ANY(${ids}::uuid[])
          AND dispute.resolved_at < ${now}::timestamptz - interval '24 months'
      `))
      break
    case 'actions':
      ;({ rowCount } = await query(sql`/* deleteExpiredModerationHistory:actions */
        DELETE FROM moderator_actions action
        WHERE action.id = ANY(${ids}::uuid[])
          AND (
            ((action.scheduled_job_key IS NOT NULL OR action.backfill_key IS NOT NULL OR action.queue_name IS NOT NULL)
              AND action.id < ${systemActionUpperId(now)}::uuid)
            OR (action.id < fn_min_uuidv7(${now}::timestamptz - interval '24 months'))
          )
      `))
      break
    case 'training_feedbacks':
      ;({ rowCount } = await query(sql`/* deleteExpiredModerationHistory:trainingFeedbacks */
        DELETE FROM moderation_training_feedbacks feedback
        WHERE feedback.id = ANY(${ids}::uuid[])
          AND feedback.id < ${sixMonthUpperId(now)}::uuid
          AND NOT (
            feedback.label IS NOT DISTINCT FROM 'false_positive'
            AND COALESCE((
              SELECT
                post.in_review_at IS NOT NULL
                OR post.rejected_at IS NOT NULL
                OR COALESCE((
                  SELECT TRUE FROM community_post_reviews review
                  WHERE review.post_id = post.id
                    AND review.automod_action = 'unpublish'
                    AND review.automod_flagged_at IS NOT NULL
                  LIMIT 1
                ), FALSE)
              FROM posts post
              WHERE post.id = feedback.post_id
                AND post.deleted_at IS NULL
            ), FALSE)
          )
      `))
      break
    case 'judgements':
      ;({ rowCount } = await query(sql`/* deleteExpiredModerationHistory:judgements */
        DELETE FROM moderation_report_judgements judgement
        WHERE judgement.id = ANY(${ids}::uuid[])
          AND judgement.dispatched_at IS NOT NULL
          AND judgement.dispatched_at < ${now}::timestamptz - interval '90 days'
          AND (
            (judgement.post_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM moderation_report_judgements newer
              WHERE newer.post_id = judgement.post_id AND newer.id > judgement.id
                AND newer.dispatched_at IS NOT NULL
            ))
            OR (judgement.reported_user_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM moderation_report_judgements newer
              WHERE newer.reported_user_id = judgement.reported_user_id AND newer.id > judgement.id
                AND newer.dispatched_at IS NOT NULL
            ))
            OR (judgement.hostname_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM moderation_report_judgements newer
              WHERE newer.hostname_id = judgement.hostname_id AND newer.id > judgement.id
                AND newer.dispatched_at IS NOT NULL
            ))
            OR (judgement.rss_feed_item_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM moderation_report_judgements newer
              WHERE newer.rss_feed_item_id = judgement.rss_feed_item_id AND newer.id > judgement.id
                AND newer.dispatched_at IS NOT NULL
            ))
          )
      `))
      break
    default:
      throw new Error(`Not a moderation history cleanup kind: ${kind}`)
  }
  return rowCount ?? 0
}

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1_000)
}

function systemActionUpperId(now: Date): string {
  return getMinUUIDv7ForDate(daysBefore(now, 90))
}

function sixMonthUpperId(now: Date): string {
  return getMinUUIDv7ForDate(daysBefore(now, 180))
}
