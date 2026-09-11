import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function createDirectMessageNotification(
  userId: string,
  conversationId: string,
): Promise<Array<{ user_id: string; id: string }>> {
  const { rows } = await write(sql`/* createDirectMessageNotification */
    INSERT INTO notifications (
      user_id,
      entity_type,
      conversation_id,
      delivery_type,
      title,
      body,
      target_path
    )
    VALUES (
      ${userId},
      'direct_message',
      ${conversationId},
      'subscription',
      'New direct message',
      '',
      ${`/messages/${conversationId}`}
    )
    ON CONFLICT (user_id, conversation_id, entity_type)
      WHERE conversation_id IS NOT NULL AND deleted_at IS NULL
    DO UPDATE SET
      id = uuidv7(),
      deleted_at = NULL,
      read_at = NULL,
      pushed_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    RETURNING user_id, id
  `)

  return rows as Array<{ user_id: string; id: string }>
}
