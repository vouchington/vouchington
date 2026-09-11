import { write, type QueryOptions } from '@data-stores/psql'
import { ensureNotificationPushIntents, type NotificationPushInput } from '@services/notifications'
import sql from 'sql-template-strings'

export type NotificationPushIntent = {
  user_id: string
  notification_id: string
  lease_token: string
}

/** Ensures replayed pre-capture notifications enter the durable delivery path. */
export async function createNotificationPushIntents(
  notifications: NotificationPushInput[],
  options: QueryOptions = {},
): Promise<number> {
  return ensureNotificationPushIntents(notifications, options)
}

export async function claimNotificationPushIntent(
  intent: Pick<NotificationPushIntent, 'user_id' | 'notification_id'>,
  leaseSeconds: number,
): Promise<NotificationPushIntent | undefined> {
  const { rows } = await write<NotificationPushIntent & { claimed: boolean }>(sql`
    /* claimNotificationPushIntent */
    WITH notification_state AS MATERIALIZED (
      SELECT notification.deleted_at, notification.pushed_at,
        push_intent.lease_token AS previous_lease_token
      FROM notifications notification
      JOIN notification_push_intents push_intent
        ON push_intent.user_id = notification.user_id
        AND push_intent.notification_id = notification.id
      WHERE notification.user_id = ${intent.user_id}
        AND notification.id = ${intent.notification_id}
        AND push_intent.status = 'pending'
        AND (push_intent.lease_expires_at IS NULL OR push_intent.lease_expires_at <= CURRENT_TIMESTAMP)
      FOR UPDATE OF notification
    ), claimed_notification AS (
      UPDATE notifications notification
      SET pushed_at = COALESCE(notification.pushed_at, CURRENT_TIMESTAMP)
      FROM notification_state
      WHERE notification.user_id = ${intent.user_id}
        AND notification.id = ${intent.notification_id}
        AND notification_state.deleted_at IS NULL
        AND (
          notification_state.pushed_at IS NULL
          OR notification_state.previous_lease_token IS NOT NULL
        )
      RETURNING 1
    )
    UPDATE notification_push_intents push_intent
    SET status = (CASE
          WHEN EXISTS (SELECT 1 FROM claimed_notification) THEN 'pending'
          WHEN notification_state.deleted_at IS NOT NULL THEN 'suppressed'
          ELSE 'delivered'
        END)::notification_push_intent_status,
        lease_token = CASE
          WHEN EXISTS (SELECT 1 FROM claimed_notification) THEN uuidv7()
        END,
        leased_at = CASE
          WHEN EXISTS (SELECT 1 FROM claimed_notification) THEN CURRENT_TIMESTAMP
        END,
        lease_expires_at = CASE
          WHEN EXISTS (SELECT 1 FROM claimed_notification)
            THEN CURRENT_TIMESTAMP + (${leaseSeconds}::integer * INTERVAL '1 second')
        END,
        suppressed_at = CASE
          WHEN notification_state.deleted_at IS NOT NULL THEN CURRENT_TIMESTAMP
        END,
        delivered_at = CASE
          WHEN notification_state.deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM claimed_notification)
            THEN CURRENT_TIMESTAMP
        END
    FROM notification_state
    WHERE push_intent.user_id = ${intent.user_id}
      AND push_intent.notification_id = ${intent.notification_id}
      AND push_intent.status = 'pending'
      AND (push_intent.lease_expires_at IS NULL OR push_intent.lease_expires_at <= CURRENT_TIMESTAMP)
    RETURNING push_intent.user_id, push_intent.notification_id, push_intent.lease_token,
      EXISTS (SELECT 1 FROM claimed_notification) AS claimed
  `)
  return rows[0]?.claimed ? rows[0] : undefined
}

/** Extends only a still-current pending claim; an expired token can never be resurrected. */
export async function renewNotificationPushIntentLease(
  intent: NotificationPushIntent,
  leaseSeconds: number,
): Promise<boolean> {
  const { rowCount } = await write(sql`/* renewNotificationPushIntentLease */
    UPDATE notification_push_intents
    SET lease_expires_at = CURRENT_TIMESTAMP + (${leaseSeconds}::integer * INTERVAL '1 second')
    WHERE user_id = ${intent.user_id} AND notification_id = ${intent.notification_id}
      AND status = 'pending' AND lease_token = ${intent.lease_token}
      AND lease_expires_at > CURRENT_TIMESTAMP
  `)
  return rowCount === 1
}

export async function markNotificationPushIntentSuppressed(
  intent: NotificationPushIntent,
): Promise<boolean> {
  const { rowCount } = await write(sql`/* markNotificationPushIntentSuppressed */
    UPDATE notification_push_intents
    SET status = 'suppressed', suppressed_at = CURRENT_TIMESTAMP,
        lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
    WHERE user_id = ${intent.user_id} AND notification_id = ${intent.notification_id}
      AND lease_token = ${intent.lease_token} AND lease_expires_at > CURRENT_TIMESTAMP
  `)
  return rowCount === 1
}

export async function markNotificationPushIntentDelivered(
  intent: NotificationPushIntent,
): Promise<boolean> {
  const { rows } = await write<{ completed: boolean }>(sql`/* markNotificationPushIntentDelivered */
    WITH notification_lock AS MATERIALIZED (
      SELECT 1
      FROM notifications notification
      JOIN notification_push_intents push_intent
        ON push_intent.user_id = notification.user_id
        AND push_intent.notification_id = notification.id
      WHERE push_intent.user_id = ${intent.user_id}
        AND push_intent.notification_id = ${intent.notification_id}
        AND push_intent.lease_token = ${intent.lease_token}
        AND push_intent.lease_expires_at > CURRENT_TIMESTAMP
      FOR UPDATE OF notification
    ), completed AS (
      UPDATE notification_push_intents
      SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP,
          lease_token = NULL, leased_at = NULL, lease_expires_at = NULL
      FROM notification_lock
      WHERE user_id = ${intent.user_id} AND notification_id = ${intent.notification_id}
        AND lease_token = ${intent.lease_token} AND lease_expires_at > CURRENT_TIMESTAMP
      RETURNING user_id, notification_id
    ), pushed AS (
      UPDATE notifications notification
      SET pushed_at = COALESCE(notification.pushed_at, CURRENT_TIMESTAMP)
      FROM completed
      WHERE notification.user_id = completed.user_id
        AND notification.id = completed.notification_id
    )
    SELECT EXISTS (SELECT 1 FROM completed) AS completed
  `)
  return rows[0]?.completed ?? false
}

export async function releaseNotificationPushIntent(
  intent: NotificationPushIntent,
): Promise<boolean> {
  const { rowCount } = await write(sql`/* releaseNotificationPushIntent */
    UPDATE notification_push_intents
    SET lease_expires_at = CURRENT_TIMESTAMP
    WHERE user_id = ${intent.user_id} AND notification_id = ${intent.notification_id}
      AND lease_token = ${intent.lease_token} AND lease_expires_at > CURRENT_TIMESTAMP
  `)
  return rowCount === 1
}
