import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  appendConversationMessageReturning,
  parseConversationMessageContent,
} from './chat-content.mts'
import type { Conversation, ConversationMessage } from './types.mts'

export async function createConversation(createdById: string, title = ''): Promise<Conversation> {
  const { rows } = await write<Conversation>(sql`/* createConversation */
      INSERT INTO conversations (created_by_id, title)
      VALUES (${createdById}, ${title})
      RETURNING *
    `)
  return rows[0]!
}

export async function createConversationMessage(
  conversationId: string,
  createdById: string,
  content: unknown,
): Promise<ConversationMessage> {
  const envelope = parseConversationMessageContent(content)
  const query = sql`/* createConversationMessage */
    INSERT INTO conversation_messages (conversation_id, created_by_id, content)
    VALUES (${conversationId}, ${createdById}, ${JSON.stringify(envelope)})
    RETURNING
  `
  appendConversationMessageReturning(query)
  const { rows } = await write<ConversationMessage>(query)
  return rows[0]!
}
