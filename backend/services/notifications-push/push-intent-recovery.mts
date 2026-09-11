import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type NotificationPushIntentRecoveryCursor = {
  updatedAt: string
  userId: string
  notificationId: string
}

export type AvailableNotificationPushIntent = {
  user_id: string
  notification_id: string
  updated_at: string
  scan_before: string
}

export async function listAvailableNotificationPushIntents(
  limit: number,
  page: {
    scanBefore?: string
    after?: NotificationPushIntentRecoveryCursor
  } = {},
): Promise<AvailableNotificationPushIntent[]> {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new TypeError('Push intent limit must be positive')
  const scanBefore = page.scanBefore ?? null
  const afterUpdatedAt = page.after?.updatedAt ?? null
  const afterUserId = page.after?.userId ?? null
  const afterNotificationId = page.after?.notificationId ?? null
  const { rows } = await write<AvailableNotificationPushIntent>(sql`
    /* listAvailableNotificationPushIntents */
    WITH scan AS (
      SELECT COALESCE(${scanBefore}::timestamptz, CURRENT_TIMESTAMP) AS scan_before
    )
    SELECT intent.user_id, intent.notification_id,
      intent.updated_at::text AS updated_at, scan.scan_before::text AS scan_before
    FROM notification_push_intents intent
    CROSS JOIN scan
    WHERE intent.status = 'pending'
      AND (intent.lease_expires_at IS NULL OR intent.lease_expires_at <= CURRENT_TIMESTAMP)
      AND intent.updated_at <= scan.scan_before
      AND (
        ${afterUpdatedAt}::timestamptz IS NULL
        OR (intent.updated_at, intent.user_id, intent.notification_id) >
          (${afterUpdatedAt}::timestamptz, ${afterUserId}::uuid, ${afterNotificationId}::uuid)
      )
    ORDER BY intent.updated_at, intent.user_id, intent.notification_id
    LIMIT ${limit}
  `)
  return rows
}
