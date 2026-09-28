import sql from 'sql-template-strings'
export class InvalidConversationMessageContentError extends Error {
  constructor() {
    super('Stored chat message content is invalid')
  }
}

export type ConversationMessageChatColumns = {
  role: 'user' | 'assistant'
  text: string | null
  error: string | null
}

type AppendableSql = {
  append: (statement: ReturnType<typeof sql>) => unknown
}

export function conversationMessageColumns(content: unknown): ConversationMessageChatColumns {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) {
    throw new InvalidConversationMessageContentError()
  }
  const message = content as Record<string, unknown>
  const keys = Object.keys(message)
  if (message.role === 'user') {
    if (
      !keys.every(key => key === 'role' || key === 'content') ||
      typeof message.content !== 'string'
    ) {
      throw new InvalidConversationMessageContentError()
    }
    return { role: 'user', text: message.content, error: null }
  }
  if (message.role === 'assistant') {
    if (
      !keys.every(key => key === 'role' || key === 'content' || key === 'error') ||
      (message.content !== null && typeof message.content !== 'string') ||
      ('error' in message && message.error != null && typeof message.error !== 'string')
    ) {
      throw new InvalidConversationMessageContentError()
    }
    return {
      role: 'assistant',
      text: message.content as string | null,
      error: typeof message.error === 'string' ? message.error : null,
    }
  }
  throw new InvalidConversationMessageContentError()
}

/** Public message envelope derived from typed chat columns. Not a stored document. */
export function appendConversationMessageContent(query: AppendableSql): void {
  query.append(sql`CASE
    WHEN chat_role IS NULL THEN NULL
    ELSE jsonb_build_object('role', chat_role, 'content', chat_text)
      || CASE
        WHEN chat_error IS NULL THEN '{}'::jsonb
        ELSE jsonb_build_object('error', chat_error)
      END
  END AS content`)
}

export function appendConversationMessageReturning(query: AppendableSql): void {
  query.append(sql`
    id,
    conversation_id,
    created_at,
    created_by_id,
    updated_at,
    updated_by_id,
    deleted_at,
    deleted_by_id,
  `)
  appendConversationMessageContent(query)
}
