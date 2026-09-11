import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { Conversation } from './types.mts'

type SimpleCursor = { id: string }

export async function getConversationById(id: string): Promise<Conversation | null> {
  return fetchConversationById(read, id)
}

export async function getConversationByIdForMutation(id: string): Promise<Conversation | null> {
  return fetchConversationById(write, id)
}

async function fetchConversationById(query: typeof read, id: string): Promise<Conversation | null> {
  const { rows } = await query(sql`/* fetchConversationById */
    SELECT
      id,
      channel_type,
      title,
      created_at,
      created_by_id,
      updated_at,
      updated_by_id,
      deleted_at,
      deleted_by_id,
      last_response_id
    FROM conversations
    WHERE id = ${id}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  return rows[0] || null
}

export async function getConversationByCreatedByAndTitle(
  createdById: string,
  title: string,
): Promise<Conversation | null> {
  const { rows } = await read(sql`/* getConversationByCreatedByAndTitle */
    SELECT
      id,
      title,
      created_at,
      created_by_id,
      updated_at,
      updated_by_id,
      deleted_at,
      deleted_by_id,
      last_response_id
    FROM conversations
    WHERE created_by_id = ${createdById}
      AND title = ${title}
      AND deleted_at IS NULL
    ORDER BY id DESC
    LIMIT 1
  `)
  return rows[0] || null
}

export async function getConversationsByCreatedById(
  createdById: string,
  options?: {
    limit?: number
    after?: SimpleCursor
  },
): Promise<Conversation[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 100))
  const query = sql`/* getConversationsByCreatedById */
    SELECT
      id,
      title,
      created_at,
      created_by_id,
      updated_at,
      updated_by_id,
      deleted_at,
      deleted_by_id,
      last_response_id
    FROM conversations
    WHERE created_by_id = ${createdById}
      AND channel_type = 'chat'
      AND deleted_at IS NULL
  `
  if (options?.after) {
    query.append(sql` AND id < ${options.after.id}`)
  }
  query.append(sql`
    ORDER BY id DESC
    LIMIT ${limit + 1}
  `)

  const { rows } = await read(query)
  return rows
}

export async function updateConversationTitle(
  conversationId: string,
  title: string,
  updatedById: string,
): Promise<void> {
  await write(sql`/* updateConversationTitle */
    UPDATE conversations
    SET title = ${title},
        updated_at = CURRENT_TIMESTAMP,
        updated_by_id = ${updatedById}
    WHERE id = ${conversationId}
      AND deleted_at IS NULL
  `)
}

export async function softDeleteConversation(
  conversationId: string,
  deletedById: string,
): Promise<void> {
  await write(sql`/* softDeleteConversation */
    UPDATE conversations
    SET deleted_at = CURRENT_TIMESTAMP,
        deleted_by_id = ${deletedById}
    WHERE id = ${conversationId}
      AND deleted_at IS NULL
  `)
}

export async function updateConversationLastResponseId(
  conversationId: string,
  lastResponseId: string | null,
): Promise<void> {
  await write(sql`/* updateConversationLastResponseId */
    UPDATE conversations
    SET last_response_id = ${lastResponseId}
    WHERE id = ${conversationId}
  `)
}

export async function clearConversationLastResponseIdIfMatches(
  conversationId: string,
  expectedLastResponseId: string,
): Promise<boolean> {
  const { rowCount } = await write(sql`/* clearConversationLastResponseIdIfMatches */
    UPDATE conversations
    SET last_response_id = NULL
    WHERE id = ${conversationId}
      AND last_response_id = ${expectedLastResponseId}
      AND deleted_at IS NULL
    RETURNING id
  `)
  return rowCount === 1
}

export async function getConversationByIdForAgent(
  id: string,
  systemUserId: string,
): Promise<Conversation | null> {
  const { rows } = await read(sql`/* getConversationByIdForAgent */
    SELECT
      c.id,
      c.channel_type,
      c.title,
      c.created_at,
      c.created_by_id,
      c.updated_at,
      c.updated_by_id,
      c.deleted_at,
      c.deleted_by_id,
      c.last_response_id
    FROM conversations c
    JOIN conversation_messages cm
      ON cm.conversation_id = c.id
      AND cm.created_by_id = ${systemUserId}
      AND cm.deleted_at IS NULL
    WHERE c.id = ${id}
      AND c.deleted_at IS NULL
    LIMIT 1
  `)
  return rows[0] || null
}
