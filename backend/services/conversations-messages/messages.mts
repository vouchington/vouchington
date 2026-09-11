import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ConversationMessage } from './types.mts'

type SimpleCursor = { id: string }

export async function getConversationMessagesByConversationId(
  conversationId: string,
  options?: { after?: SimpleCursor; limit?: number; probeForNextPage?: boolean },
): Promise<ConversationMessage[]> {
  return fetchConversationMessagesByConversationId(read, conversationId, options)
}

export async function getConversationMessagesByConversationIdForMutation(
  conversationId: string,
  options?: { after?: SimpleCursor; limit?: number; probeForNextPage?: boolean },
): Promise<ConversationMessage[]> {
  return fetchConversationMessagesByConversationId(write, conversationId, options)
}

async function fetchConversationMessagesByConversationId(
  executeQuery: typeof read,
  conversationId: string,
  options?: { after?: SimpleCursor; limit?: number; probeForNextPage?: boolean },
): Promise<ConversationMessage[]> {
  const query = sql`/* getConversationMessagesByConversationId */
    SELECT
      id,
      conversation_id,
      created_at,
      created_by_id,
      updated_at,
      updated_by_id,
      deleted_at,
      deleted_by_id,
      content
    FROM conversation_messages
    WHERE conversation_id = ${conversationId}
      AND deleted_at IS NULL
  `
  if (options?.after) query.append(sql` AND id < ${options.after.id}`)
  query.append(sql` ORDER BY id DESC`)
  if (options?.limit !== undefined) {
    const limit = Math.max(1, Math.min(options.limit, 100))
    query.append(sql` LIMIT ${limit + (options.probeForNextPage ? 1 : 0)}`)
  }

  const { rows } = await executeQuery(query)
  return rows.toReversed()
}
