import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'
import onError from '@modules/on-error'

const ENTITY_TYPE_BY_KIND = {
  community_application_approved: 'community_application_decision',
  community_application_rejected: 'community_application_decision',
  community_role_changed: 'community_role_change',
  community_ownership_received: 'community_ownership_transfer',
  community_ownership_transferred_away: 'community_ownership_transfer',
} as const

type CommunityLifecycleNotificationKind = keyof typeof ENTITY_TYPE_BY_KIND

type CommunityLifecycleNotificationInput = {
  userId: string
  communityId: string
  kind: CommunityLifecycleNotificationKind
  eventKey: string
  /** Set for the two application decision kinds; its reason is hydrated when read. */
  applicationId?: string
  params?: Record<string, string | number>
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
        kind,
        community_id,
        community_application_id,
        event_key,
        params
      )
      SELECT user_id, entity_type, kind, community_id, community_application_id, event_key,
        params::jsonb
      FROM UNNEST(
        ${inputs.map(input => input.userId)}::uuid[],
        ${inputs.map(input => ENTITY_TYPE_BY_KIND[input.kind])}::notification_entity_types[],
        ${inputs.map(input => input.kind)}::notification_kinds[],
        ${inputs.map(input => input.communityId)}::uuid[],
        ${inputs.map(input => input.applicationId ?? null)}::uuid[],
        ${inputs.map(input => input.eventKey)}::text[],
        ${inputs.map(input => JSON.stringify(input.params ?? {}))}::text[]
      ) AS t(user_id, entity_type, kind, community_id, community_application_id, event_key, params)
      ORDER BY user_id ASC, event_key ASC
      ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING
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
