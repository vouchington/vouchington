import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ConversationMessageContent } from './types.mts'

export async function updateConversationMessageContent(
  conversationId: string,
  messageId: string,
  content: ConversationMessageContent,
): Promise<void> {
  await write(sql`/* updateConversationMessageContent */
    UPDATE conversation_messages
    SET content = ${JSON.stringify(content)}
    WHERE conversation_id = ${conversationId}
      AND id = ${messageId}
  `)
}
