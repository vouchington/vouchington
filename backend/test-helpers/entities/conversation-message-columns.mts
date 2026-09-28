import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type CreateTestConversationMessageOptions = {
  conversationId: string
  createdById: string
  content: unknown
}

export async function createTestConversationMessage(options: CreateTestConversationMessageOptions) {
  const columns = testChatColumns(options.content)
  const { rows } = await write(sql`
    INSERT INTO conversation_messages (
      conversation_id, created_by_id, chat_role, chat_text, chat_error
    )
    VALUES (
      ${options.conversationId},
      ${options.createdById},
      ${columns.role},
      ${columns.text},
      ${columns.error}
    )
    RETURNING id
  `)
  return { id: rows[0].id as string }
}

function testChatColumns(content: unknown): {
  role: 'user' | 'assistant'
  text: string | null
  error: string | null
} {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) {
    throw new Error('conversation message content must be a chat envelope')
  }
  const message = content as Record<string, unknown>
  if (
    (message.role !== 'user' && message.role !== 'assistant') ||
    (message.content !== null && typeof message.content !== 'string') ||
    (message.error != null && typeof message.error !== 'string') ||
    (message.role === 'user' && typeof message.content !== 'string')
  ) {
    throw new Error('conversation message content must be a chat envelope')
  }
  return {
    role: message.role,
    text: message.content as string | null,
    error: typeof message.error === 'string' ? message.error : null,
  }
}
