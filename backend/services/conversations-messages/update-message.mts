import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { conversationMessageColumns } from './chat-content.mts'
import type { ConversationMessageContent } from './types.mts'

export async function updateConversationMessageContent(
  conversationId: string,
  messageId: string,
  content: ConversationMessageContent,
): Promise<void> {
  const columns = conversationMessageColumns(content)
  await write(sql`/* updateConversationMessageContent */
    UPDATE conversation_messages
    SET chat_role = ${columns.role},
      chat_text = ${columns.text},
      chat_error = ${columns.error}
    WHERE conversation_id = ${conversationId}
      AND id = ${messageId}
  `)
}
