import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function createModmailNotification(
  userId: string,
  conversationId: string,
  targetPath: string,
): Promise<Array<{ user_id: string; id: string }>> {
  const { rows } = await write(sql`/* createModmailNotification */
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
      'modmail',
      ${conversationId},
      'subscription',
      'New modmail message',
      '',
      ${targetPath}
    )
    ON CONFLICT (user_id, conversation_id, entity_type)
      WHERE conversation_id IS NOT NULL AND deleted_at IS NULL
    DO UPDATE SET
      id = uuidv7(),
      deleted_at = NULL,
      read_at = NULL,
      pushed_at = NULL,
      updated_at = CURRENT_TIMESTAMP,
      target_path = EXCLUDED.target_path
    RETURNING user_id, id
  `)

  return rows as Array<{ user_id: string; id: string }>
}
