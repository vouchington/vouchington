import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { NotificationPushIntent } from './push-intents.mts'
import {
  persistRetryableNotificationPushOutcome,
  type NotificationPushOutcomePersistence,
} from './push-intent-retry-outcome.mts'

/** Minimal subscription fields needed for push delivery. */
export type PushSubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

export type NotificationPushEndpointOutcome =
  | { kind: 'delivered'; subscription: PushSubscriptionRow }
  | { kind: 'retryable_failure'; subscription: PushSubscriptionRow }
  | { kind: 'subscription_invalid'; subscription: PushSubscriptionRow }
  | { kind: 'notification_terminal_failure'; subscription: PushSubscriptionRow }

/** Lists deliverable endpoints only while this exact intent lease still owns the work. */
export async function listPendingActivePushSubscriptions(
  intent: NotificationPushIntent,
): Promise<PushSubscriptionRow[]> {
  const now = Date.now()
  const { rows } = await write<PushSubscriptionRow>(sql`
    /* listPendingActivePushSubscriptions */
    WITH active_claim AS MATERIALIZED (
      SELECT 1
      FROM notification_push_intents
      WHERE user_id = ${intent.user_id}
        AND notification_id = ${intent.notification_id}
        AND lease_token = ${intent.lease_token}
        AND lease_expires_at > CURRENT_TIMESTAMP
    ), expired AS (
      UPDATE web_push_subscriptions subscription
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE subscription.user_id = ${intent.user_id}
        AND subscription.deleted_at IS NULL
        AND subscription.expiration_time_milliseconds IS NOT NULL
        AND subscription.expiration_time_milliseconds <= ${now}
        AND EXISTS (SELECT 1 FROM active_claim)
        AND EXISTS (
          SELECT 1 FROM web_push_endpoint_owners owner
          WHERE owner.user_id = subscription.user_id
            AND owner.subscription_id = subscription.id
            AND owner.endpoint = subscription.endpoint
        )
      RETURNING subscription.user_id, subscription.id, subscription.endpoint
    ), expired_owners AS (
      DELETE FROM web_push_endpoint_owners owner
      USING expired
      WHERE owner.user_id = expired.user_id
        AND owner.subscription_id = expired.id
        AND owner.endpoint = expired.endpoint
    )
    SELECT subscription.id, subscription.user_id, subscription.endpoint, subscription.p256dh, subscription.auth
    FROM web_push_subscriptions subscription
    CROSS JOIN active_claim
    INNER JOIN web_push_endpoint_owners owner
      ON owner.user_id = subscription.user_id
      AND owner.subscription_id = subscription.id
      AND owner.endpoint = subscription.endpoint
    LEFT JOIN notification_push_intent_subscription_receipts receipt
      ON receipt.user_id = ${intent.user_id}
      AND receipt.notification_id = ${intent.notification_id}
      AND receipt.subscription_id = subscription.id
    WHERE subscription.user_id = ${intent.user_id}
      AND subscription.deleted_at IS NULL
      AND (subscription.expiration_time_milliseconds IS NULL OR subscription.expiration_time_milliseconds > ${now})
      AND NOT EXISTS (SELECT 1 FROM expired WHERE expired.id = subscription.id)
      AND COALESCE(receipt.status, 'pending') = 'pending'
  `)
  return rows
}

/** Commits delivery outcomes only if the exact lease still owns the intent. */
export async function persistClaimedNotificationPushOutcome(
  intent: NotificationPushIntent,
  outcome: NotificationPushEndpointOutcome,
): Promise<NotificationPushOutcomePersistence> {
  if (outcome.kind === 'retryable_failure')
    return persistRetryableNotificationPushOutcome(intent, outcome.subscription)

  const { id, endpoint } = outcome.subscription
  const isDelivered = outcome.kind === 'delivered'
  const isSubscriptionInvalid = outcome.kind === 'subscription_invalid'
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    outcome: NotificationPushOutcomePersistence
    receipt_written: boolean
  }>(sql`
    /* persistClaimedNotificationPushOutcome */
    WITH active_claim AS MATERIALIZED (
      SELECT 1
      FROM notification_push_intents
      WHERE user_id = ${intent.user_id}
        AND notification_id = ${intent.notification_id}
        AND lease_token = ${intent.lease_token}
        AND lease_expires_at > CURRENT_TIMESTAMP
    ), updated AS (
      UPDATE web_push_subscriptions subscription
      SET last_success_at = CASE WHEN ${isDelivered} THEN CURRENT_TIMESTAMP ELSE subscription.last_success_at END,
          last_failure_at = CASE WHEN ${isDelivered} THEN subscription.last_failure_at ELSE CURRENT_TIMESTAMP END,
          deleted_at = CASE WHEN ${isSubscriptionInvalid} THEN CURRENT_TIMESTAMP ELSE subscription.deleted_at END
      WHERE subscription.user_id = ${intent.user_id}
        AND subscription.id = ${id}::uuid
        AND subscription.endpoint = ${endpoint}
        AND subscription.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM active_claim)
        AND EXISTS (
          SELECT 1 FROM web_push_endpoint_owners owner
          WHERE owner.user_id = subscription.user_id
            AND owner.subscription_id = subscription.id
            AND owner.endpoint = subscription.endpoint
        )
      RETURNING subscription.user_id, subscription.id, subscription.endpoint
    ), receipts AS (
      INSERT INTO notification_push_intent_subscription_receipts (
        user_id, notification_id, subscription_id, endpoint, delivered_at, permanently_failed_at
      )
      SELECT updated.user_id, ${intent.notification_id}::uuid, updated.id, updated.endpoint,
        CASE WHEN ${isDelivered} THEN CURRENT_TIMESTAMP END,
        CASE WHEN NOT ${isDelivered} THEN CURRENT_TIMESTAMP END
      FROM updated
      ON CONFLICT (user_id, notification_id, subscription_id) DO UPDATE
      SET delivered_at = EXCLUDED.delivered_at,
          permanently_failed_at = EXCLUDED.permanently_failed_at
      WHERE notification_push_intent_subscription_receipts.status = 'pending'
      RETURNING user_id, subscription_id, endpoint
    ), removed_invalid_owners AS (
      DELETE FROM web_push_endpoint_owners owner
      USING receipts receipt
      WHERE ${isSubscriptionInvalid}
        AND owner.user_id = receipt.user_id
        AND owner.subscription_id = receipt.subscription_id
        AND owner.endpoint = receipt.endpoint
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM active_claim) THEN 'lease_lost'
      WHEN NOT EXISTS (SELECT 1 FROM updated) THEN 'subscription_stale'
      ELSE 'persisted'
    END AS outcome, EXISTS (SELECT 1 FROM receipts) AS receipt_written
  `)
  // A duplicate terminal receipt leaves the staged subscription change uncommitted.
  if (rows[0]?.receipt_written) await transaction.commit()
  return rows[0]?.outcome ?? 'lease_lost'
}
