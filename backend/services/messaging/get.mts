import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { DirectConversation, ConversationParticipant, DirectMessage } from './types.mts'

type SimpleCursor = { id: string }
type TimestampCursor = { timestamp: string; id: string }

export async function getMyDirectConversations(
  currentUserId: string,
  options?: { after?: TimestampCursor; limit?: number },
): Promise<Array<DirectConversation & { cursor_timestamp: string }>> {
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 100))
  const query = sql`/* getMyDirectConversations */
    SELECT c.id, c.channel_type, c.title, c.created_at, c.created_by_id, c.updated_at,
      c.participant_add_policy,
      to_char(c.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_timestamp,
      ARRAY(
        SELECT u.username
        FROM conversation_participants cp2
        JOIN users u ON u.id = cp2.user_id
        WHERE cp2.conversation_id = c.id AND cp2.removed_at IS NULL AND cp2.user_id != ${currentUserId}
      ) AS participant_usernames
    FROM conversations c
    WHERE c.channel_type = 'direct_message'
      AND c.deleted_at IS NULL
      AND (
        SELECT cp.user_id
        FROM conversation_participants cp
        WHERE cp.conversation_id = c.id
          AND cp.user_id = ${currentUserId}
          AND cp.removed_at IS NULL
      ) = ${currentUserId}
  `
  if (options?.after) {
    query.append(
      sql` AND (c.updated_at, c.id) < (${options.after.timestamp}::timestamptz, ${options.after.id})`,
    )
  }
  query.append(sql` ORDER BY c.updated_at DESC, c.id DESC LIMIT ${limit + 1}`)

  const { rows } = await read(query)
  return rows as Array<DirectConversation & { cursor_timestamp: string }>
}

export async function getConversationMessages(
  conversationId: string,
  options?: { after?: SimpleCursor; limit?: number },
): Promise<DirectMessage[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 100))

  // Both paths return newest `limit` rows in chronological order via a subquery.
  // With a cursor, load older messages (id < cursor); without, load the most recent page.
  let query
  if (options?.after) {
    query = sql`/* getConversationMessages */
      SELECT m.id, m.conversation_id, m.body_text, m.created_by_id, u.username AS sender_username,
             m.created_at, m.updated_at, m.deleted_at
      FROM (
        SELECT id, conversation_id, body_text, created_by_id, created_at, updated_at, deleted_at
        FROM conversation_messages
        WHERE conversation_id = ${conversationId}
          AND kind = 'message'
          AND deleted_at IS NULL
          AND id < ${options.after.id}
        ORDER BY id DESC LIMIT ${limit + 1}
      ) m
      LEFT JOIN users u ON u.id = m.created_by_id
      ORDER BY m.id ASC`
  } else {
    query = sql`/* getConversationMessages */
      SELECT m.id, m.conversation_id, m.body_text, m.created_by_id, u.username AS sender_username,
             m.created_at, m.updated_at, m.deleted_at
      FROM (
        SELECT id, conversation_id, body_text, created_by_id, created_at, updated_at, deleted_at
        FROM conversation_messages
        WHERE conversation_id = ${conversationId}
          AND kind = 'message'
          AND deleted_at IS NULL
        ORDER BY id DESC LIMIT ${limit + 1}
      ) m
      LEFT JOIN users u ON u.id = m.created_by_id
      ORDER BY m.id ASC`
  }

  const { rows } = await read(query)
  return rows as DirectMessage[]
}

export async function getConversationParticipants(
  conversationId: string,
  options?: { after?: SimpleCursor; limit?: number },
): Promise<ConversationParticipant[]> {
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 100))
  const query = sql`/* getConversationParticipants */
    SELECT cp.id, cp.conversation_id, cp.user_id, cp.role, cp.created_at, cp.removed_at,
           CASE WHEN u.deleted_at IS NULL THEN u.username END AS username,
           CASE WHEN u.deleted_at IS NULL THEN u.profile_image_id END AS profile_image_id
    FROM conversation_participants cp
    LEFT JOIN users u ON u.id = cp.user_id
    WHERE cp.conversation_id = ${conversationId}
      AND cp.removed_at IS NULL
  `
  if (options?.after) query.append(sql` AND cp.id > ${options.after.id}`)
  query.append(sql` ORDER BY cp.id ASC LIMIT ${limit + 1}`)
  const { rows } = await read(query)
  return rows as ConversationParticipant[]
}

export async function getConversationForThread(
  currentUserId: string,
  conversationId: string,
): Promise<(DirectConversation & { participant_add_policy: 'owner_only' | 'all_members' }) | null> {
  const { rows } = await read(sql`/* getConversationForThread */
    SELECT c.id, c.channel_type, c.title, c.created_at, c.created_by_id, c.updated_at,
           c.participant_add_policy
    FROM conversations c
    JOIN conversation_participants cp
      ON cp.conversation_id = c.id
      AND cp.user_id = ${currentUserId}
      AND cp.removed_at IS NULL
    WHERE c.id = ${conversationId}
      AND c.channel_type = 'direct_message'
      AND c.deleted_at IS NULL
    LIMIT 1
  `)
  return (
    (rows[0] as
      | (DirectConversation & { participant_add_policy: 'owner_only' | 'all_members' })
      | undefined) ?? null
  )
}
