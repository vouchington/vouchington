import { write, beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'
import { anyPairAmongUsersBlockedOrMuted } from '@services/entity-relations/check-block-mute'
import {
  currentUserCanManageParticipants,
  currentUserCanChangeParticipantPolicy,
  currentUserCanMessageUser,
} from './authorization.mts'
import type { ConversationParticipant } from './types.mts'

export async function addConversationParticipant(
  currentUserId: string,
  conversationId: string,
  newUserId: string,
): Promise<ConversationParticipant> {
  const canManage = await currentUserCanManageParticipants(currentUserId, conversationId)
  if (!canManage) throw createHttpError(403, 'Access denied')

  await using query = await beginTransaction()
  const { rows: participantRows } = await query(sql`/* addConversationParticipant:participants */
      SELECT user_id FROM conversation_participants
      WHERE conversation_id = ${conversationId}
        AND removed_at IS NULL
        AND user_id IS NOT NULL
    `)
  const currentParticipantIds = (participantRows as Array<{ user_id: string }>).map(r => r.user_id)

  if (currentParticipantIds.length >= 26) {
    throw createHttpError(400, 'Conversation has reached the maximum of 26 participants')
  }

  if (currentParticipantIds.includes(newUserId)) {
    throw createHttpError(409, 'User is already a participant')
  }

  const { rows: newUserRows } = await query(sql`/* addConversationParticipant:check_user */
      SELECT id, direct_messages_audience FROM users
      WHERE id = ${newUserId} AND deleted_at IS NULL
      LIMIT 1
    `)
  const newUser = (newUserRows as Array<{ id: string; direct_messages_audience: string }>)[0]
  if (!newUser) throw createHttpError(404, 'User not found')

  const canMessage = await currentUserCanMessageUser(currentUserId, newUserId, newUser)
  if (!canMessage) throw createHttpError(403, 'This user does not accept messages from you')

  if (await anyPairAmongUsersBlockedOrMuted([...currentParticipantIds, newUserId])) {
    throw createHttpError(403, 'Cannot add a blocked or muted user')
  }

  const { rows } = await query(sql`/* addConversationParticipant */
      WITH inserted AS (
        INSERT INTO conversation_participants (conversation_id, user_id, role)
        VALUES (${conversationId}, ${newUserId}, 'member')
        RETURNING id, conversation_id, user_id, role, created_at, removed_at
      )
      SELECT i.*, u.username, u.profile_image_id
      FROM inserted i
      LEFT JOIN users u ON u.id = i.user_id
    `)
  await query(sql`/* addConversationParticipant:bump_updated_at */
      UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ${conversationId}
    `)
  const result = rows[0] as ConversationParticipant
  await query.commit()
  return result
}

export async function removeConversationParticipant(
  currentUserId: string,
  conversationId: string,
  targetUserId: string,
): Promise<void> {
  await using query = await beginTransaction()
  const { rows } = await query(sql`/* removeConversationParticipant:check_owner */
      SELECT created_by_id FROM conversations
      WHERE id = ${conversationId}
        AND channel_type = 'direct_message'
        AND deleted_at IS NULL
      LIMIT 1
    `)
  const conv = rows[0] as { created_by_id: string | null } | undefined
  if (!conv) throw createHttpError(404, 'Conversation not found')

  if (targetUserId === currentUserId) {
    if (conv.created_by_id === currentUserId) {
      throw createHttpError(403, 'Owner cannot leave the conversation')
    }
    await query(sql`/* removeConversationParticipant:self_leave */
        UPDATE conversation_participants
        SET removed_at = CURRENT_TIMESTAMP, removed_by_id = ${currentUserId}
        WHERE conversation_id = ${conversationId}
          AND user_id = ${currentUserId}
          AND removed_at IS NULL
      `)
  } else {
    if (conv.created_by_id !== currentUserId) {
      throw createHttpError(403, 'Only the owner can remove other participants')
    }
    const { rowCount } = await query(sql`/* removeConversationParticipant */
        UPDATE conversation_participants
        SET removed_at = CURRENT_TIMESTAMP, removed_by_id = ${currentUserId}
        WHERE conversation_id = ${conversationId}
          AND user_id = ${targetUserId}
          AND removed_at IS NULL
      `)
    if (rowCount === 0) throw createHttpError(404, 'Participant not found')
  }

  await query(sql`/* removeConversationParticipant:bump_updated_at */
      UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ${conversationId}
    `)
  await query.commit()
}

export async function updateConversationParticipantAddPolicy(
  currentUserId: string,
  conversationId: string,
  policy: 'owner_only' | 'all_members',
): Promise<void> {
  const canChange = await currentUserCanChangeParticipantPolicy(currentUserId, conversationId)
  if (!canChange) throw createHttpError(403, 'Only the owner can change participant policy')

  await write(sql`/* updateConversationParticipantAddPolicy */
    UPDATE conversations
    SET participant_add_policy = ${policy}
    WHERE id = ${conversationId}
  `)
}
