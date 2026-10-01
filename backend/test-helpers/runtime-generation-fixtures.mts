import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function softDeleteTestConversationMessage(
  conversationMessageId: string,
  deletedById: string,
): Promise<void> {
  await write(sql`/* softDeleteTestConversationMessage */
    UPDATE conversation_messages
    SET deleted_at = NOW(), deleted_by_id = ${deletedById}
    WHERE id = ${conversationMessageId}
      AND deleted_at IS NULL
  `)
}
