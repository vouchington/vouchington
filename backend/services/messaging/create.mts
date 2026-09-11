import { read, write, beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueOnConversationMessageCreated } from '@queues/entity-listeners/enqueues'
import type { DirectConversation, DirectMessage } from './types.mts'
import createHttpError from 'http-errors'

export async function findOrCreateDirectConversation(
  currentUserId: string,
  recipientUserId: string,
): Promise<DirectConversation> {
  // Optimistic read before acquiring the lock
  const existing = await findDirectConversation(currentUserId, recipientUserId)
  if (existing) return existing

  await using transaction = await beginTransaction()
  async function findOrCreateConversationInTransaction(query: typeof transaction) {
    // Serialize concurrent creates on the same user pair via an advisory transaction lock.
    const lockKey = [currentUserId, recipientUserId].sort().join(':')
    await query(
      sql`/* findOrCreateDirectConversation:lock */ SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`,
    )

    // Re-check inside the transaction now that the lock is held
    const { rows: recheckRows } = await query(sql`/* findOrCreateDirectConversation:recheck */
      SELECT c.id, c.channel_type, c.title, c.created_at, c.created_by_id, c.updated_at
      FROM conversations c
      WHERE c.channel_type = 'direct_message'
        AND c.deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM conversation_participants p1
          WHERE p1.conversation_id = c.id AND p1.user_id = ${currentUserId} AND p1.removed_at IS NULL
        )
        AND EXISTS (
          SELECT 1 FROM conversation_participants p2
          WHERE p2.conversation_id = c.id AND p2.user_id = ${recipientUserId} AND p2.removed_at IS NULL
        )
        AND (
          SELECT COUNT(*) FROM conversation_participants p3
          WHERE p3.conversation_id = c.id AND p3.removed_at IS NULL
        ) = 2
      LIMIT 1
    `)
    if (recheckRows[0]) return recheckRows[0] as DirectConversation

    const { rows: convRows } = await query(sql`/* findOrCreateDirectConversation */
      INSERT INTO conversations (channel_type, title, created_by_id)
      VALUES ('direct_message', '', ${currentUserId})
      RETURNING id, channel_type, title, created_at, created_by_id, updated_at
    `)
    const conversation = convRows[0] as DirectConversation

    await query(sql`/* findOrCreateDirectConversation:participants */
      INSERT INTO conversation_participants (conversation_id, user_id, role)
      VALUES
        (${conversation.id}, ${currentUserId}, 'owner'),
        (${conversation.id}, ${recipientUserId}, 'member')
    `)

    return conversation
  }
  const result = await findOrCreateConversationInTransaction(transaction)
  await transaction.commit()
  return result
}

async function findDirectConversation(
  userId1: string,
  userId2: string,
): Promise<DirectConversation | null> {
  const { rows } = await read(sql`/* findDirectConversation */
    SELECT c.id, c.channel_type, c.title, c.created_at, c.created_by_id, c.updated_at
    FROM conversations c
    WHERE c.channel_type = 'direct_message'
      AND c.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM conversation_participants p1
        WHERE p1.conversation_id = c.id
          AND p1.user_id = ${userId1}
          AND p1.removed_at IS NULL
      )
      AND EXISTS (
        SELECT 1 FROM conversation_participants p2
        WHERE p2.conversation_id = c.id
          AND p2.user_id = ${userId2}
          AND p2.removed_at IS NULL
      )
      AND (
        SELECT COUNT(*) FROM conversation_participants p3
        WHERE p3.conversation_id = c.id
          AND p3.removed_at IS NULL
      ) = 2
    LIMIT 1
  `)
  return (rows[0] as DirectConversation | undefined) ?? null
}

export async function createGroupConversation(
  currentUserId: string,
  recipientUserIds: string[],
): Promise<DirectConversation> {
  if (recipientUserIds.length < 1) {
    throw new Error('createGroupConversation requires at least one recipient')
  }
  await using query = await beginTransaction()
  const { rows: convRows } = await query(sql`/* createGroupConversation */
      INSERT INTO conversations (channel_type, title, created_by_id)
      VALUES ('direct_message', '', ${currentUserId})
      RETURNING id, channel_type, title, created_at, created_by_id, updated_at
    `)
  const conversation = convRows[0] as DirectConversation

  const participantSql = sql`/* createGroupConversation:participants */
      INSERT INTO conversation_participants (conversation_id, user_id, role)
      VALUES (${conversation.id}, ${currentUserId}, 'owner')`
  for (const recipientId of recipientUserIds) {
    participantSql.append(sql`, (${conversation.id}, ${recipientId}, 'member')`)
  }

  await query(participantSql)
  await query.commit()
  return conversation
}

export async function createConversationMessage(
  currentUserId: string,
  conversationId: string,
  bodyText: string,
): Promise<DirectMessage> {
  // CTE atomically guards participant membership, inserts message, and bumps updated_at.
  const { rows } = await write(sql`/* createConversationMessage */
    WITH participant_check AS (
      SELECT 1 FROM conversation_participants
      WHERE conversation_id = ${conversationId}
        AND user_id = ${currentUserId}
        AND removed_at IS NULL
    ),
    new_message AS (
      INSERT INTO conversation_messages (conversation_id, kind, body_text, created_by_id)
      SELECT ${conversationId}, 'message', ${bodyText}, ${currentUserId}
      WHERE EXISTS (SELECT 1 FROM participant_check)
      RETURNING id, conversation_id, body_text, created_by_id, created_at, updated_at, deleted_at
    ),
    touch_conversation AS (
      UPDATE conversations SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ${conversationId} AND EXISTS (SELECT 1 FROM participant_check)
    )
    SELECT * FROM new_message
  `)
  const message = rows[0] as DirectMessage | undefined
  if (!message) throw createHttpError(403, 'Not a participant')

  void enqueueOnConversationMessageCreated(conversationId, message.id, currentUserId)

  return message
}
