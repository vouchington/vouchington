import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { truncateText } from './shared.mts'
import { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'
import onError from '@modules/on-error'

type CommunityLifecycleNotificationType =
  | 'community_application_decision'
  | 'community_role_change'
  | 'community_ownership_transfer'

type CommunityLifecycleNotificationInput = {
  userId: string
  communityId: string
  entityType: CommunityLifecycleNotificationType
  eventKey: string
  title: string
  body: string
}

/**
 * Inserts every notification in one statement. Returns only the rows this call created, in no
 * particular order; an event key that already exists for the user yields nothing.
 */
export async function createCommunityLifecycleNotifications(
  inputs: CommunityLifecycleNotificationInput[],
  options: QueryOptions,
): Promise<Array<{ userId: string; notificationId: string }>> {
  const { rows } = await write<{ user_id: string; id: string }>(
    sql`/* createCommunityLifecycleNotifications */
      INSERT INTO notifications (
        user_id,
        entity_type,
        community_id,
        event_key,
        title,
        body
      )
      SELECT user_id, entity_type, community_id, event_key, title, body
      FROM UNNEST(
        ${inputs.map(input => input.userId)}::uuid[],
        ${inputs.map(input => input.entityType)}::notification_entity_types[],
        ${inputs.map(input => input.communityId)}::uuid[],
        ${inputs.map(input => input.eventKey)}::text[],
        ${inputs.map(input => truncateText(input.title, 300))}::text[],
        ${inputs.map(input => truncateText(input.body, 1000))}::text[]
      ) AS t(user_id, entity_type, community_id, event_key, title, body)
      ON CONFLICT DO NOTHING
      RETURNING user_id, id
    `,
    options,
  )
  return rows.map(row => ({ userId: row.user_id, notificationId: row.id }))
}

export async function enqueueCommunityLifecycleNotificationPush(
  notifications: Array<{ userId: string; notificationId: string }>,
  enqueuePush: typeof enqueueBulkDeliverNotificationPushIntents = enqueueBulkDeliverNotificationPushIntents,
): Promise<void> {
  if (notifications.length === 0) return
  try {
    await enqueuePush(notifications)
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}
