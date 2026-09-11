import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { NotificationPushIntent } from './push-intents.mts'

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

/** Separates intent lease fencing from an endpoint generation replaced while it was in flight. */
export type NotificationPushOutcomePersistence = 'persisted' | 'lease_lost' | 'subscription_stale'

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
      FOR UPDATE
    ), expired_owner AS (
      DELETE FROM web_push_endpoint_owners owner
      USING web_push_subscriptions subscription, active_claim
      WHERE subscription.user_id = ${intent.user_id}
        AND subscription.deleted_at IS NULL
        AND subscription.expiration_time_ms IS NOT NULL
        AND subscription.expiration_time_ms <= ${now}
        AND owner.user_id = subscription.user_id
        AND owner.subscription_id = subscription.id
      RETURNING owner.user_id, owner.subscription_id, owner.endpoint
    ), expired AS (
      UPDATE web_push_subscriptions subscription
      SET deleted_at = CURRENT_TIMESTAMP
      FROM expired_owner owner
      WHERE subscription.user_id = owner.user_id
        AND subscription.id = owner.subscription_id
        AND subscription.endpoint = owner.endpoint
      RETURNING subscription.id
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
      AND (subscription.expiration_time_ms IS NULL OR subscription.expiration_time_ms > ${now})
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
  const { id, endpoint } = outcome.subscription
  const isDelivered = outcome.kind === 'delivered'
  const isRetryableFailure = outcome.kind === 'retryable_failure'
  const isSubscriptionInvalid = outcome.kind === 'subscription_invalid'
  const terminalStatus = isDelivered
    ? 'delivered'
    : isRetryableFailure
      ? 'pending'
      : 'permanently_failed'
  const { rows } = await write<{ outcome: NotificationPushOutcomePersistence }>(sql`
    /* persistClaimedNotificationPushOutcome */
    WITH active_claim AS MATERIALIZED (
      SELECT 1
      FROM notification_push_intents
      WHERE user_id = ${intent.user_id}
        AND notification_id = ${intent.notification_id}
        AND lease_token = ${intent.lease_token}
        AND lease_expires_at > CURRENT_TIMESTAMP
      FOR UPDATE
    ), owned_subscription AS MATERIALIZED (
      SELECT subscription.id
      FROM web_push_subscriptions subscription
      INNER JOIN web_push_endpoint_owners owner
        ON owner.user_id = subscription.user_id
        AND owner.subscription_id = subscription.id
        AND owner.endpoint = subscription.endpoint
      CROSS JOIN active_claim
      WHERE subscription.user_id = ${intent.user_id}
        AND subscription.id = ${id}::uuid
        AND subscription.endpoint = ${endpoint}
        AND subscription.deleted_at IS NULL
      FOR UPDATE OF owner
    ), terminal_input AS (
      SELECT ${endpoint}::text AS endpoint,
        ${terminalStatus}::notification_push_endpoint_status AS status
      WHERE NOT ${isRetryableFailure}
    ), receipts AS (
      INSERT INTO notification_push_intent_subscription_receipts (
        user_id, notification_id, subscription_id, endpoint, status, delivered_at, permanently_failed_at
      )
      SELECT ${intent.user_id}::uuid AS user_id,
        ${intent.notification_id}::uuid AS notification_id,
        ${id}::uuid AS subscription_id,
        input.endpoint,
        input.status,
        CASE WHEN input.status = 'delivered' THEN CURRENT_TIMESTAMP END,
        CASE WHEN input.status = 'permanently_failed' THEN CURRENT_TIMESTAMP END
      FROM terminal_input input
      CROSS JOIN owned_subscription
      ORDER BY user_id ASC NULLS LAST,
        notification_id ASC NULLS LAST,
        subscription_id ASC NULLS LAST
      ON CONFLICT (user_id, notification_id, subscription_id) DO UPDATE
      SET status = EXCLUDED.status,
          delivered_at = EXCLUDED.delivered_at,
          permanently_failed_at = EXCLUDED.permanently_failed_at
      WHERE notification_push_intent_subscription_receipts.status = 'pending'
      RETURNING endpoint, subscription_id, status
    ), invalid_receipts AS (
      SELECT receipt.subscription_id
      FROM receipts receipt
      WHERE receipt.status = 'permanently_failed'
        AND ${isSubscriptionInvalid}
    ), removed_invalid_owners AS (
      DELETE FROM web_push_endpoint_owners owner
      USING invalid_receipts receipt, owned_subscription owned
      WHERE owner.user_id = ${intent.user_id}
        AND owner.subscription_id = receipt.subscription_id
        AND owner.subscription_id = owned.id
        AND owner.endpoint = ${endpoint}
      RETURNING owner.subscription_id
    ), subscription_results AS (
      UPDATE web_push_subscriptions subscription
      SET last_success_at = CASE
            WHEN subscription.id IN (SELECT subscription_id FROM receipts WHERE status = 'delivered') THEN CURRENT_TIMESTAMP
            ELSE subscription.last_success_at
          END,
          last_failure_at = CASE
            WHEN (${isRetryableFailure} AND subscription.id = ${id}::uuid)
              OR subscription.id IN (SELECT subscription_id FROM receipts WHERE status = 'permanently_failed') THEN CURRENT_TIMESTAMP
            ELSE subscription.last_failure_at
          END,
          deleted_at = CASE
            WHEN subscription.id IN (SELECT subscription_id FROM invalid_receipts) THEN CURRENT_TIMESTAMP
            ELSE subscription.deleted_at
          END
      FROM owned_subscription owned
      WHERE subscription.user_id = ${intent.user_id}
        AND subscription.id = owned.id
        AND subscription.endpoint = ${endpoint}
        AND (
          (${isDelivered} AND subscription.id = ${id}::uuid)
          OR (${isRetryableFailure} AND subscription.id = ${id}::uuid)
          OR subscription.id IN (SELECT subscription_id FROM receipts WHERE status = 'permanently_failed')
        )
        AND (
          subscription.id IN (SELECT subscription_id FROM removed_invalid_owners)
          OR EXISTS (
            SELECT 1 FROM web_push_endpoint_owners owner
            WHERE owner.user_id = subscription.user_id
              AND owner.subscription_id = subscription.id
              AND owner.endpoint = subscription.endpoint
          )
        )
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM active_claim) THEN 'lease_lost'
      WHEN NOT EXISTS (SELECT 1 FROM owned_subscription) THEN 'subscription_stale'
      ELSE 'persisted'
    END AS outcome
  `)
  return rows[0]?.outcome ?? 'lease_lost'
}
