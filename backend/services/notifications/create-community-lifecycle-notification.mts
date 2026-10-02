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

export async function createCommunityLifecycleNotification(
  input: {
    userId: string
    communityId: string
    entityType: CommunityLifecycleNotificationType
    eventKey: string
    title: string
    body: string
  },
  options: QueryOptions,
): Promise<{ userId: string; notificationId: string } | null> {
  const { rows } = await write<{ user_id: string; id: string }>(
    sql`/* createCommunityLifecycleNotification */
      INSERT INTO notifications (
        user_id,
        entity_type,
        community_id,
        event_key,
        title,
        body
      ) VALUES (
        ${input.userId},
        ${input.entityType},
        ${input.communityId},
        ${input.eventKey},
        ${truncateText(input.title, 300)},
        ${truncateText(input.body, 1000)}
      )
      ON CONFLICT DO NOTHING
      RETURNING user_id, id
    `,
    options,
  )
  const row = rows[0]
  return row ? { userId: row.user_id, notificationId: row.id } : null
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
