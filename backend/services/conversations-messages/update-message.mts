import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { parseConversationMessageContent } from './chat-content.mts'
import type { ConversationMessageContent } from './types.mts'

/**
 * @public Retained provisionally under issue #1360 and documented in
 * `docs/overview/architecture/services/conversations-messages/README.md`; production use is
 * unconfirmed and this export may be removed after intended-use review.
 */
export async function updateConversationMessageContent(
  conversationId: string,
  messageId: string,
  content: ConversationMessageContent,
): Promise<void> {
  const envelope = parseConversationMessageContent(content)
  await write(sql`/* updateConversationMessageContent */
    UPDATE conversation_messages
    SET content = ${JSON.stringify(envelope)}
    WHERE conversation_id = ${conversationId}
      AND id = ${messageId}
  `)
}
