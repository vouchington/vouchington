import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

export function createModerationReportReviewedNotification(
  reportId: string,
  options?: QueryOptions,
): Promise<Array<{ user_id: string; id: string }>> {
  return createModerationReportReviewedNotifications([reportId], options)
}

export async function createModerationReportReviewedNotifications(
  reportIds: string[],
  options?: QueryOptions,
): Promise<Array<{ user_id: string; id: string }>> {
  if (reportIds.length === 0) return []

  const { rows } = await write(
    sql`/* createModerationReportReviewedNotification */
      -- Resolver coverage misses this exact catalog partial-index predicate; the source explicitly
      -- orders the catalog (user_id, moderation_report_id) conflict key.
      /* no-mistakes: deadlock-safe */
      INSERT INTO notifications (
        user_id,
        entity_type,
        moderation_report_id,
        delivery_type,
        title,
        body,
        target_intent
      )
      SELECT
        reporter_user_id,
        'moderation_report',
        id,
        'subscription',
        'Your report was reviewed',
        'Thanks for helping keep Voucha safe.',
        'notifications_inbox'
      FROM moderation_reports
      WHERE id = ANY(${reportIds}::uuid[])
        AND reviewed_at IS NOT NULL
        AND resolution_action IS NOT NULL
        AND reporter_user_id IS NOT NULL
      ORDER BY reporter_user_id, id
      ON CONFLICT (user_id, moderation_report_id)
        WHERE (entity_type = 'moderation_report'
          AND moderation_report_id IS NOT NULL
          AND deleted_at IS NULL
          AND delivery_type = 'subscription') DO NOTHING
      RETURNING user_id, id
    `,
    options,
  )

  return rows as Array<{ user_id: string; id: string }>
}
