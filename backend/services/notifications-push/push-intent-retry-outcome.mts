import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { NotificationPushIntent } from './push-intents.mts'

/** Separates intent lease fencing from an endpoint generation replaced while it was in flight. */
export type NotificationPushOutcomePersistence = 'persisted' | 'lease_lost' | 'subscription_stale'

export async function persistRetryableNotificationPushOutcome(
  intent: NotificationPushIntent,
  subscription: { id: string; endpoint: string },
): Promise<NotificationPushOutcomePersistence> {
  const { rows } = await write<{ outcome: NotificationPushOutcomePersistence }>(sql`
    /* persistRetryableNotificationPushOutcome */
    WITH active_claim AS (
      SELECT 1
      FROM notification_push_intents
      WHERE user_id = ${intent.user_id}
        AND notification_id = ${intent.notification_id}
        AND lease_token = ${intent.lease_token}
        AND lease_expires_at > CURRENT_TIMESTAMP
    ), updated AS (
      UPDATE web_push_subscriptions subscription
      SET last_failure_at = CURRENT_TIMESTAMP
      WHERE subscription.user_id = ${intent.user_id}
        AND subscription.id = ${subscription.id}::uuid
        AND subscription.endpoint = ${subscription.endpoint}
        AND subscription.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM active_claim)
        AND EXISTS (
          SELECT 1 FROM web_push_endpoint_owners owner
          WHERE owner.user_id = subscription.user_id
            AND owner.subscription_id = subscription.id
            AND owner.endpoint = subscription.endpoint
        )
      RETURNING subscription.id
    )
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM active_claim) THEN 'lease_lost'
      WHEN NOT EXISTS (SELECT 1 FROM updated) THEN 'subscription_stale'
      ELSE 'persisted'
    END AS outcome
  `)
  return rows[0]?.outcome ?? 'lease_lost'
}
