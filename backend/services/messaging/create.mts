import { read, write, beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { enqueueOnConversationMessageCreated } from '@queues/entity-listeners/enqueues'
import { awaitReportedEnqueueAdmission } from '@queues/background/enqueues'
import type { DirectConversation, DirectMessage } from './types.mts'
import createHttpError from 'http-errors'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { admitConversationParticipants } from './participant-admission.mts'
import { conversationMessageInsert } from './conversation-message-insert.mts'
import { createModInternalMessageForLiveStaff } from './create-mod-internal-message.mts'
import { createMessageWithAdmission } from './create-message-with-admission.mts'

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
    const lockKey = [currentUserId, recipientUserId].toSorted().join(':')
    await query(
      sql`/* findOrCreateDirectConversation:lock */ SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`,
    )

    // Re-check inside the transaction now that the lock is held
    const { rows: recheckRows } =
      await query<DirectConversation>(sql`/* findOrCreateDirectConversation:recheck */
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
    if (recheckRows[0]) return recheckRows[0]

    const { rows: convRows } =
      await query<DirectConversation>(sql`/* findOrCreateDirectConversation */
      INSERT INTO conversations (channel_type, title, created_by_id)
      VALUES ('direct_message', '', ${currentUserId})
      RETURNING id, channel_type, title, created_at, created_by_id, updated_at
    `)
    const conversation = convRows[0]

    await admitConversationParticipants(query, conversation.id, [
      { userId: currentUserId, role: 'owner' },
      { userId: recipientUserId, role: 'member' },
    ])

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
  const { rows } = await read<DirectConversation>(sql`/* findDirectConversation */
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
  return rows[0] ?? null
}

export async function createGroupConversation(
  currentUserId: string,
  recipientUserIds: string[],
): Promise<DirectConversation> {
  if (recipientUserIds.length < 1) {
    throw new Error('createGroupConversation requires at least one recipient')
  }
  await using query = await beginTransaction()
  const { rows: convRows } = await query<DirectConversation>(sql`/* createGroupConversation */
      INSERT INTO conversations (channel_type, title, created_by_id)
      VALUES ('direct_message', '', ${currentUserId})
      RETURNING id, channel_type, title, created_at, created_by_id, updated_at
    `)
  const conversation = convRows[0]

  await admitConversationParticipants(query, conversation.id, [
    { userId: currentUserId, role: 'owner' },
    ...recipientUserIds.map(userId => ({ userId, role: 'member' as const })),
  ])
  await query.commit()
  return conversation
}

export async function createConversationMessage(
  currentUserId: string,
  provenance: ContentProvenance,
  conversationId: string,
  bodyText: string,
  options?: {
    observedTime?: Date | null
    /** Run admission in the same transaction as the message insert. */
    beforeInsert?: (query: TransactionQuery) => Promise<void>
  },
): Promise<DirectMessage> {
  assertObservedTime(options?.observedTime)
  const message = options?.beforeInsert
    ? await createMessageWithAdmission(
        currentUserId,
        provenance,
        conversationId,
        bodyText,
        options.beforeInsert,
      )
    : await createMessageWithExistingParticipant(
        currentUserId,
        provenance,
        conversationId,
        bodyText,
        options?.observedTime,
      )
  if (!message) throw createHttpError(403, 'Not a participant')

  await awaitReportedEnqueueAdmission(() =>
    enqueueOnConversationMessageCreated(conversationId, message.id, currentUserId),
  )

  return message
}

async function createMessageWithExistingParticipant(
  currentUserId: string,
  provenance: ContentProvenance,
  conversationId: string,
  bodyText: string,
  observedTime?: Date | null,
): Promise<DirectMessage | undefined> {
  // Direct messages use the single-statement participant check. Mod-internal messages
  // retain their existing live-staff fallback.
  const { rows } = await write<DirectMessage>(
    conversationMessageInsert(currentUserId, provenance, conversationId, bodyText),
  )
  return (
    rows[0] ??
    (await createModInternalMessageForLiveStaff(
      currentUserId,
      provenance,
      conversationId,
      bodyText,
      observedTime,
    )) ??
    undefined
  )
}

function assertObservedTime(observedTime: Date | null | undefined): void {
  if (observedTime == null) return
  if (!Number.isFinite(observedTime.getTime())) {
    throw new RangeError('Moderation vacation clock must return a valid Date')
  }
}
