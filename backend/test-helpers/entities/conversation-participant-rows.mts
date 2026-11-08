import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function getTestConversationParticipantId(
  conversationId: string,
  userId: string,
): Promise<string | null> {
  const { rows } = await write<{ id: string }>(sql`/* getTestConversationParticipantId */
    SELECT id FROM conversation_participants
    WHERE conversation_id = ${conversationId} AND user_id = ${userId}
  `)
  return rows[0]?.id ?? null
}

type CreateTestModInternalConversationOptions = {
  communityId: string
  createdById: string
  moderationReportId: string
  participantUserIds: readonly string[]
}

/** Staff-only thread fixture. Every participant row is stored as admin. */
export async function createTestModInternalConversation(
  options: CreateTestModInternalConversationOptions,
): Promise<{ id: string }> {
  const { rows } = await write<{ id: string }>(sql`/* createTestModInternalConversation */
    INSERT INTO conversations (channel_type, community_id, moderation_report_id, created_by_id)
    VALUES ('mod_internal', ${options.communityId}, ${options.moderationReportId}, ${options.createdById})
    RETURNING id
  `)
  const conversationId = rows[0]?.id
  if (!conversationId) throw new Error('fixture conversation missing')
  const participantUserIds = [...options.participantUserIds]
  await write(sql`/* createTestModInternalConversation:participants */
    INSERT INTO conversation_participants (conversation_id, user_id, role, participant_slot)
    SELECT ${conversationId}::uuid, participant.user_id, 'admin'::conversation_participant_roles,
      participant.ordinal::smallint
    FROM UNNEST(${participantUserIds}::uuid[]) WITH ORDINALITY AS participant(user_id, ordinal)
  `)
  return { id: conversationId }
}

/** Counts every participant row, including removals. */
export async function countTestConversationParticipantRows(
  conversationId: string,
): Promise<number> {
  const { rows } = await write<{ count: number }>(sql`/* countTestConversationParticipantRows */
    SELECT count(*)::int AS count
    FROM conversation_participants
    WHERE conversation_id = ${conversationId}
  `)
  return rows[0]?.count ?? 0
}
