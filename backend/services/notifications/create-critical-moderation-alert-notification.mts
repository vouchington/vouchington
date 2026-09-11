import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'

const ALERT_ROLES = ['administrator', 'customer_support', 'moderator']

export async function createCriticalModerationAlertNotification(reportId: string): Promise<void> {
  const { rows } = await write<{
    user_id: string
    id: string
  }>(sql`/* createCriticalModerationAlertNotification */
    WITH role_recipients AS (
      SELECT ur.user_id
      FROM user_roles ur
      JOIN user_roles_types urt ON urt.id = ur.role_type_id
      JOIN users u ON u.id = ur.user_id
      WHERE urt.slug = ANY(${ALERT_ROLES}::text[])
        AND u.deleted_at IS NULL
      -- The FK check re-reads users during INSERT; keep live recipients from being hard-deleted between selection and insert.
      ORDER BY ur.user_id
      FOR KEY SHARE OF u
    ),
    recipients AS (
      SELECT DISTINCT user_id
      FROM role_recipients
    )
    -- the FK-protecting FOR KEY SHARE CTE is outside parser coverage; this source explicitly
    -- orders the catalog (user_id, moderation_report_id) conflict key.
    /* no-mistakes: deadlock-safe */
    INSERT INTO notifications (user_id, entity_type, moderation_report_id, delivery_type, title, body, target_path)
    SELECT
      recipients.user_id,
      'critical_moderation_alert',
      ${reportId}::uuid,
      'subscription',
      'Critical moderation alert',
      'A report requiring urgent review has been filed.',
      '/reports'
    FROM recipients
    ORDER BY recipients.user_id
    ON CONFLICT (user_id, moderation_report_id)
      WHERE entity_type = 'critical_moderation_alert'::notification_entity_types
        AND moderation_report_id IS NOT NULL
        AND deleted_at IS NULL
        AND delivery_type = 'subscription'::notification_delivery_types DO NOTHING
    RETURNING user_id, id
  `)

  if (rows.length > 0) {
    await enqueueBulkDeliverNotificationPushIntents(
      rows.map(r => ({ userId: r.user_id, notificationId: r.id })),
    )
  }
}
