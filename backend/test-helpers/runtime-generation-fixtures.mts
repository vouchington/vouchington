import { write } from './fixture-executor.mts'
import sql from './fixture-sql.mts'

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
