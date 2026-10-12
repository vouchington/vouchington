import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function createModmailNotification(
  userId: string,
  conversationId: string,
  targetPath: string,
): Promise<Array<{ user_id: string; id: string }>> {
  return createModmailNotifications([userId], conversationId, targetPath)
}

/** Upsert one modmail notification per distinct recipient in one statement. */
export async function createModmailNotifications(
  userIds: string[],
  conversationId: string,
  targetPath: string,
): Promise<Array<{ user_id: string; id: string }>> {
  if (userIds.length === 0) return []
  const { rows } = await write(sql`/* createModmailNotifications */
    INSERT INTO notifications (
      user_id,
      entity_type,
      conversation_id,
      delivery_type,
      title,
      body,
      target_path
    )
    SELECT DISTINCT recipient.user_id, 'modmail'::notification_entity_types,
      ${conversationId}::uuid, 'subscription'::notification_delivery_types,
      'New modmail message', '', ${targetPath}
    FROM unnest(${userIds}::uuid[]) AS recipient(user_id)
    ORDER BY recipient.user_id ASC NULLS LAST
    ON CONFLICT (user_id, conversation_id, entity_type)
      WHERE conversation_id IS NOT NULL AND deleted_at IS NULL
    DO UPDATE SET
      id = uuidv7(),
      deleted_at = NULL,
      read_at = NULL,
      pushed_at = NULL,
      target_path = EXCLUDED.target_path
    RETURNING user_id, id
  `)

  return rows as Array<{ user_id: string; id: string }>
}
