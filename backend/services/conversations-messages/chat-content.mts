import sql from 'sql-template-strings'
import type { ConversationMessageContent } from './types.mts'

export class InvalidConversationMessageContentError extends Error {
  constructor() {
    super('Chat message content is invalid')
  }
}

type AppendableSql = {
  append: (statement: ReturnType<typeof sql>) => unknown
}

/**
 * Validates the `{ role, content, error }` chat envelope before it is written to
 * `conversation_messages.content` and returns its canonical JSON form (no `error` key unless the
 * turn failed).
 */
export function parseConversationMessageContent(content: unknown): ConversationMessageContent {
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
    return { role: 'user', content: message.content }
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
      content: message.content as string | null,
      ...(typeof message.error === 'string' ? { error: message.error } : {}),
    }
  }
  throw new InvalidConversationMessageContentError()
}

/** Appends the public message columns to an `INSERT ... RETURNING` statement. */
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
    content
  `)
}
